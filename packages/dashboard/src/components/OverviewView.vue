<script setup lang="ts">
import { computed } from 'vue'
import { niceBytes } from '../chart'
import { bin, hostPattern, summarize } from '../network'
import { navigate, routeHref } from '../route'
import { busy, history, links, now, offline, REFRESH_MS, requests, restartService, services, stats, updateService } from '../state'
import { formatBytes, formatPercent, parsePair, severity, total } from '../usage'
import LineChart from './LineChart.vue'
import RequestChart from './RequestChart.vue'
import StateBadge from './StateBadge.vue'
import UiMeter from './ui/UiMeter.vue'
import UiPage from './ui/UiPage.vue'
import UiSection from './ui/UiSection.vue'
import UiStat from './ui/UiStat.vue'

const WINDOW = 30 * 60_000
const TOP_HOSTS = 6

const running = computed(() => services.value.filter(s => s.state === 'running').length)
const sum = computed(() => total(history.value))
const cpu = computed(() => Object.values(stats.value).reduce((n, s) => n + s.cpuPercent, 0))
const used = computed(() => Object.values(stats.value).reduce((n, s) => n + parsePair(s.memory)[0], 0))
/** Containers share the host's memory, so any one of them reports the limit. */
const limit = computed(() => Math.max(0, ...Object.values(stats.value).map(s => parsePair(s.memory)[1])))
const denied = computed(() => requests.value.filter(r => r.outcome === 'blocked').length)
const bins = computed(() => bin(requests.value, now.value, WINDOW, 30))
const hosts = computed(() => summarize(requests.value)
  .sort((a, b) => b.blocked - a.blocked || b.requests.length - a.requests.length)
  .slice(0, TOP_HOSTS))
const busiest = computed(() => Math.max(1, ...hosts.value.map(h => h.requests.length)))
</script>

