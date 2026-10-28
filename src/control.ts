import type { ServerType } from '@hono/node-server'
import type { SSEStreamingApi } from 'hono/streaming'
import type { GitTarget } from './git'
import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { serve } from '@hono/node-server'
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { Diagnostic } from 'nostics'
import { diagnostics } from './diagnostics'
import { composeArgs, dockerFailure } from './docker'
import { disableSigning, enableSigning, publicKey, signingStatus } from './git'

const run = promisify(execFile)

/** The monitor page, built from `packages/monitor` into `dist/`; from source it sits one level up. */
function monitorHtml(): string {
  const built = ['./monitor.html', '../dist/monitor.html'].map(path => fileURLToPath(new URL(path, import.meta.url))).find(existsSync)
  return built ? readFileSync(built, 'utf8') : '<!doctype html><title>dev-container monitor</title><p>The monitor page is not built. Run `pnpm build`.'
}

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

const ContainerUser = z.string().regex(/^[\w.-]+$/).optional().openapi({ description: 'Container user that owns the keyring; defaults to the image user', example: 'node' })

const GpgStatus = z.object({
  installed: z.boolean(),
  signing: z.boolean(),
  keys: z.array(z.object({ fingerprint: z.string(), uid: z.string() })),
}).openapi('GpgStatus')

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

const DiagnosticBody = z.object({
  name: z.string().openapi({ example: 'DEV_CONTAINER_D4002' }),
  why: z.string(),
  fix: z.string().optional(),
  docs: z.string().optional(),
}).openapi('Diagnostic')
const failure = { 'application/json': { schema: DiagnosticBody } }
const errors = {
  400: { description: 'Invalid request (DEV_CONTAINER_D4004)', content: failure },
  401: { description: 'Missing or wrong token (DEV_CONTAINER_D4003)', content: failure },
  502: { description: 'Docker failed (DEV_CONTAINER_D4001, DEV_CONTAINER_D4002)', content: failure },
}
const ok = { 'application/json': { schema: z.object({ ok: z.literal(true) }) } }
const sse = (description: string): { 'text/event-stream': { schema: z.ZodString } } => ({ 'text/event-stream': { schema: z.string().openapi({ description }) } })

