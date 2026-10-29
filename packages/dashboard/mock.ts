import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const SERVICES = [
  {
    name: 'claude',
    state: 'running',
    health: 'healthy',
    status: 'Up 2 hours',
  },
  {
    name: 'codex',
    state: 'running',
    health: 'healthy',
    status: 'Up 2 hours',
  },
  { name: 'gateway', state: 'running', status: 'Up 3 days' },
  {
    name: 'broker',
    state: 'running',
    health: 'starting',
    status: 'Up 5 seconds',
  },
  { name: 'skills', state: 'exited', status: 'Exited (0) 1 hour ago' },
]

const HOSTS = [
  [
    'claude',
    'api.anthropic.com',
    'allowed',
    200,
  ],
  ['claude', 'github.com', 'allowed', 200],
  [
    'codex',
    'api.openai.com',
    'allowed',
    200,
  ],
  [
    'codex',
    'registry.npmjs.org',
    'allowed',
    304,
  ],
  [
    'claude',
    'evil.example.com',
    'blocked',
    undefined,
  ],
  [
    'codex',
    'pastebin.com',
    'blocked',
    undefined,
  ],
] as const

const rand = (min: number, max: number): number => min + Math.random() * (max - min)

function stats(): unknown[] {
  return SERVICES.filter(s => s.state === 'running').map((s, i) => ({
    service: s.name,
    cpuPercent: +rand(0.2, 8 + i * 12).toFixed(2),
    memoryPercent: +rand(2, 10 + i * 8).toFixed(2),
    memory: `${Math.round(rand(100, 900))}MiB / 7.6GiB`,
    network: `${rand(0.1, 9).toFixed(1)}MB / ${Math.round(rand(50, 900))}kB`,
    block: `${rand(0, 50).toFixed(1)}MB / ${rand(0, 20).toFixed(1)}MB`,
    pids: Math.round(rand(4, 60)),
  }))
}

function requests(): unknown[] {
  return Array.from({ length: 80 }, (_, i) => {
    const [service, host, outcome, status] = HOSTS[Math.floor(Math.random() * HOSTS.length)]
    const blocked = outcome === 'blocked'
    return {
      time: new Date(Date.now() - i * 20_000).toISOString(),
      service,
      scheme: 'https',
      host,
      port: 443,
      method: blocked
        ? 'CONNECT'
        : ['GET', 'POST'][i % 2],
      path: blocked
        ? ''
        : `/v1/item/${i}`,
      outcome,
      status,
      code: blocked ? 'host-not-allowed' : undefined,
      why: blocked
        ? `${host} is not on the allow list.`
        : undefined,
      injected: !blocked && host.startsWith('api.')
        ? ['authorization']
        : [],
    }
  })
}

function logs(name: string): string[] {
  return Array.from({ length: 60 }, (_, i) => `${new Date(Date.now() - (60 - i) * 1000).toISOString()} [${name}] heartbeat ${i}`)
}

function route(method: string, path: string): unknown {
  if (method === 'POST')
    return {}
  if (path === '/info')
    return { daemon: true }
  if (path === '/upgrade') {
    return {
      behind: 3,
      commits: [
        { sha: 'a1b2c3d', subject: 'feat: show new commits in the dashboard' },
        { sha: 'e4f5a6b', subject: 'fix: keep the broker CA across restarts' },
        { sha: '7c8d9e0', subject: 'chore: bump dependencies' },
      ],
      run: { phase: 'idle' },
    }
  }
  if (path === '/services')
    return { services: SERVICES }
  if (path === '/stats') {
    return {
      stats: stats(),
    }
  }
  if (path === '/requests') {
    return {
      requests: requests(),
    }
  }
  if (path === '/links') {
    return {
      links: [
        { name: 'Claude web', url: 'https://claude.ai' },
        { name: 'Repository', url: 'https://github.com/antfu/dev-container' },
      ],
    }
  }
  const log = path.match(/^\/services\/([^/]+)\/logs$/)
  if (log) {
    return {
      lines: logs(log[1]),
    }
  }
  return undefined
}

/** Serves dummy API answers in `vite dev`, so the page works without `dev-container serve`. */
export function mockApi(): Plugin {
  return {
    name: 'dashboard-mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        // The browser asks for the credentials itself, then sends them with every request.
        if (!req.headers.authorization?.startsWith('Basic ')) {
          res.statusCode = 401
          res.setHeader('www-authenticate', 'Basic realm="dev-container dashboard (mock: any login works)"')
          return res.end()
        }
        const { pathname } = new URL(req.url ?? '/', 'http://localhost')
        const body = route(req.method ?? 'GET', pathname)
        if (body === undefined)
          return next()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
  }
}
