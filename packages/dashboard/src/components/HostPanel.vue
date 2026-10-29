<script setup lang="ts">
import type { HostSummary } from '../types'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { allowSuggestion, blockSuggestion, clock, hostPattern } from '../network'
import CopyButton from './CopyButton.vue'
import UiSection from './ui/UiSection.vue'
import UiSegmented from './ui/UiSegmented.vue'
import UiStat from './ui/UiStat.vue'

const props = defineProps<{
  host: HostSummary
  /** Every host seen, whatever the filters hide; block suggestions list the allowed ones. */
  all: HostSummary[]
}>()
const emit = defineEmits<{ close: [] }>()

type Change = 'allow' | 'block'
const CHANGES = [
  { value: 'allow', label: 'Allow' },
  { value: 'block', label: 'Block' },
] as const

// Open on the change that fits: a denied host most likely needs allowing, an allowed one blocking.
const change = ref<Change>(props.host.blocked ? 'allow' : 'block')

const suggestion = computed(() => change.value === 'allow'
  ? allowSuggestion(props.host)
  : blockSuggestion(props.host, props.all))
const newest = computed(() => [...props.host.requests].reverse())

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <aside class="flex h-full flex-col bg-bg" :aria-label="`Host ${hostPattern(host)}`">
    <header class="flex h-12 shrink-0 items-center gap-2 border-b border-line pl-4 pr-2">
      <span :class="host.blocked ? 'i-ph-shield-warning-duotone text-bad' : 'i-ph-shield-check-duotone text-muted'" />
      <h2 class="m-0 min-w-0 flex-auto truncate font-mono text-sm font-medium">
        {{ hostPattern(host) }}
      </h2>
      <button type="button" class="btn-icon" title="Close (Esc)" aria-label="Close" @click="emit('close')">
        <span class="i-ph-x" />
      </button>
    </header>
    <div class="min-h-0 flex-auto overflow-auto">
      <div class="grid grid-cols-3 border-b border-line">
        <UiStat label="Allowed" :value="String(host.allowed)" class="border-r border-line" />
        <UiStat label="Denied" :value="String(host.blocked)" :tone="host.blocked ? 'bad' : undefined" class="border-r border-line" />
        <UiStat label="From" :value="String(host.services.length)" :detail="host.services.join(', ') || 'unknown'" />
      </div>

      <UiSection index="01" title="Suggested change">
        <template #aside>
          <span class="flex-auto" />
          <UiSegmented v-model="change" :options="CHANGES" label="Change" />
        </template>
        <div class="flex flex-col gap-3 px-4 py-3">
          <p class="m-0 text-sm font-medium">
            {{ suggestion.title }}
          </p>
          <div v-if="suggestion.snippet" class="border border-line">
            <div class="flex items-center gap-2 border-b border-line pl-3 pr-1 h-8">
              <span class="i-ph-file-ts-duotone text-muted" />
              <span class="flex-auto font-mono text-[11px] text-muted">dev-container.config.ts</span>
              <CopyButton :text="suggestion.snippet" label="Copy" />
            </div>
            <pre class="m-0 overflow-auto p-3 font-mono text-xs leading-5">{{ suggestion.snippet }}</pre>
          </div>
          <div class="border border-line">
            <div class="flex items-center gap-2 border-b border-line pl-3 pr-1 h-8">
              <span class="i-ph-robot-duotone text-muted" />
              <span class="flex-auto font-mono text-[11px] text-muted">Prompt for an agent</span>
              <CopyButton :text="suggestion.prompt" label="Copy" />
            </div>
            <p class="m-0 p-3 text-xs leading-5 whitespace-pre-wrap text-muted">
              {{ suggestion.prompt }}
            </p>
          </div>
        </div>
      </UiSection>

      <UiSection index="02" :title="`Requests · ${host.requests.length}`">
        <ul class="m-0 list-none p-0">
          <li v-for="(r, i) in newest" :key="i" class="flex flex-col gap-0.5 border-b border-line px-4 py-1.5 font-mono text-xs last:border-b-0">
            <span class="flex items-center gap-3 whitespace-nowrap">
              <span class="text-faint tabular-nums">{{ clock(r.time) }}</span>
              <span class="w-12 shrink-0" :class="r.outcome === 'blocked' ? 'text-bad' : 'text-ok'">{{ r.outcome === 'blocked' ? 'DENIED' : r.status }}</span>
              <span class="min-w-0 truncate" :title="`${r.method} ${r.path || '/'}`">{{ r.method }} {{ r.path || '/' }}</span>
              <span class="flex-auto" />
              <span v-if="r.service" class="text-muted">{{ r.service }}</span>
            </span>
            <span v-if="r.injected.length" class="flex items-center gap-1.5 text-warn" title="Secrets the broker swapped in">
              <span class="i-ph-key-duotone" />{{ r.injected.join(', ') }}
            </span>
            <span v-if="r.why" class="text-muted whitespace-normal">
              <a v-if="r.code" class="text-muted underline decoration-line" :href="`https://github.com/antfu/dev-container/blob/main/docs/errors/${r.code}.md`" target="_blank" rel="noopener">{{ r.code }}</a>: {{ r.why }}
            </span>
          </li>
        </ul>
      </UiSection>
    </div>
  </aside>
</template>
