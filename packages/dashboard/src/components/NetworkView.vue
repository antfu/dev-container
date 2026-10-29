<script setup lang="ts">
import type { HostSummary } from '../types'
import { computed, ref } from 'vue'
import { bin, requestTime, summarize } from '../network'
import { navigate, route } from '../route'
import { now, requests, requestsError, services } from '../state'
import HostPanel from './HostPanel.vue'
import NetworkHosts from './NetworkHosts.vue'
import RequestChart from './RequestChart.vue'
import UiPage from './ui/UiPage.vue'
import UiSection from './ui/UiSection.vue'
import UiSegmented from './ui/UiSegmented.vue'
import UiStat from './ui/UiStat.vue'

type Outcome = 'all' | 'blocked' | 'allowed'
const OUTCOMES = [
  { value: 'all', label: 'All' },
  { value: 'blocked', label: 'Denied' },
  { value: 'allowed', label: 'Allowed' },
] as const

type Range = '15m' | '1h' | '6h' | 'all'
const MINUTE = 60_000
/** The window each range covers, and how many columns the chart splits it into. */
const RANGES: Record<Range, { label: string, span?: number, bins: number }> = {
  '15m': { label: '15m', span: 15 * MINUTE, bins: 30 },
  '1h': { label: '1h', span: 60 * MINUTE, bins: 30 },
  '6h': { label: '6h', span: 360 * MINUTE, bins: 36 },
  'all': { label: 'All', bins: 40 },
}
const RANGE_OPTIONS = (Object.keys(RANGES) as Range[]).map(value => ({ value, label: RANGES[value].label }))

const service = ref('')
const outcome = ref<Outcome>('all')
const range = ref<Range>('1h')
const search = ref('')

/** The oldest request bounds the `All` range. */
const span = computed(() => {
  const fixed = RANGES[range.value].span
  if (fixed)
    return fixed
  const oldest = Math.min(...requests.value.map(requestTime).filter(Number.isFinite))
  return Number.isFinite(oldest)
    ? Math.max(MINUTE, now.value - oldest + 1)
    : 15 * MINUTE
})

// Every filter, the range included, scopes the chart, the figures and the table alike.
const filtered = computed(() => requests.value.filter(r =>
  (!service.value || r.service === service.value)
  && (outcome.value === 'all' || r.outcome === outcome.value)
  && (!search.value || `${r.host} ${r.path}`.toLowerCase().includes(search.value.toLowerCase()))
  && now.value - requestTime(r) <= span.value,
))
const bins = computed(() => bin(filtered.value, now.value, span.value, RANGES[range.value].bins))
const hosts = computed(() => summarize(filtered.value))
const everyHost = computed(() => summarize(requests.value))
const denied = computed(() => filtered.value.filter(r => r.outcome === 'blocked').length)
const injected = computed(() => filtered.value.filter(r => r.injected.length).length)

const selectedKey = computed(() => route.value.view === 'network'
  ? route.value.host ?? ''
  : '')
// The panel keeps showing a host that the filters now hide.
const selected = computed(() => everyHost.value.find(h => h.key === selectedKey.value))

function select(host: HostSummary): void {
  navigate({
    view: 'network',
    host: host.key === selectedKey.value
      ? undefined
      : host.key,
  })
}
</script>

<template>
  <UiPage>
    <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
      <UiSegmented v-model="range" :options="RANGE_OPTIONS" label="Time range" />
      <select v-model="service" class="field h-7 font-mono text-xs" aria-label="Service">
        <option value="">
          All services
        </option>
        <option v-for="s in services" :key="s.name" :value="s.name">
          {{ s.name }}
        </option>
      </select>
      <UiSegmented v-model="outcome" :options="OUTCOMES" label="Outcome" />
      <label class="relative flex-auto min-w-40">
        <span class="i-ph-magnifying-glass absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
        <input v-model="search" type="search" class="field h-7 w-full pl-7 font-mono text-xs" placeholder="Filter by host or path" aria-label="Filter">
      </label>
    </div>

    <div class="grid grid-cols-2 border-b border-line md:grid-cols-4">
      <UiStat label="Requests" :value="filtered.length.toLocaleString()" class="border-r border-line" />
      <UiStat label="Denied" :value="denied.toLocaleString()" :tone="denied ? 'bad' : undefined" :detail="filtered.length ? `${Math.round(denied / filtered.length * 100)}% of requests` : undefined" class="md:border-r border-line" />
      <UiStat label="Hosts" :value="hosts.length.toLocaleString()" class="border-r border-t md:border-t-0 border-line" />
      <UiStat label="With secrets" :value="injected.toLocaleString()" detail="injected by the broker" class="border-t md:border-t-0 border-line" />
    </div>

    <UiSection index="01" title="Traffic">
      <div class="px-4 py-3">
        <RequestChart :bins="bins" :height="180" />
      </div>
    </UiSection>

    <UiSection index="02" :title="`Hosts · ${hosts.length}`">
      <template #aside>
        <span class="flex-auto" />
        <span class="text-xs text-faint">Select a host to allow or block it</span>
      </template>
      <p v-if="requestsError" class="m-0 px-4 py-3 text-sm text-bad">
        {{ requestsError }}
      </p>
      <NetworkHosts v-else :hosts="hosts" :selected="selectedKey" @select="select" />
    </UiSection>
  </UiPage>

  <Transition
    enter-from-class="translate-x-full" leave-to-class="translate-x-full"
    enter-active-class="transition-transform duration-200" leave-active-class="transition-transform duration-150"
  >
    <HostPanel
      v-if="selected" :key="selected.key" :host="selected" :all="everyHost"
      class="fixed right-0 top-12 bottom-0 z-30 w-full border-l border-line sm:w-[30rem] shadow-[-24px_0_48px_-24px_rgb(0_0_0/0.25)]"
      @close="navigate({ view: 'network' })"
    />
  </Transition>
</template>
