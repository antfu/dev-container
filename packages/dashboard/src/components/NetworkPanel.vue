<script setup lang="ts">
import type { NetworkRequest, Service } from '../types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '../composables/useApi'
import { allowSuggestion, blockSuggestion, hostPattern, summarize } from '../network'

const props = defineProps<{ services: Service[] }>()

const REFRESH_MS = 5000

type Outcome = 'all' | 'blocked' | 'allowed'
const outcomes: Outcome[] = ['all', 'blocked', 'allowed']

const requests = ref<NetworkRequest[]>([])
const error = ref('')
const service = ref('')
const outcome = ref<Outcome>('all')
const search = ref('')
const selectedKey = ref('')
const tab = ref<'allow' | 'block'>('allow')
const copied = ref('')
let timer: ReturnType<typeof setInterval>

const filtered = computed(() => requests.value.filter(r =>
  (!service.value || r.service === service.value)
  && (outcome.value === 'all' || r.outcome === outcome.value)
  && (!search.value || `${r.host} ${r.path}`.toLowerCase().includes(search.value.toLowerCase())),
))
const hosts = computed(() => summarize(filtered.value))
// Block suggestions list every host seen allowed, whatever the filters hide.
const everyHost = computed(() => summarize(requests.value))
const selected = computed(() => hosts.value.find(h => h.key === selectedKey.value))
const allow = computed(() => selected.value && allowSuggestion(selected.value))
const block = computed(() => selected.value && blockSuggestion(selected.value, everyHost.value))
const shown = computed(() => tab.value === 'allow'
  ? allow.value
  : block.value)
const blockedTotal = computed(() => requests.value.filter(r => r.outcome === 'blocked').length)

async function load(): Promise<void> {
  try {
    requests.value = (await api<{ requests: NetworkRequest[] }>('/requests?tail=1000')).requests
    error.value = ''
  }
  catch (e) {
    error.value = (e as Error).message
  }
}

function select(key: string, blocked: number): void {
  selectedKey.value = selectedKey.value === key
    ? ''
    : key
  // Open on the change that fits: a denied host most likely needs allowing, an allowed one blocking.
  tab.value = blocked
    ? 'allow'
    : 'block'
}

async function copy(label: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = label
    setTimeout(() => copied.value === label && (copied.value = ''), 1500)
  }
  catch {
    copied.value = ''
  }
}

function clock(time: string): string {
  const date = new Date(time)
  return Number.isNaN(date.getTime())
    ? time
    : date.toLocaleTimeString()
}

onMounted(() => {
  void load()
  timer = setInterval(load, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <section class="flex flex-col gap-2 min-w-0">
    <h2 class="label">
      Network · {{ requests.length }} requests<template v-if="blockedTotal">
        , <span class="text-bad">{{ blockedTotal }} denied</span>
      </template>
    </h2>
    <div class="panel p-4 flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <select v-model="service" class="field !w-auto" aria-label="Service">
          <option value="">
            All services
          </option>
          <option v-for="s in props.services" :key="s.name" :value="s.name">
            {{ s.name }}
          </option>
        </select>
        <button
          v-for="o in outcomes" :key="o" class="btn capitalize"
          :class="{ '!border-accent !text-accent': outcome === o }" @click="outcome = o"
        >
          {{ o === 'blocked' ? 'denied' : o }}
        </button>
        <input v-model="search" class="field !w-auto flex-1 min-w-40" placeholder="Filter by host or path" aria-label="Filter">
      </div>
      <p v-if="error" class="m-0 text-sm text-bad">
        {{ error }}
      </p>
      <p v-else-if="!hosts.length" class="m-0 text-sm text-muted">
        No requests yet. Requests appear here as the services reach out through the broker.
      </p>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="label text-left border-b border-line">
              <th class="py-2 pr-4 font-medium">
                Host
              </th>
              <th class="py-2 pr-4 font-medium">
                From
              </th>
              <th class="py-2 pr-4 font-medium text-right">
                Allowed
              </th>
              <th class="py-2 pr-4 font-medium text-right">
                Denied
              </th>
              <th class="py-2 font-medium text-right">
                Last
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="h in hosts" :key="h.key">
              <tr
                class="border-b border-line cursor-pointer hover:bg-bg" :class="{ 'bg-bg': h.key === selectedKey }"
                @click="select(h.key, h.blocked)"
              >
                <td class="py-2 pr-4 font-mono">
                  {{ hostPattern(h) }}
                </td>
                <td class="py-2 pr-4 text-muted">
                  {{ h.services.join(', ') || '–' }}
                </td>
                <td class="py-2 pr-4 text-right font-mono tabular-nums">
                  {{ h.allowed }}
                </td>
                <td class="py-2 pr-4 text-right font-mono tabular-nums" :class="{ 'text-bad': h.blocked }">
                  {{ h.blocked }}
                </td>
                <td class="py-2 text-right font-mono tabular-nums text-muted whitespace-nowrap">
                  {{ clock(h.lastSeen) }}
                </td>
              </tr>
              <tr v-if="h.key === selectedKey" class="border-b border-line">
                <td colspan="5" class="py-3">
                  <div class="flex flex-col gap-4">
                    <ul class="m-0 p-0 list-none flex flex-col gap-1 font-mono text-xs max-h-48 overflow-auto">
                      <li v-for="(r, i) in [...h.requests].reverse()" :key="i" class="flex gap-3 whitespace-nowrap">
                        <span class="text-muted">{{ clock(r.time) }}</span>
                        <span :class="r.outcome === 'blocked' ? 'text-bad' : 'text-accent'">{{ r.outcome === 'blocked' ? 'DENIED' : r.status }}</span>
                        <span>{{ r.method }} {{ r.path || '/' }}</span>
                        <span v-if="r.service" class="text-muted">{{ r.service }}</span>
                        <span v-if="r.injected.length" class="text-warn" title="Secrets the broker swapped in">{{ r.injected.join(', ') }}</span>
                        <span v-if="r.why" class="text-muted truncate" :title="r.why">{{ r.code }}: {{ r.why }}</span>
                      </li>
                    </ul>
                    <div class="flex flex-col gap-2">
                      <div class="flex gap-2">
                        <button class="btn" :class="{ '!border-accent !text-accent': tab === 'allow' }" @click="tab = 'allow'">
                          Allow
                        </button>
                        <button class="btn" :class="{ '!border-accent !text-accent': tab === 'block' }" @click="tab = 'block'">
                          Block
                        </button>
                      </div>
                      <template v-if="shown">
                        <p class="m-0 text-sm">
                          {{ shown.title }}
                        </p>
                        <template v-if="shown.snippet">
                          <div class="flex items-center gap-2">
                            <span class="label mr-auto">dev-container.config.ts</span>
                            <button class="btn" @click="copy('snippet', shown.snippet)">
                              {{ copied === 'snippet' ? 'Copied' : 'Copy snippet' }}
                            </button>
                          </div>
                          <pre class="m-0 p-3 rounded border border-line bg-bg font-mono text-xs overflow-auto">{{ shown.snippet }}</pre>
                        </template>
                        <div class="flex items-center gap-2">
                          <span class="label mr-auto">Prompt for an agent</span>
                          <button class="btn" @click="copy('prompt', shown.prompt)">
                            {{ copied === 'prompt' ? 'Copied' : 'Copy prompt' }}
                          </button>
                        </div>
                        <p class="m-0 p-3 rounded border border-line bg-bg text-xs whitespace-pre-wrap">
                          {{ shown.prompt }}
                        </p>
                      </template>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
