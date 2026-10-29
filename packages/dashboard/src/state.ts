import type { Confirmation } from './composables/useConfirm'
import type { Link, NetworkRequest, Sample, Service, Stats, UpgradeStatus } from './types'
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
/** What the checkout is behind by, and the run in flight; set only when the daemon answers. */
export const upgradeStatus = ref<UpgradeStatus>()
/** An upgrade the page started and is still following, through the server's restart. */
export const upgrading = ref(false)
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
    if (daemon.value && !upgrading.value)
      upgradeStatus.value = await api<UpgradeStatus>('/upgrade')
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

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
/** How long the server may stay away while it restarts on the new code. */
const RECONNECT_MS = 3 * 60_000

/** Follows a started run once a second until it ends; the server going away and coming back is part of a deploy. */
async function followUpgrade(): Promise<void> {
  let away: number | undefined
  while (true) {
    await sleep(1000)
    try {
      const status = await api<UpgradeStatus>('/upgrade')
      away = undefined
      const { phase, error: why } = status.run
      if (phase === 'failed') {
        error.value = why ?? 'The upgrade failed.'
        return
      }
      // A fresh process after the restart has no run, and an up-to-date one has nothing to wait for.
      if (phase === 'idle' || phase === 'up-to-date')
        return
      upgradeStatus.value = status
    }
    catch (e) {
      if (!(e instanceof OfflineError)) {
        error.value = (e as Error).message
        return
      }
      away ??= Date.now()
      if (Date.now() - away > RECONNECT_MS) {
        error.value = 'The dashboard server did not come back after the upgrade. Check the daemon\'s log.'
        return
      }
    }
  }
}

export async function upgrade(): Promise<void> {
  const behind = upgradeStatus.value?.behind ?? 0
  if (!await confirm({
    title: 'Upgrade dev-container?',
    message: `${behind
      ? `Brings in ${behind} new ${behind === 1
        ? 'commit'
        : 'commits'}. `
      : ''}Pulls the git checkout, rebuilds the images and restarts the services; the daemon then restarts itself on the new code, and this page reconnects when it is back.`,
    action: 'Upgrade',
  })) {
    return
  }
  error.value = ''
  try {
    await api('/upgrade', { method: 'POST' })
  }
  catch (e) {
    error.value = (e as Error).message
    return
  }
  upgrading.value = true
  upgradeStatus.value = {
    ...upgradeStatus.value,
    run: { phase: 'pulling' },
  }
  await followUpgrade()
  upgrading.value = false
  await refresh()
}

export function connect(value: string): void {
  setToken(value)
  void refresh()
}
