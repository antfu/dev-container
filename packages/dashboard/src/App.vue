<script setup lang="ts">
import type { Link, Service, Stats } from './types'
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import DaemonBanner from './components/DaemonBanner.vue'
import LoginForm from './components/LoginForm.vue'
import NetworkPanel from './components/NetworkPanel.vue'
import ServiceDetail from './components/ServiceDetail.vue'
import ServiceTable from './components/ServiceTable.vue'
import { api, OfflineError, setToken, token } from './composables/useApi'

const REFRESH_MS = 5000

const connected = ref(false)
/** The server does not answer; the page still renders and keeps trying. */
const offline = ref(false)
const daemon = ref(true)
const services = ref<Service[]>([])
const stats = ref<Record<string, Stats>>({})
const links = ref<Link[]>([])
const selected = ref('')
const error = ref('')
const busy = ref('')
const detail = useTemplateRef<InstanceType<typeof ServiceDetail>>('detail')
let linksLoaded = false
let timer: ReturnType<typeof setInterval>

async function refresh(): Promise<void> {
  if (!token.value) {
    // Without a token, an answer of any kind, even a refusal, shows the server is up.
    offline.value = await api('/info').then(() => false, e => e instanceof OfflineError)
    return
  }
  try {
    const [list, usage] = await Promise.all([
      api<{ services: Service[] }>('/services'),
      api<{ stats: Stats[] }>('/stats'),
    ])
    services.value = list.services
    stats.value = Object.fromEntries(usage.stats.map(s => [s.service, s]))
    connected.value = true
    offline.value = false
    daemon.value = (await api<{ daemon: boolean }>('/info')).daemon
    if (!linksLoaded) {
      links.value = (await api<{ links: Link[] }>('/links')).links
      linksLoaded = true
    }
    error.value = ''
    void detail.value?.load()
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

async function act(label: string, path: string): Promise<void> {
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

function connect(value: string): void {
  setToken(value)
  void refresh()
}

onMounted(() => {
  void refresh()
  timer = setInterval(refresh, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <LoginForm v-if="!connected && !offline" :error="error" @connect="connect" />
  <main v-else class="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-6">
    <header class="flex flex-wrap items-center gap-3">
      <h1 class="text-base font-semibold mr-auto">
        dev-container dashboard
      </h1>
      <span v-if="busy" class="text-sm text-muted">{{ busy }}</span>
      <button class="btn" :disabled="!!busy || offline || !daemon" title="Pull the git checkout, rebuild the images and restart; the daemon restarts itself" @click="act('Upgrading', '/upgrade')">
        Upgrade
      </button>
      <button class="btn" :disabled="!!busy || offline" @click="act('Updating all', '/update')">
        Update all
      </button>
      <button class="btn" :disabled="!!busy || offline" @click="act('Restarting all', '/restart')">
        Restart all
      </button>
    </header>
    <DaemonBanner v-if="offline || !daemon" :offline="offline" />
    <nav v-if="links.length" class="flex flex-wrap items-center gap-2 text-sm" aria-label="Tailscale links">
      <span class="label">Tailnet</span>
      <a v-for="l in links" :key="l.url" class="btn no-underline" :href="l.url" target="_blank" rel="noopener" :title="l.url">{{ l.name }}</a>
    </nav>
    <p v-if="error" class="m-0 px-3 py-2 rounded border border-bad text-sm text-bad">
      {{ error }}
    </p>
    <ServiceTable :services="services" :stats="stats" :selected="selected" :busy="!!busy || offline" @select="selected = $event" @act="act" />
    <NetworkPanel v-if="!offline" :services="services" />
    <ServiceDetail v-if="selected && !offline" ref="detail" :key="selected" :name="selected" />
  </main>
</template>
