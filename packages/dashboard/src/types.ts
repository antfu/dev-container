export interface Service {
  name: string
  state: string
  health?: string
  /** Like `Up 2 minutes`. */
  status?: string
}

export interface Stats {
  service: string
  cpuPercent: number
  memoryPercent: number
  /** Used and limit, like `120MiB / 7.6GiB`. */
  memory: string
  /** Received and sent, like `1.2MB / 800kB`. */
  network: string
  /** Read and written. */
  block: string
  pids: number
}

/** One poll of a service's usage, kept for the charts. */
export interface Sample {
  time: number
  cpu: number
  memory: number
  /** Memory in use, in bytes. */
  used: number
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
