import type { ServerType } from '@hono/node-server'
import type { SSEStreamingApi } from 'hono/streaming'
import { execFile, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { serve } from '@hono/node-server'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { bearerAuth } from 'hono/bearer-auth'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { composeArgs } from './docker'

const run = promisify(execFile)

export interface ControlOptions {
  /** The `.dev-container` directory. */
  dir: string
  /** Bearer token every request must carry. */
  token: string
  /** Docker CLI binary. Defaults to `docker`. */
  docker?: string
}

const ServiceName = z.string().regex(/^[a-z0-9][\w-]*$/).openapi({ param: { name: 'name', in: 'path' }, example: 'agent' })
const Flag = z.enum(['0', '1']).optional()

const Service = z.object({
  name: z.string(),
  container: z.string(),
  state: z.string().openapi({ example: 'running' }),
  health: z.string().openapi({ description: 'Empty when the service has no healthcheck', example: 'healthy' }),
  status: z.string().openapi({ example: 'Up 2 minutes' }),
}).openapi('Service')

const Stats = z.object({
  service: z.string(),
  container: z.string(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  memory: z.string().openapi({ example: '120MiB / 7.6GiB' }),
  network: z.string().openapi({ example: '1.2MB / 800kB' }),
  block: z.string(),
  pids: z.number(),
}).openapi('Stats')

const Failure = z.object({ error: z.string() }).openapi('Failure')
const failure = { 'application/json': { schema: Failure } }
const ok = { 'application/json': { schema: z.object({ ok: z.literal(true) }) } }
const sse = (description: string): { 'text/event-stream': { schema: z.ZodString } } => ({ 'text/event-stream': { schema: z.string().openapi({ description }) } })

const routes = {
  services: createRoute({
    method: 'get',
    path: '/services',
    summary: 'List services with their state and health',
    responses: {
      200: { description: 'Services', content: { 'application/json': { schema: z.object({ services: z.array(Service) }) } } },
      502: { description: 'Docker failed', content: failure },
    },
  }),
  stats: createRoute({
    method: 'get',
    path: '/stats',
    summary: 'Resource usage per running service',
    request: { query: z.object({ stream: Flag }) },
    responses: {
      200: {
        description: 'A snapshot, or with `stream=1` one `stats` event per container per tick',
        content: { 'application/json': { schema: z.object({ stats: z.array(Stats) }) }, ...sse('`stats` events carrying a Stats object') },
      },
      502: { description: 'Docker failed', content: failure },
    },
  }),
  logs: createRoute({
    method: 'get',
    path: '/services/{name}/logs',
    summary: 'Service logs',
    request: {
      params: z.object({ name: ServiceName }),
      query: z.object({ tail: z.coerce.number().int().min(0).default(100), follow: Flag }),
    },
    responses: {
      200: {
        description: 'The last lines, or with `follow=1` one `log` event per line',
        content: { 'application/json': { schema: z.object({ lines: z.array(z.string()) }) }, ...sse('`log` events carrying one line') },
      },
      502: { description: 'Docker failed', content: failure },
    },
  }),
  restartAll: createRoute({
    method: 'post',
    path: '/restart',
    summary: 'Restart every service',
    responses: { 200: { description: 'Restarted', content: ok }, 502: { description: 'Docker failed', content: failure } },
  }),
  restart: createRoute({
    method: 'post',
    path: '/services/{name}/restart',
    summary: 'Restart one service',
    request: { params: z.object({ name: ServiceName }) },
    responses: { 200: { description: 'Restarted', content: ok }, 502: { description: 'Docker failed', content: failure } },
  }),
}

type ServiceInfo = z.infer<typeof Service>

/** HTTP API over the generated stack: status, resource usage, logs and restarts. */
export function createControlApp({ dir, token, docker = 'docker' }: ControlOptions): OpenAPIHono {
  const compose = async (args: string[]): Promise<string> => (await run(docker, composeArgs(dir, args), { maxBuffer: 64 * 1024 * 1024 })).stdout
  const listServices = async (): Promise<ServiceInfo[]> => parseServices(await compose(['ps', '--all', '--format', 'json']))
  const streamLines = (stream: SSEStreamingApi, args: string[], event: string, transform: (line: string) => string | undefined): Promise<void> => {
    const child = spawn(docker, args, { stdio: ['ignore', 'pipe', 'ignore'] })
    stream.onAbort(() => {
      child.kill()
    })
    return new Promise<void>((resolve) => {
      createInterface({ input: child.stdout }).on('line', (line) => {
        const data = transform(line)
        if (data !== undefined)
          void stream.writeSSE({ event, data })
      })
      child.on('close', () => resolve())
    })
  }

  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json({ error: z.prettifyError(result.error) }, 400)
    },
  })

  app.use('*', bearerAuth({ token }))
  app.onError((error, c) => {
    if (error instanceof HTTPException)
      return error.getResponse()
    const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr.trim() : ''
    return c.json({ error: stderr || error.message }, 502)
  })

  app.openapi(routes.services, async c => c.json({ services: await listServices() }, 200))

  app.openapi(routes.stats, async (c) => {
    const services = (await listServices()).filter(s => s.state === 'running')
    const byContainer = new Map(services.map(s => [s.container, s.name]))
    const args = ['stats', '--format', '{{json .}}', ...byContainer.keys()]
    const toStats = (line: string): z.infer<typeof Stats> | undefined => {
      const json = line.match(/\{.*\}/)?.[0]
      return json ? parseStats(json, byContainer) : undefined
    }
    if (c.req.valid('query').stream === '1') {
      return streamSSE(c, stream => streamLines(stream, args, 'stats', (line) => {
        const stats = toStats(line)
        return stats && JSON.stringify(stats)
      }))
    }
    if (!services.length)
      return c.json({ stats: [] }, 200)
    const { stdout } = await run(docker, ['stats', '--no-stream', ...args.slice(1)])
    return c.json({ stats: stdout.split('\n').map(toStats).filter(s => s !== undefined) }, 200)
  })

  app.openapi(routes.logs, async (c) => {
    const { name } = c.req.valid('param')
    const { tail, follow } = c.req.valid('query')
    const args = ['logs', '--no-color', '--no-log-prefix', '--tail', String(tail), name]
    if (follow === '1')
      return streamSSE(c, stream => streamLines(stream, composeArgs(dir, ['logs', '--follow', ...args.slice(1)]), 'log', line => line))
    const stdout = await compose(args)
    return c.json({ lines: stdout.split('\n').filter(Boolean) }, 200)
  })

  app.openapi(routes.restartAll, async (c) => {
    await compose(['restart'])
    return c.json({ ok: true as const }, 200)
  })

  app.openapi(routes.restart, async (c) => {
    await compose(['restart', c.req.valid('param').name])
    return c.json({ ok: true as const }, 200)
  })

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer' })
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'dev-container control API', version: '1' },
    security: [{ bearer: [] }],
  })

  return app
}

