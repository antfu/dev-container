export interface Service {
  name: string
  state: string
  health?: string
}

export interface Stats {
  service: string
  cpuPercent: number
  memory: string
}

export interface Link {
  name: string
  url: string
}

export interface NetworkRequest {
  time: string
  service: string
  scheme: string
  host: string
  port: number
  method: string
  path: string
  outcome: 'allowed' | 'blocked'
  status?: number
  code?: string
  why?: string
  injected: string[]
}

/** The requests to one host and port, as one row of the network panel. */
export interface HostSummary {
  key: string
  host: string
  port: number
  services: string[]
  allowed: number
  blocked: number
  lastSeen: string
  requests: NetworkRequest[]
}
