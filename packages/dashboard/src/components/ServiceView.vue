<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { niceBytes } from '../chart'
import { api } from '../composables/useApi'
import { summarize } from '../network'
import { navigate } from '../route'
import { busy, history, offline, REFRESH_MS, requests, restartService, services, stats, updateService } from '../state'
import { formatBytes, formatPercent, parsePair } from '../usage'
import LineChart from './LineChart.vue'
import LogTerminal from './LogTerminal.vue'
import NetworkHosts from './NetworkHosts.vue'
import StateBadge from './StateBadge.vue'
import UiPage from './ui/UiPage.vue'
import UiSection from './ui/UiSection.vue'
import UiStat from './ui/UiStat.vue'

const props = defineProps<{ name: string }>()

const logs = ref<string[]>([])
let timer: ReturnType<typeof setInterval>

const service = computed(() => services.value.find(s => s.name === props.name))
const usage = computed(() => stats.value[props.name])
const samples = computed(() => history.value[props.name] ?? [])
const memory = computed(() => usage.value
  ? parsePair(usage.value.memory)
  : undefined)
const network = computed(() => usage.value
  ? parsePair(usage.value.network)
  : undefined)
const block = computed(() => usage.value
  ? parsePair(usage.value.block)
  : undefined)
const hosts = computed(() => summarize(requests.value.filter(r => r.service === props.name)))

async function load(): Promise<void> {
  if (offline.value)
    return
  try {
    const { lines } = await api<{ lines: string[] }>(`/services/${props.name}/logs?tail=200`)
    // The page polls, so an unchanged tail should not redraw the terminal.
    if (lines.join('\n') !== logs.value.join('\n'))
      logs.value = lines
  }
  catch (error) {
    logs.value = [(error as Error).message]
  }
}

watch(() => props.name, load, { immediate: true })
onMounted(() => {
  timer = setInterval(load, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <UiPage>
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-4">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="label">Service</span>
        <h1 class="m-0 truncate font-mono text-2xl font-medium tracking-tight">
          {{ name }}
        </h1>
      </div>
      <div v-if="service" class="flex flex-col gap-1">
        <StateBadge :service="service" />
        <span class="font-mono text-[11px] text-faint">{{ service.status }}</span>
      </div>
      <span class="flex-auto" />
      <button class="btn-outline" :disabled="!!busy || offline" @click="restartService(name)">
        <span class="i-ph-arrow-clockwise" />
        Restart
      </button>
      <button class="btn-outline" :disabled="!!busy || offline" title="Pull the image and recreate the container" @click="updateService(name)">
        <span class="i-ph-cloud-arrow-down" />
        Update
      </button>
    </header>

    <p v-if="!service && !offline && services.length" class="m-0 border-b border-line px-4 py-3 text-sm text-warn">
      There is no service named {{ name }}.
    </p>

    <div class="grid grid-cols-2 border-b border-line md:grid-cols-5">
      <UiStat label="CPU" :value="usage ? formatPercent(usage.cpuPercent) : '–'" :detail="usage ? 'of one core' : 'not running'" class="border-r border-line" />
      <UiStat label="Memory" :value="memory ? formatBytes(memory[0]) : '–'" :detail="memory && usage ? `${formatPercent(usage.memoryPercent)} of ${formatBytes(memory[1])}` : undefined" class="md:border-r border-line" />
      <UiStat label="Network" :value="network ? `↓ ${formatBytes(network[0])}` : '–'" :detail="network ? `↑ ${formatBytes(network[1])}` : undefined" class="border-r border-t md:border-t-0 border-line" />
      <UiStat label="Disk" :value="block ? `R ${formatBytes(block[0])}` : '–'" :detail="block ? `W ${formatBytes(block[1])}` : undefined" class="md:border-r border-t md:border-t-0 border-line" />
      <UiStat label="Processes" :value="usage ? String(usage.pids) : '–'" class="col-span-2 md:col-span-1 border-t md:border-t-0 border-line" />
    </div>

    <div class="grid md:grid-cols-2">
      <UiSection index="01" title="CPU" class="md:border-r">
        <template #aside>
          <span class="flex-auto" />
          <span v-if="usage" class="font-mono text-xs tabular-nums">{{ formatPercent(usage.cpuPercent) }}</span>
        </template>
        <div class="px-4 py-3">
          <LineChart v-if="samples.length > 1" :points="samples.map(s => ({ time: s.time, value: s.cpu }))" :floor="10" :format="formatPercent" :label="`${name} CPU over time`" />
          <p v-else class="m-0 flex h-[140px] items-center justify-center text-xs text-faint">
            Collecting samples…
          </p>
        </div>
      </UiSection>
      <UiSection index="02" title="Memory">
        <template #aside>
          <span class="flex-auto" />
          <span v-if="memory" class="font-mono text-xs tabular-nums">{{ formatBytes(memory[0]) }}</span>
        </template>
        <div class="px-4 py-3">
          <LineChart v-if="samples.length > 1" :points="samples.map(s => ({ time: s.time, value: s.used }))" :floor="2 ** 20" :format="formatBytes" :scale="niceBytes" :label="`${name} memory over time`" />
          <p v-else class="m-0 flex h-[140px] items-center justify-center text-xs text-faint">
            Collecting samples…
          </p>
        </div>
      </UiSection>
    </div>

    <UiSection index="03" title="Logs">
      <template #aside>
        <span class="flex-auto" />
        <span class="text-xs text-faint">Last 200 lines</span>
      </template>
      <LogTerminal :lines="logs" />
    </UiSection>

    <UiSection index="04" :title="`Network · ${hosts.length} hosts`">
      <NetworkHosts :hosts="hosts" hide-from empty="This service has not sent a request through the broker yet." @select="h => navigate({ view: 'network', host: h.key })" />
    </UiSection>
  </UiPage>
</template>
