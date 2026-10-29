<script setup lang="ts">
import type { Bin } from '../network'
import { computed, ref, useTemplateRef } from 'vue'
import { clockLabel, columnPath, niceMax } from '../chart'
import { useWidth } from '../composables/useWidth'

const props = withDefaults(defineProps<{ bins: Bin[], height?: number }>(), { height: 160 })

const PAD = { l: 36, r: 8, t: 10, b: 22 }
/** The surface gap between stacked segments. */
const GAP = 2

const root = useTemplateRef<HTMLElement>('root')
const width = useWidth(root)
const hover = ref<number>()

const max = computed(() => niceMax(Math.max(2, ...props.bins.map(b => b.allowed + b.blocked))))
const ticks = computed(() => [0, max.value / 2, max.value])
const slot = computed(() => (width.value - PAD.l - PAD.r) / (props.bins.length || 1))
const barWidth = computed(() => Math.max(1, Math.min(24, slot.value - GAP)))
const plotHeight = computed(() => props.height - PAD.t - PAD.b)

function y(value: number): number {
  return PAD.t + (1 - value / max.value) * plotHeight.value
}

const columns = computed(() => props.bins.map((b, i) => {
  const x = PAD.l + i * slot.value + (slot.value - barWidth.value) / 2
  const allowedHeight = b.allowed / max.value * plotHeight.value
  const blockedHeight = b.blocked / max.value * plotHeight.value
  const baseline = y(0)
  // The top segment carries the rounded data-end; the gap comes out of the upper one.
  const allowed = columnPath(x, baseline - allowedHeight, barWidth.value, allowedHeight, !b.blocked)
  const blocked = b.blocked
    ? columnPath(x, baseline - allowedHeight - blockedHeight, barWidth.value, Math.max(1, blockedHeight - (b.allowed ? GAP : 0)))
    : ''
  return { x, allowed, blocked, bin: b }
}))

const labels = computed(() => {
  const bins = props.bins
  if (!bins.length)
    return []
  return [
    { x: PAD.l, anchor: 'start', time: bins[0].start },
    { x: PAD.l + (width.value - PAD.l - PAD.r) / 2, anchor: 'middle', time: bins[Math.floor(bins.length / 2)].start },
    { x: width.value - PAD.r, anchor: 'end', time: bins.at(-1)!.end },
  ]
})

const hovered = computed(() => hover.value === undefined
  ? undefined
  : columns.value[hover.value])
const total = computed(() => props.bins.reduce((sum, b) => sum + b.allowed + b.blocked, 0))
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-4 text-xs text-muted">
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 bg-fg" />Allowed</span>
      <span class="inline-flex items-center gap-1.5"><span class="size-2.5 bg-bad" />Denied</span>
    </div>
    <div ref="root" class="relative w-full" :style="{ height: `${height}px` }">
      <svg
        v-if="width" :width="width" :height="height" class="block overflow-visible"
        role="img" :aria-label="`${total} requests over time, allowed and denied`"
        @pointerleave="hover = undefined"
      >
        <g v-for="tick in ticks" :key="tick">
          <line :x1="PAD.l" :x2="width - PAD.r" :y1="y(tick)" :y2="y(tick)" stroke="var(--c-line)" stroke-width="1" />
          <text :x="PAD.l - 8" :y="y(tick)" dy="0.32em" text-anchor="end" class="fill-faint font-mono text-[10px] tabular-nums">{{ tick }}</text>
        </g>
        <text
          v-for="l in labels" :key="l.anchor" :x="l.x" :y="height - 4" :text-anchor="l.anchor"
          class="fill-faint font-mono text-[10px]"
        >
          {{ clockLabel(l.time) }}
        </text>
        <g v-for="(c, i) in columns" :key="c.bin.start" :opacity="hover === undefined || hover === i ? 1 : 0.45" class="transition-opacity">
          <path :d="c.allowed" fill="var(--c-fg)" />
          <path :d="c.blocked" fill="var(--c-bad)" />
          <!-- The hit target is the whole slot, not just the painted bar. -->
          <rect
            :x="PAD.l + i * slot" :y="PAD.t" :width="slot" :height="plotHeight" fill="transparent"
            @pointerenter="hover = i"
          />
        </g>
      </svg>
      <div
        v-if="hovered"
        class="pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 border border-strong bg-bg px-2 py-1.5 whitespace-nowrap"
        :style="{ left: `${hovered.x + barWidth / 2}px`, transform: hovered.x > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }"
      >
        <span class="font-mono text-[10px] text-muted">{{ clockLabel(hovered.bin.start) }} – {{ clockLabel(hovered.bin.end) }}</span>
        <span class="flex items-center gap-2 text-xs"><span class="h-0.5 w-3 bg-fg" /><b class="font-mono tabular-nums">{{ hovered.bin.allowed }}</b><span class="text-muted">allowed</span></span>
        <span class="flex items-center gap-2 text-xs"><span class="h-0.5 w-3 bg-bad" /><b class="font-mono tabular-nums">{{ hovered.bin.blocked }}</b><span class="text-muted">denied</span></span>
      </div>
    </div>
  </div>
</template>
