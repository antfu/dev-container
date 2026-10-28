import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createControlApp } from '../src'

const docker = fileURLToPath(new URL('fixtures/fake-docker.mjs', import.meta.url))
const auth = { headers: { Authorization: 'Bearer secret-token' } }

let tmp: string
const invocations = () => readFileSync(join(tmp, 'log'), 'utf8').trim().split('\n')
const app = () => createControlApp({ dir: '/stack/.dev-container', token: 'secret-token', docker })

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'dev-container-control-'))
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

describe('control API', () => {
  it('rejects requests without the token', async () => {
    const response = await app().request('/services')
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4003' })
    expect((await app().request('/services', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
  })

  it('lists services', async () => {
    const response = await app().request('/services', auth)
    expect(await response.json()).toEqual({
      services: [
        { name: 'broker', container: 'p-broker-1', state: 'running', health: 'healthy', status: 'Up 1 minute (healthy)' },
        { name: 'agent', container: 'p-agent-1', state: 'running', health: '', status: 'Up 1 minute' },
        { name: 'old', container: 'p-old-1', state: 'exited', health: '', status: 'Exited (0)' },
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
    expect(await response.json()).toEqual({ lines: ['first', 'second'] })
    expect(invocations()).toEqual(['compose -f /stack/.dev-container/compose.yml logs --no-color --no-log-prefix --tail 2 agent'])
  })

  it('follows logs and stops docker when the client disconnects', async () => {
    const response = await app().request('/services/agent/logs?follow=1', auth)
    const events = await readEvents(response, 2)
    expect(events).toEqual([{ event: 'log', data: 'line 0' }, { event: 'log', data: 'line 1' }])
    await waitForExit(Number(readFileSync(join(tmp, 'pid'), 'utf8')))
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
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4002', why: 'docker failed: no such service: missing', docs: expect.stringContaining('DEV_CONTAINER_D4002.md') })
  })

  it('reports a missing docker binary instead of crashing', async () => {
    const broken = createControlApp({ dir: '/stack/.dev-container', token: 'secret-token', docker: join(tmpdir(), 'no-such-docker') })
    const response = await broken.request('/services', auth)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4001' })
    const events = await readEvents(await broken.request('/services/agent/logs?follow=1', auth), 1)
    expect(events[0]).toMatchObject({ event: 'error', data: expect.stringContaining('DEV_CONTAINER_D4001') })
  })

  it('rejects service names that could be read as flags', async () => {
    const response = await app().request('/services/--all/restart', { method: 'POST', ...auth })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ name: 'DEV_CONTAINER_D4004' })
  })

  it('serves its OpenAPI document', async () => {
    const doc = z.object({ paths: z.record(z.string(), z.object({})), components: z.object({ securitySchemes: z.object({}).loose() }) })
      .parse(await (await app().request('/openapi.json', auth)).json())
    expect(Object.keys(doc.paths)).toEqual(['/services', '/stats', '/services/{name}/logs', '/restart', '/services/{name}/restart'])
    expect(doc.components.securitySchemes).toEqual({ bearer: { type: 'http', scheme: 'bearer' } })
  })
})
