<script setup lang="ts">
import type { HostSummary } from '../types'
import { clock, hostPattern } from '../network'

withDefaults(defineProps<{
  hosts: HostSummary[]
  selected?: string
  /** Hide the column of sending services, when every row is from one. */
  hideFrom?: boolean
  empty?: string
}>(), {
  selected: '',
  empty: 'No requests yet. Requests appear here as the services reach out through the broker.',
})
defineEmits<{ select: [host: HostSummary] }>()
</script>

<template>
  <p v-if="!hosts.length" class="m-0 px-4 py-6 text-sm text-muted">
    {{ empty }}
  </p>
  <div v-else class="overflow-x-auto">
    <div class="min-w-[36rem]">
      <div class="grid items-center gap-4 border-b border-line px-4 py-1.5 label" :class="hideFrom ? 'grid-cols-[minmax(0,1fr)_7rem_4rem_4rem_6rem]' : 'grid-cols-[minmax(0,1fr)_minmax(0,10rem)_7rem_4rem_4rem_6rem]'">
        <span>Host</span>
        <span v-if="!hideFrom">From</span>
        <span>Ratio</span>
        <span class="text-right">Allowed</span>
        <span class="text-right">Denied</span>
        <span class="text-right">Last</span>
      </div>
      <button
        v-for="h in hosts" :key="h.key" type="button"
        class="focus-ring grid w-full items-center gap-4 border-b border-line bg-transparent px-4 py-2 text-left text-sm text-fg transition-colors last:border-b-0 hover:bg-hover cursor-pointer"
        :class="[
          hideFrom ? 'grid-cols-[minmax(0,1fr)_7rem_4rem_4rem_6rem]' : 'grid-cols-[minmax(0,1fr)_minmax(0,10rem)_7rem_4rem_4rem_6rem]',
          h.key === selected && 'bg-hover shadow-[inset_2px_0_var(--c-fg)]',
        ]"
        :aria-pressed="h.key === selected"
        @click="$emit('select', h)"
      >
        <span class="flex min-w-0 items-center gap-2 font-mono text-xs">
          <span :class="h.blocked ? 'i-ph-shield-warning-duotone text-bad' : 'i-ph-shield-check-duotone text-faint'" />
          <span class="truncate">{{ hostPattern(h) }}</span>
        </span>
        <span v-if="!hideFrom" class="truncate text-xs text-muted">{{ h.services.join(', ') || '–' }}</span>
        <span class="flex h-1.5 gap-[2px]" :title="`${h.allowed} allowed, ${h.blocked} denied`">
          <span v-if="h.allowed" class="h-full bg-fg" :style="{ flexGrow: h.allowed }" />
          <span v-if="h.blocked" class="h-full bg-bad" :style="{ flexGrow: h.blocked }" />
        </span>
        <span class="text-right font-mono text-xs tabular-nums">{{ h.allowed }}</span>
        <span class="text-right font-mono text-xs tabular-nums" :class="h.blocked ? 'text-bad' : 'text-faint'">{{ h.blocked }}</span>
        <span class="text-right font-mono text-xs tabular-nums text-muted whitespace-nowrap">{{ clock(h.lastSeen) }}</span>
      </button>
    </div>
  </div>
</template>
