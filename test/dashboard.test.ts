import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createDashboardApp } from '../src'

const docker = fileURLToPath(new URL('fixtures/fake-docker.mjs', import.meta.url))
const auth = {
  headers: { Authorization: 'Bearer secret-token' },
}

let tmp: string
const invocations = () => readFileSync(join(tmp, 'log'), 'utf8').trim().split('\n')
const app = () => createDashboardApp({ dir: '/stack/.dev-container', token: 'secret-token', docker })

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dev-container-dashboard-'))
  vi.stubEnv('FAKE_DOCKER_LOG', join(tmp, 'log'))
  vi.stubEnv('FAKE_DOCKER_PID', join(tmp, 'pid'))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Reads SSE events until `count` arrived, then disconnects like a client closing the tab. */
async function readEvents(response: Response, count: number) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
  let text = ''
  while (text.split('\n\n').length <= count)
    text += (await reader.read()).value
  await reader.cancel()
  return text.split('\n\n').slice(0, count).map(block => Object.fromEntries(block.split('\n').map(line => line.split(/: (.*)/s).slice(0, 2))))
}

async function waitForExit(pid: number) {
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), { timeout: 2000 })
}

describe('dashboard API', () => {
  it('lists the tailnet links', async () => {
    const links = [
      { name: 'agent:6767', url: 'https://agents.tail1234.ts.net' },
    ]
    const withLinks = createDashboardApp({
      dir: '/stack/.dev-container',
      token: 'secret-token',
      docker,
      links,
    })
    expect(await (await withLinks.request('/links', auth)).json()).toEqual({ links })
    expect(await (await app().request('/links', auth)).json()).toEqual({ links: [] })
    expect(await (await app().request('/info', auth)).json()).toEqual({ daemon: false })
    const daemon = createDashboardApp({
      dir: '/stack/.dev-container',
      token: 'secret-token',
      docker,
      upgrade: {
        status: async () => ({
          run: { phase: 'idle' },
        }),
        start: vi.fn(),
      },
    })
    expect(await (await daemon.request('/info', auth)).json()).toEqual({ daemon: true })
  })

  it('reports and starts the daemon\'s upgrade, and refuses without one', async () => {
    const status = {
      behind: 2,
      commits: [
        { sha: 'abc1234', subject: 'feat: x' },
      ],
      run: { phase: 'building' as const },
    }
    const upgrade = {
      status: vi.fn(async () => status),
      start: vi.fn(),
    }
    const withDaemon = createDashboardApp({
      dir: '/stack/.dev-container',
      token: 'secret-token',
      docker,
      upgrade,
    })
    expect(await (await withDaemon.request('/upgrade', auth)).json()).toEqual(status)
    const response = await withDaemon.request('/upgrade', { method: 'POST', ...auth })
    expect(await response.json()).toEqual({ ok: true })
    expect(upgrade.start).toHaveBeenCalledOnce()

    for (const init of [
      auth,
      { method: 'POST', ...auth },
    ]) {
      const refused = await app().request('/upgrade', init)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ name: 'DEV_CONTAINER_D4004' })
    }
  })

  it('rejects requests without the token', async () => {
    const response = await app().request('/services')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4003' })
    expect((await app().request('/services', {
      headers: { Authorization: 'Bearer wrong' },
    })).status).toBe(401)
  })

  it('lists services', async () => {
    const response = await app().request('/services', auth)
    expect(await response.json()).toEqual({
      services: [
        {
          name: 'broker',
          container: 'p-broker-1',
          state: 'running',
          health: 'healthy',
          status: 'Up 1 minute (healthy)',
        },
        {
          name: 'agent',
          container: 'p-agent-1',
          state: 'running',
          health: '',
          status: 'Up 1 minute',
        },
        {
          name: 'old',
          container: 'p-old-1',
          state: 'exited',
          health: '',
          status: 'Exited (0)',
        },
      ],
    })
  })

  it('reports stats for running services', async () => {
    const response = await app().request('/stats', auth)
    expect(await response.json()).toEqual({
      stats: ['broker', 'agent'].map(service => ({
        service,
        container: `p-${service}-1`,
        cpuPercent: 1.5,
        memoryPercent: 2.25,
        memory: '10MiB / 1GiB',
        network: '1kB / 2kB',
        block: '0B / 0B',
        pids: 7,
      })),
    })
  })

  it('streams stats and stops docker when the client disconnects', async () => {
    const response = await app().request('/stats?stream=1', auth)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    const events = await readEvents(response, 3)
    expect(events.map(e => e.event)).toEqual(['stats', 'stats', 'stats'])
    expect(JSON.parse(events[0]!.data!)).toMatchObject({ service: 'broker', cpuPercent: 1.5 })
    await waitForExit(Number(readFileSync(join(tmp, 'pid'), 'utf8')))
  })

  it('returns recent log lines', async () => {
    const response = await app().request('/services/agent/logs?tail=2', auth)
    expect(await response.json()).toEqual({
      lines: ['first', 'second'],
    })
    expect(invocations()).toEqual(['compose -f /stack/.dev-container/compose.yml logs --no-color --no-log-prefix --tail 2 agent'])
  })

  it('lists the broker\'s requests with the service that sent each', async () => {
    const response = await app().request('/requests?tail=50', auth)
    expect(await response.json()).toEqual({
      requests: [
        {
          time: '2026-10-29T09:00:01.000000000Z',
          service: 'agent',
          scheme: 'https',
          host: 'api.github.com',
          port: 443,
          method: 'GET',
          path: '/user',
          outcome: 'allowed',
          status: 200,
          injected: ['GITHUB_TOKEN'],
        },
        {
          time: '2026-10-29T09:00:02.000000000Z',
          service: 'agent',
          scheme: 'https',
          host: 'evil.example',
          port: 443,
          method: 'CONNECT',
          path: '',
          outcome: 'blocked',
          code: 'DEV_CONTAINER_B5001',
          why: 'Host evil.example is not on the egress allowlist.',
          injected: [],
        },
      ],
    })
    expect(invocations()).toContain('compose -f /stack/.dev-container/compose.yml logs --no-color --no-log-prefix --timestamps --tail 50 broker')
  })

  it('follows logs and stops docker when the client disconnects', async () => {
    const response = await app().request('/services/agent/logs?follow=1', auth)
    const events = await readEvents(response, 2)
    expect(events).toEqual([
      { event: 'log', data: 'line 0' },
      { event: 'log', data: 'line 1' },
    ])
    await waitForExit(Number(readFileSync(join(tmp, 'pid'), 'utf8')))
  })

  it('serves the dashboard page without a token, but nothing else', async () => {
    const page = await app().request('/')
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('dev-container dashboard')
    expect((await app().request('/services')).status).toBe(401)
  })

  it('updates one service or the whole stack by pulling, then rebuilding', async () => {
    expect(await (await app().request('/services/agent/update', { method: 'POST', ...auth })).json()).toEqual({ ok: true })
    expect(await (await app().request('/update', { method: 'POST', ...auth })).json()).toEqual({ ok: true })
    expect(invocations()).toEqual([
      'compose -f /stack/.dev-container/compose.yml pull --ignore-buildable --ignore-pull-failures agent',
      'compose -f /stack/.dev-container/compose.yml up -d --build --remove-orphans agent',
      'compose -f /stack/.dev-container/compose.yml pull --ignore-buildable --ignore-pull-failures',
      'compose -f /stack/.dev-container/compose.yml up -d --build --remove-orphans',
    ])
  })

  it('restarts one service or the whole stack', async () => {
    expect(await (await app().request('/services/agent/restart', { method: 'POST', ...auth })).json()).toEqual({ ok: true })
    expect(await (await app().request('/restart', { method: 'POST', ...auth })).json()).toEqual({ ok: true })
    expect(invocations()).toEqual([
      'compose -f /stack/.dev-container/compose.yml restart agent',
      'compose -f /stack/.dev-container/compose.yml restart',
    ])
  })

  it('surfaces docker errors', async () => {
    const response = await app().request('/services/missing/restart', { method: 'POST', ...auth })
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      name: 'DEV_CONTAINER_D4002',
      why: 'docker failed: no such service: missing',
      docs: expect.stringContaining('DEV_CONTAINER_D4002.md'),
    })
  })

  it('reports a missing docker binary instead of crashing', async () => {
    const broken = createDashboardApp({
      dir: '/stack/.dev-container',
      token: 'secret-token',
      docker: join(tmpdir(), 'no-such-docker'),
    })
    const response = await broken.request('/services', auth)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4001' })
    const events = await readEvents(await broken.request('/services/agent/logs?follow=1', auth), 1)
    expect(events[0]).toMatchObject({
      event: 'error',
      data: expect.stringContaining('DEV_CONTAINER_D4001'),
    })
  })

  it('rejects service names that could be read as flags', async () => {
    const response = await app().request('/services/--all/restart', { method: 'POST', ...auth })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4004' })
  })

  it('serves its OpenAPI document', async () => {
    const doc = z.object({
      paths: z.record(z.string(), z.object({})),
      components: z.object({
        securitySchemes: z.object({}).loose(),
      }),
    })
      .parse(await (await app().request('/openapi.json', auth)).json())
    expect(Object.keys(doc.paths)).toEqual([
      '/services',
      '/links',
      '/info',
      '/stats',
      '/requests',
      '/services/{name}/logs',
      '/restart',
      '/services/{name}/restart',
      '/update',
      '/upgrade',
      '/services/{name}/update',
    ])
    expect(doc.components.securitySchemes).toEqual({
      bearer: { type: 'http', scheme: 'bearer' },
    })
  })
})