const routes = {
  services: createRoute({
    method: 'get',
    path: '/services',
    summary: 'List services with their state and health',
    responses: {
      200: { description: 'Services', content: { 'application/json': { schema: z.object({ services: z.array(Service) }) } } },
      ...errors,
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
      ...errors,
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
      ...errors,
    },
  }),
  restartAll: createRoute({
    method: 'post',
    path: '/restart',
    summary: 'Restart every service',
    responses: { 200: { description: 'Restarted', content: ok }, ...errors },
  }),
  updateAll: createRoute({
    method: 'post',
    path: '/update',
    summary: 'Pull base images, rebuild and recreate every service',
    responses: { 200: { description: 'Updated', content: ok }, ...errors },
  }),
  update: createRoute({
    method: 'post',
    path: '/services/{name}/update',
    summary: 'Pull the base image, rebuild and recreate one service',
    request: { params: z.object({ name: ServiceName }) },
    responses: { 200: { description: 'Updated', content: ok }, ...errors },
  }),
  gpgStatus: createRoute({
    method: 'get',
    path: '/services/{name}/gpg',
    summary: 'Whether commit signing is on in a service, and which secret keys it holds',
    request: { params: z.object({ name: ServiceName }), query: z.object({ user: ContainerUser }) },
    responses: { 200: { description: 'Signing status', content: { 'application/json': { schema: GpgStatus } } }, ...errors },
  }),
  gpgPublic: createRoute({
    method: 'get',
    path: '/services/{name}/gpg/public',
    summary: 'The armored public key of the signing key, to add to GitHub',
    request: { params: z.object({ name: ServiceName }), query: z.object({ user: ContainerUser }) },
    responses: { 200: { description: 'The key; empty when none is set up', content: { 'application/json': { schema: z.object({ publicKey: z.string() }) } } }, ...errors },
  }),
  gpgEnable: createRoute({
    method: 'post',
    path: '/services/{name}/gpg',
    summary: 'Import a private key into a service and turn on commit signing',
    request: {
      params: z.object({ name: ServiceName }),
      body: { content: { 'application/json': { schema: z.object({ privateKey: z.string().min(1), publicKey: z.string().optional(), user: ContainerUser }) } } },
    },
    responses: { 200: { description: 'Signing is on', content: { 'application/json': { schema: z.object({ ok: z.literal(true), fingerprint: z.string() }) } } }, ...errors },
  }),
  gpgDisable: createRoute({
    method: 'delete',
    path: '/services/{name}/gpg',
    summary: 'Turn commit signing off in a service; the key stays in its keyring',
    request: { params: z.object({ name: ServiceName }), query: z.object({ user: ContainerUser }) },
    responses: { 200: { description: 'Signing is off', content: ok }, ...errors },
  }),
  restart: createRoute({
    method: 'post',
    path: '/services/{name}/restart',
    summary: 'Restart one service',
    request: { params: z.object({ name: ServiceName }) },
    responses: { 200: { description: 'Restarted', content: ok }, ...errors },
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
      child.on('error', (error) => {
        void stream.writeSSE({ event: 'error', data: JSON.stringify(toBody(dockerFailure(error, docker))) }).then(resolve)
      })
      child.on('close', () => resolve())
    })
  }

  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success)
        return c.json(toBody(diagnostics.DEV_CONTAINER_D4004({ message: z.prettifyError(result.error) })), 400)
    },
  })

  // The page holds no secrets; the token goes with every API call it makes.
  app.get('/', c => c.html(monitorHtml()))

  const expected = Buffer.from(`Bearer ${token}`)
  app.use('*', async (c, next) => {
    if (c.req.path === '/' && c.req.method === 'GET')
      return next()
    const given = Buffer.from(c.req.header('authorization') ?? '')
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return c.json(toBody(diagnostics.DEV_CONTAINER_D4003()), 401)
    await next()
  })
  app.onError((error, c) => c.json(toBody(error instanceof Diagnostic ? error : dockerFailure(error, docker)), 502))

  app.openapi(routes.services, async c => c.json({ services: await listServices() }, 200))

  app.openapi(routes.stats, async (c) => {
    const services = (await listServices()).filter(s => s.state === 'running')
    const byContainer = new Map(services.map(s => [s.container, s.name]))
    const args = ['stats', '--format', '{{json .}}', ...byContainer.keys()]
    const toStats = (line: string): z.infer<typeof Stats> | undefined => {
      const json = line.match(/\{.*\}/)?.[0]
      return json ? parseStats(json, byContainer) : undefined
    }
    const stream = c.req.valid('query').stream === '1'
    // Without container names `docker stats` would report every container on the host.
    if (!services.length)
      return stream ? streamSSE(c, async () => {}) : c.json({ stats: [] }, 200)
    if (stream) {
      return streamSSE(c, stream => streamLines(stream, args, 'stats', (line) => {
        const stats = toStats(line)
        return stats && JSON.stringify(stats)
      }))
    }
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

  const update = async (service?: string): Promise<void> => {
    const only = service ? [service] : []
    await compose(['pull', '--ignore-buildable', '--ignore-pull-failures', ...only])
    await compose(['up', '-d', '--build', '--remove-orphans', ...only])
  }
  app.openapi(routes.updateAll, async (c) => {
    await update()
    return c.json({ ok: true as const }, 200)
  })
  app.openapi(routes.update, async (c) => {
    await update(c.req.valid('param').name)
    return c.json({ ok: true as const }, 200)
  })

  const target = (service: string, user?: string): GitTarget => ({ dir, service, user, docker })
  app.openapi(routes.gpgStatus, async c => c.json(await signingStatus(target(c.req.valid('param').name, c.req.valid('query').user)), 200))
  app.openapi(routes.gpgPublic, async c => c.json({ publicKey: await publicKey(target(c.req.valid('param').name, c.req.valid('query').user)) }, 200))
  app.openapi(routes.gpgEnable, async (c) => {
    const { privateKey, publicKey, user } = c.req.valid('json')
    const fingerprint = await enableSigning(target(c.req.valid('param').name, user), ...publicKey ? [privateKey, publicKey] : [privateKey])
    return c.json({ ok: true as const, fingerprint }, 200)
  })
  app.openapi(routes.gpgDisable, async (c) => {
    await disableSigning(target(c.req.valid('param').name, c.req.valid('query').user))
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

function toBody(diagnostic: Diagnostic): z.infer<typeof DiagnosticBody> {
  return { name: diagnostic.name, why: diagnostic.why, fix: diagnostic.fix, docs: diagnostic.docs }
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

/** Skips lines `docker stats` garbles while redrawing rather than failing the stream. */
function parseStats(json: string, byContainer: Map<string, string>): z.infer<typeof Stats> | undefined {
  let parsed
  try {
    parsed = StatsLine.safeParse(JSON.parse(json))
  }
  catch {
    return undefined
  }
  if (!parsed.success)
    return undefined
  const stats = parsed.data
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