export interface ServeControlOptions extends ControlOptions {
  /** Defaults to `127.0.0.1`. */
  hostname?: string
  port: number
}

/** Serves the control API over HTTP. */
export function serveControl({ hostname = '127.0.0.1', port, ...options }: ServeControlOptions): ServerType {
  return serve({ fetch: createControlApp(options).fetch, hostname, port })
}

const PsLine = z.object({ Service: z.string(), Name: z.string(), State: z.string(), Health: z.string().default(''), Status: z.string() })

/** `docker compose ps --format json` prints one object per line on current versions and an array on older ones. */
function parseServices(stdout: string): ServiceInfo[] {
  const text = stdout.trim()
  if (!text)
    return []
  const rows = z.array(PsLine).parse(text.startsWith('[') ? JSON.parse(text) : text.split('\n').map(line => JSON.parse(line)))
  return rows.map(ps => ({ name: ps.Service, container: ps.Name, state: ps.State, health: ps.Health, status: ps.Status }))
}

const StatsLine = z.object({
  Name: z.string(),
  CPUPerc: z.string(),
  MemPerc: z.string(),
  MemUsage: z.string(),
  NetIO: z.string(),
  BlockIO: z.string(),
  PIDs: z.string(),
})

function parseStats(json: string, byContainer: Map<string, string>): z.infer<typeof Stats> | undefined {
  const stats = StatsLine.parse(JSON.parse(json))
  const service = byContainer.get(stats.Name)
  if (!service)
    return undefined
  return {
    service,
    container: stats.Name,
    cpuPercent: Number.parseFloat(stats.CPUPerc) || 0,
    memoryPercent: Number.parseFloat(stats.MemPerc) || 0,
    memory: stats.MemUsage,
    network: stats.NetIO,
    block: stats.BlockIO,
    pids: Number.parseInt(stats.PIDs) || 0,
  }
}
