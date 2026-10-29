import { z } from 'zod'

/** One request the broker saw, allowed or blocked, as shown on the dashboard's network panel. */
export interface NetworkRequest {
  time: string
  /** The compose service that sent it; empty when the client address matches none. */
  service: string
  scheme: string
  host: string
  port: number
  method: string
  /** Without the query string. */
  path: string
  outcome: 'allowed' | 'blocked'
  /** The upstream status; absent for a blocked request. */
  status?: number
  /** The diagnostic code of a blocked request. */
  code?: string
  why?: string
  /** Secrets the broker swapped in. */
  injected: string[]
}

const Event = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('request'),
    client: z.string().default(''),
    scheme: z.string().default('https'),
    host: z.string(),
    port: z.number(),
    method: z.string(),
    path: z.string().default(''),
    status: z.number().default(0),
    injected: z.array(z.string()).default([]),
  }),
  z.object({
    event: z.literal('block'),
    client: z.string().default(''),
    scheme: z.string().default(''),
    host: z.string(),
    port: z.number(),
    method: z.string(),
    path: z.string().default(''),
    code: z.string(),
    why: z.string(),
  }),
])

/**
 * Reads the broker's JSON log lines, as printed by `docker compose logs --timestamps`. `serviceByIp`
 * names the sender. Lines that are not request events, such as `ready`, are skipped.
 */
export function parseRequests(output: string, serviceByIp: Map<string, string>): (NetworkRequest & { client: string })[] {
  const requests: (NetworkRequest & { client: string })[] = []
  for (const line of output.split('\n')) {
    const brace = line.indexOf('{')
    if (brace < 0)
      continue
    let json: unknown
    try {
      json = JSON.parse(line.slice(brace))
    }
    catch {
      continue
    }
    const parsed = Event.safeParse(json)
    if (!parsed.success)
      continue
    const event = parsed.data
    const base = {
      time: line.slice(0, brace).trim(),
      client: event.client,
      service: serviceByIp.get(event.client) ?? '',
      scheme: event.scheme,
      host: event.host,
      port: event.port,
      method: event.method,
      path: event.path,
    }
    requests.push(event.event === 'request'
      ? {
          ...base,
          outcome: 'allowed',
          status: event.status,
          injected: event.injected,
        }
      : {
          ...base,
          outcome: 'blocked',
          code: event.code,
          why: event.why,
          injected: [],
        })
  }
  return requests
}

const Inspect = z.array(z.object({
  Name: z.string(),
  NetworkSettings: z.object({
    Networks: z.record(z.string(), z.object({
      IPAddress: z.string(),
    })),
  }),
}))

/** Maps each container's addresses to its service, from `docker inspect` output. */
export function parseAddresses(json: string, serviceByContainer: Map<string, string>): Map<string, string> {
  const byIp = new Map<string, string>()
  for (const container of Inspect.parse(JSON.parse(json))) {
    const service = serviceByContainer.get(container.Name.replace(/^\//, ''))
    if (!service)
      continue
    for (const { IPAddress } of Object.values(container.NetworkSettings.Networks)) {
      if (IPAddress)
        byIp.set(IPAddress, service)
    }
  }
  return byIp
}
