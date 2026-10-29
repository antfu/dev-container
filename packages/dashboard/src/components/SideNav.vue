<script setup lang="ts">
import { computed } from 'vue'
import { route, routeHref } from '../route'
import { daemon, links, offline, requests, services, stats } from '../state'
import { formatPercent } from '../usage'
import StateBadge from './StateBadge.vue'

defineEmits<{ navigate: [] }>()

const denied = computed(() => requests.value.filter(r => r.outcome === 'blocked').length)
const item = 'focus-ring flex h-8 items-center gap-2.5 px-3 text-sm no-underline transition-colors hover:bg-hover'
</script>

<template>
  <nav class="flex min-h-0 flex-col bg-bg" aria-label="Dashboard">
    <div class="flex flex-col py-2 border-b border-line">
      <a :href="routeHref({ view: 'overview' })" :class="[item, route.view === 'overview' ? 'bg-hover text-fg shadow-[inset_2px_0_var(--c-fg)]' : 'text-muted']" @click="$emit('navigate')">
        <span class="i-ph-squares-four-duotone" />
        Overview
      </a>
      <a :href="routeHref({ view: 'network' })" :class="[item, route.view === 'network' ? 'bg-hover text-fg shadow-[inset_2px_0_var(--c-fg)]' : 'text-muted']" @click="$emit('navigate')">
        <span class="i-ph-globe-hemisphere-west-duotone" />
        Network
        <span class="flex-auto" />
        <span v-if="denied" class="font-mono text-xs tabular-nums text-bad" :title="`${denied} denied`">{{ denied }}</span>
        <span v-else class="font-mono text-xs tabular-nums text-faint">{{ requests.length }}</span>
      </a>
    </div>

    <div class="flex items-center gap-2 px-3 pt-3 pb-1">
      <span class="label">Services</span>
      <span class="font-mono text-xs tabular-nums text-faint">{{ services.length }}</span>
    </div>
    <div class="min-h-0 flex-auto overflow-auto pb-2">
      <a
        v-for="s in services" :key="s.name"
        :href="routeHref({ view: 'service', name: s.name })"
        class="font-mono !text-xs" :class="[item, route.view === 'service' && route.name === s.name ? 'bg-hover text-fg shadow-[inset_2px_0_var(--c-fg)]' : 'text-muted']"
        :aria-current="route.view === 'service' && route.name === s.name ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        <StateBadge :service="s" compact />
        <span class="min-w-0 flex-auto truncate">{{ s.name }}</span>
        <span v-if="stats[s.name]" class="tabular-nums text-faint">{{ formatPercent(stats[s.name].cpuPercent) }}</span>
      </a>
      <p v-if="!services.length" class="m-0 px-3 py-1 text-xs text-faint">
        {{ offline ? 'Waiting for the server.' : 'No services.' }}
      </p>
    </div>

    <div v-if="links.length" class="border-t border-line py-2">
      <div class="px-3 pb-1">
        <span class="label">Tailnet</span>
      </div>
      <a
        v-for="l in links" :key="l.url" :href="l.url" target="_blank" rel="noopener" :title="l.url"
        class="font-mono !text-xs text-muted" :class="[item]"
      >
        <span class="i-ph-arrow-square-out-duotone" />
        <span class="min-w-0 truncate">{{ l.name }}</span>
      </a>
    </div>

    <div class="flex items-center gap-2 border-t border-line px-3 h-10">
      <span class="size-1.5 rounded-full" :class="offline ? 'bg-bad' : 'bg-ok'" />
      <span class="font-mono text-[11px] text-muted">{{ offline ? 'offline' : daemon ? 'daemon' : 'serve' }}</span>
      <span class="flex-auto" />
      <span class="badge" title="Refreshes every 5 seconds">live</span>
    </div>
  </nav>
</template>