<template>
  <UiPage>
    <div class="grid grid-cols-2 border-b border-line md:grid-cols-5">
      <UiStat
        label="Services" :value="`${running}/${services.length}`" detail="running"
        :tone="running < services.length ? 'warn' : undefined" class="border-r border-line"
      />
      <UiStat
        label="CPU" :value="formatPercent(cpu)" detail="sum over services"
        :trend="sum.map(s => ({ time: s.time, value: s.cpu }))" class="md:border-r border-line"
      />
      <UiStat
        label="Memory" :value="formatBytes(used)" :detail="limit ? `of ${formatBytes(limit)}` : undefined"
        :trend="sum.map(s => ({ time: s.time, value: s.used }))" :scale="niceBytes" class="border-r border-t md:border-t-0 border-line"
      />
      <UiStat label="Requests" :value="requests.length.toLocaleString()" detail="through the broker" class="md:border-r border-t md:border-t-0 border-line" />
      <UiStat
        label="Denied" :value="denied.toLocaleString()" :tone="denied ? 'bad' : undefined"
        :detail="denied ? 'needs a look' : 'all clear'" class="col-span-2 md:col-span-1 border-t md:border-t-0 border-line"
      />
    </div>

    <UiSection index="01" title="Resources">
      <template #aside>
        <span class="flex-auto" />
        <span class="text-xs text-faint">Last {{ Math.max(1, Math.round(sum.length * REFRESH_MS / 60_000)) }} min</span>
      </template>
      <p v-if="!services.length" class="m-0 px-4 py-6 text-sm text-muted">
        {{ offline ? 'Services show up once the server answers.' : 'No services.' }}
      </p>
      <div class="overflow-x-auto">
        <div
          v-for="s in services" :key="s.name"
          class="grid min-w-[44rem] grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)_8rem_4.5rem] items-center gap-5 border-b border-line px-4 py-2.5 transition-colors last:border-b-0 hover:bg-hover"
        >
          <a :href="routeHref({ view: 'service', name: s.name })" class="focus-ring flex min-w-0 flex-col gap-0.5 text-fg no-underline">
            <span class="flex items-center gap-2 font-mono text-sm font-medium">
              <StateBadge :service="s" compact />
              <span class="truncate">{{ s.name }}</span>
            </span>
            <span class="truncate pl-4 text-[11px] text-faint">{{ s.status || s.state }}</span>
          </a>
          <template v-if="stats[s.name]">
            <span class="flex flex-col gap-1.5">
              <span class="flex items-baseline justify-between font-mono text-[11px]">
                <span class="text-faint">CPU</span>
                <span class="tabular-nums" :class="{ 'text-warn': severity(stats[s.name].cpuPercent) === 'warn', 'text-bad': severity(stats[s.name].cpuPercent) === 'bad' }">{{ formatPercent(stats[s.name].cpuPercent) }}</span>
              </span>
              <UiMeter :percent="stats[s.name].cpuPercent" :label="`${s.name} CPU`" />
            </span>
            <span class="flex flex-col gap-1.5">
              <span class="flex items-baseline justify-between font-mono text-[11px]">
                <span class="text-faint">MEM</span>
                <span class="tabular-nums">{{ formatBytes(parsePair(stats[s.name].memory)[0]) }} <span class="text-faint">· {{ formatPercent(stats[s.name].memoryPercent) }}</span></span>
              </span>
              <UiMeter :percent="stats[s.name].memoryPercent" :label="`${s.name} memory`" />
            </span>
            <LineChart :points="(history[s.name] ?? []).map(p => ({ time: p.time, value: p.cpu }))" compact :height="28" :floor="5" />
          </template>
          <span v-else class="col-span-3 font-mono text-xs text-faint">Not running</span>
          <span class="flex justify-end">
            <button class="btn-icon" :disabled="!!busy || offline" :title="`Restart ${s.name}`" :aria-label="`Restart ${s.name}`" @click="restartService(s.name)">
              <span class="i-ph-arrow-clockwise" />
            </button>
            <button class="btn-icon" :disabled="!!busy || offline" :title="`Update ${s.name}: pull and recreate`" :aria-label="`Update ${s.name}`" @click="updateService(s.name)">
              <span class="i-ph-cloud-arrow-down" />
            </button>
          </span>
        </div>
      </div>
    </UiSection>

    <UiSection v-if="links.length" index="02" title="Tailnet">
      <a
        v-for="l in links" :key="l.url" :href="l.url" target="_blank" rel="noopener"
        class="focus-ring grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-4 py-2 text-fg no-underline transition-colors last:border-b-0 hover:bg-hover"
      >
        <span class="truncate font-mono text-sm font-medium">{{ l.name }}</span>
        <span class="truncate font-mono text-xs text-muted">{{ l.url }}</span>
        <span class="i-ph-arrow-up-right text-faint" />
      </a>
    </UiSection>

    <div class="grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <UiSection index="03" title="Traffic · 30 min" class="md:border-r">
        <template #aside>
          <span class="flex-auto" />
          <a :href="routeHref({ view: 'network' })" class="focus-ring font-mono text-xs text-muted hover:underline">Open network</a>
        </template>
        <div class="px-4 py-3">
          <RequestChart :bins="bins" />
        </div>
      </UiSection>
      <UiSection index="04" title="Top hosts">
        <p v-if="!hosts.length" class="m-0 px-4 py-3 text-sm text-muted">
          No requests yet.
        </p>
        <button
          v-for="h in hosts" :key="h.key" type="button"
          class="focus-ring flex w-full flex-col gap-1.5 border-b border-line bg-transparent px-4 py-2 text-left text-fg transition-colors last:border-b-0 hover:bg-hover cursor-pointer"
          @click="navigate({ view: 'network', host: h.key })"
        >
          <span class="flex w-full items-center gap-2 font-mono text-xs">
            <span :class="h.blocked ? 'i-ph-shield-warning-duotone text-bad' : 'i-ph-shield-check-duotone text-faint'" />
            <span class="min-w-0 flex-auto truncate">{{ hostPattern(h) }}</span>
            <span class="tabular-nums">{{ h.requests.length }}</span>
            <span v-if="h.blocked" class="tabular-nums text-bad">· {{ h.blocked }} denied</span>
          </span>
          <span class="flex h-1 gap-[2px]" :style="{ width: `${h.requests.length / busiest * 100}%` }">
            <span v-if="h.allowed" class="h-full bg-fg" :style="{ flexGrow: h.allowed }" />
            <span v-if="h.blocked" class="h-full bg-bad" :style="{ flexGrow: h.blocked }" />
          </span>
        </button>
      </UiSection>
    </div>
  </UiPage>
</template>
