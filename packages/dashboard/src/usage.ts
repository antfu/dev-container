import type { Sample, Service, Stats } from './types'

/** Samples kept per service: five minutes at the page's refresh rate. */
const HISTORY = 60

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 2 ** 10,
  mib: 2 ** 20,
  gib: 2 ** 30,
  tib: 2 ** 40,
}

/** Reads a size as `docker stats` prints it, like `7.6GiB` or `800kB`. */
function parseBytes(text: string): number {
  const match = text.trim().match(/^([\d.]+)\s*([a-z]*)$/i)
  if (!match)
    return 0
  return Number(match[1]) * (UNITS[match[2].toLowerCase() || 'b'] ?? 1)
}

/** Splits a `docker stats` pair, like `120MiB / 7.6GiB`, into bytes. */
export function parsePair(text: string): [number, number] {
  const [a = '', b = ''] = text.split('/')
  return [
    parseBytes(a),
    parseBytes(b),
  ]
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 && unit
    ? value.toFixed(1)
    : Math.round(value)} ${units[unit]}`
}

export function formatPercent(value: number): string {
  return `${value > 0 && value < 10
    ? value.toFixed(1)
    : Math.round(value)}%`
}

/** Appends one poll to each service's history, dropping the oldest past the limit and services that stopped. */
export function record(history: Record<string, Sample[]>, stats: Stats[], time: number): Record<string, Sample[]> {
  return Object.fromEntries(stats.map(s => [
    s.service,
    [
      ...history[s.service] ?? [],
      {
        time,
        cpu: s.cpuPercent,
        memory: s.memoryPercent,
        used: parsePair(s.memory)[0],
      },
    ].slice(-HISTORY),
  ]))
}

/** The sum over services at each poll, for the overview's trends. */
export function total(history: Record<string, Sample[]>): Sample[] {
  const byTime = new Map<number, Sample>()
  for (const samples of Object.values(history)) {
    for (const sample of samples) {
      const sum = byTime.get(sample.time) ?? {
        time: sample.time,
        cpu: 0,
        memory: 0,
        used: 0,
      }
      sum.cpu += sample.cpu
      sum.memory += sample.memory
      sum.used += sample.used
      byTime.set(sample.time, sum)
    }
  }
  return [
    ...byTime.values(),
  ].sort((a, b) => a.time - b.time)
}

/** Neutral ink while there is room, then warning, then trouble. */
export function severity(percent: number): 'ok' | 'warn' | 'bad' {
  if (percent >= 90)
    return 'bad'
  return percent >= 70
    ? 'warn'
    : 'ok'
}

/** Running and healthy is fine, starting is a warning, anything else is trouble. */
export function serviceTone(service: Service): 'ok' | 'warn' | 'bad' {
  if (service.state !== 'running' || service.health === 'unhealthy')
    return 'bad'
  return service.health === 'starting'
    ? 'warn'
    : 'ok'
}
