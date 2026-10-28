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

export interface GpgStatus {
  installed: boolean
  signing: boolean
  keys: { uid: string, fingerprint: string }[]
}

export interface Link {
  name: string
  url: string
}
