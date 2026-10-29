import type { NetworkRequest } from '../packages/dashboard/src/types'
import { describe, expect, it } from 'vitest'
import { niceBytes, niceMax } from '../packages/dashboard/src/chart'
import { bin, requestTime } from '../packages/dashboard/src/network'
import { formatBytes, formatPercent, parsePair, record, total } from '../packages/dashboard/src/usage'

function request(time: string, outcome: NetworkRequest['outcome'] = 'allowed'): NetworkRequest {
  return {
    time,
    service: 'agent',
    scheme: 'https',
    host: 'example.com',
    port: 443,
    method: 'GET',
    path: '/',
    outcome,
    injected: [],
  }
}

describe('dashboard usage', () => {
  it('reads docker stats sizes in decimal and binary units', () => {
    expect(parsePair('120MiB / 7.6GiB')).toEqual([120 * 2 ** 20, 7.6 * 2 ** 30])
    expect(parsePair('1.2MB / 800kB')).toEqual([1.2e6, 800e3])
    expect(parsePair('0B / 0B')).toEqual([0, 0])
  })

  it('formats sizes and percentages', () => {
    expect(formatBytes(940 * 2 ** 20)).toBe('940 MiB')
    expect(formatBytes(1.5 * 2 ** 30)).toBe('1.5 GiB')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(4.25)).toBe('4.3%')
    expect(formatPercent(83.4)).toBe('83%')
  })

  it('keeps history only for services still reporting, and sums them per poll', () => {
    const stats = (service: string, cpu: number) => ({
      service,
      cpuPercent: cpu,
      memoryPercent: 1,
      memory: '1MiB / 1GiB',
      network: '',
      block: '',
      pids: 1,
    })
    let history = record({}, [
      stats('agent', 10),
      stats('broker', 2),
    ], 1)
    history = record(history, [
      stats('agent', 20),
    ], 2)
    expect(Object.keys(history)).toEqual(['agent'])
    expect(history.agent.map(s => s.cpu)).toEqual([10, 20])
    expect(total(record(history, [
      stats('agent', 1),
      stats('broker', 2),
    ], 3)).at(-1)).toMatchObject({ time: 3, cpu: 3, used: 2 * 2 ** 20 })
  })
})

describe('dashboard charts', () => {
  it('rounds axes up to clean numbers', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(37)).toBe(50)
    expect(niceMax(120)).toBe(200)
    expect(niceBytes(940 * 2 ** 20)).toBe(1000 * 2 ** 20)
    expect(niceBytes(300 * 2 ** 20)).toBe(500 * 2 ** 20)
  })

  it('reads the broker\'s nanosecond timestamps', () => {
    expect(requestTime(request('2026-10-29T09:00:00.123456789Z'))).toBe(Date.UTC(2026, 9, 29, 9, 0, 0, 123))
  })

  it('counts requests into time slices and drops the ones before the window', () => {
    const now = Date.UTC(2026, 9, 29, 10)
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
    const bins = bin([
      request(at(90)),
      request(at(55)),
      request(at(5), 'blocked'),
      request(at(1)),
    ], now, 60 * 60_000, 6)
    expect(bins.map(b => [b.allowed, b.blocked])).toEqual([
      [1, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [1, 1],
    ])
  })
})
