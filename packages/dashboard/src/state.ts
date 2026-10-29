import type { Confirmation } from './composables/useConfirm'
import type { Link, NetworkRequest, Sample, Service, Stats } from './types'
import { ref } from 'vue'
import { api, OfflineError, setToken, token } from './composables/useApi'
import { confirm } from './composables/useConfirm'
import { record } from './usage'

export const REFRESH_MS = 5000

export const connected = ref(false)
/** The server does not answer; the page still renders and keeps trying. */
export const offline = ref(false)
export const daemon = ref(true)
export const services = ref<Service[]>([])
export const stats = ref<Record<string, Stats>>({})
/** Recent usage per service, gathered by this page since it opened. */
export const history = ref<Record<string, Sample[]>>({})
export const links = ref<Link[]>([])
export const requests = ref<NetworkRequest[]>([])
export const requestsError = ref('')
/** When the data was last fetched; the charts measure their windows back from it. */
export const now = ref(Date.now())
export const error = ref('')
export const busy = ref('')
let linksLoaded = false

async function loadRequests(): Promise<void> {
  try {
    requests.value = (await api<{ requests: NetworkRequest[] }>('/requests?tail=1000')).requests
    requestsError.value = ''
  }
  catch (e) {
    requestsError.value = (e as Error).message
  }
}

export async function refresh(): Promise<void> {
  if (!token.value) {
    // Without a token, an answer of any kind, even a refusal, shows the server is up.
    offline.value = await api('/info').then(() => false, e => e instanceof OfflineError)
    return
  }
  try {
    const [list, usage] = await Promise.all([
      api<{ services: Service[] }>('/services'),
      api<{ stats: Stats[] }>('/stats'),
      loadRequests(),
    ])
    now.value = Date.now()
    services.value = list.services
    stats.value = Object.fromEntries(usage.stats.map(s => [s.service, s]))
    history.value = record(history.value, usage.stats, now.value)
    connected.value = true
    offline.value = false
    daemon.value = (await api<{ daemon: boolean }>('/info')).daemon
    if (!linksLoaded) {
      links.value = (await api<{ links: Link[] }>('/links')).links
      linksLoaded = true
    }
    error.value = ''
  }
  catch (e) {
    offline.value = e instanceof OfflineError
    if (offline.value) {
      error.value = ''
      return
    }
    if (!connected.value)
      setToken('')
    error.value = (e as Error).message
  }
}

async function act(label: string, path: string, question: Confirmation): Promise<void> {
  if (!await confirm(question))
    return
  busy.value = `${label}…`
  try {
    await api(path, { method: 'POST' })
    error.value = ''
  }
  catch (e) {
    error.value = (e as Error).message
  }
  busy.value = ''
  await refresh()
}

export function restartService(name: string): Promise<void> {
  return act(`${name}: restart`, `/services/${name}/restart`, {
    title: `Restart ${name}?`,
    message: 'The container stops and starts again. Whatever runs inside it is interrupted, including an agent in the middle of a task.',
    action: 'Restart',
  })
}

export function updateService(name: string): Promise<void> {
  return act(`${name}: update`, `/services/${name}/update`, {
    title: `Update ${name}?`,
    message: 'Pulls the base image, rebuilds and recreates the container. Anything not kept in a volume is lost, and whatever runs inside it is interrupted.',
    action: 'Update',
  })
}

export function restartAll(): Promise<void> {
  return act('Restarting all', '/restart', {
    title: 'Restart every service?',
    message: `All ${services.value.length} services stop and start again. Whatever runs inside them is interrupted.`,
    action: 'Restart all',
  })
}

export function updateAll(): Promise<void> {
  return act('Updating all', '/update', {
    title: 'Update every service?',
    message: 'Pulls the base images, rebuilds and recreates every service. Anything not kept in a volume is lost, and whatever runs inside the containers is interrupted.',
    action: 'Update all',
  })
}

export function upgrade(): Promise<void> {
  return act('Upgrading', '/upgrade', {
    title: 'Upgrade dev-container?',
    message: 'Pulls the git checkout, rebuilds the images and restarts the services; the daemon then restarts itself on the new code, and this page reconnects when it is back.',
    action: 'Upgrade',
  })
}

export function connect(value: string): void {
  setToken(value)
  void refresh()
}
