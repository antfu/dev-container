<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { clockLabel, niceMax } from '../chart'
import { useWidth } from '../composables/useWidth'

const props = withDefaults(defineProps<{
  points: { time: number, value: number }[]
  /** The least the y axis reaches, so a quiet series does not fill the chart. */
  floor?: number
  format?: (value: number) => string
  /** Rounds the largest value up to the top of the axis. */
  scale?: (value: number) => number
  /** A sparkline: no axes, no hover. */
  compact?: boolean
  height?: number
  label?: string
}>(), {
  floor: 0,
  format: (value: number) => value.toFixed(1),
  scale: niceMax,
  height: 140,
  label: '',
})

const root = useTemplateRef<HTMLElement>('root')
const width = useWidth(root)
const hover = ref<number>()

const pad = computed(() => props.compact
  ? { l: 1, r: 5, t: 5, b: 2 }
  : { l: 44, r: 10, t: 10, b: 22 })
const max = computed(() => props.scale(Math.max(props.floor, ...props.points.map(p => p.value))))
const start = computed(() => props.points[0]?.time ?? 0)
const end = computed(() => props.points.at(-1)?.time ?? 1)
const ticks = computed(() => [0, max.value / 2, max.value])

function x(time: number): number {
  const span = end.value - start.value || 1
  return pad.value.l + (time - start.value) / span * (width.value - pad.value.l - pad.value.r)
}
function y(value: number): number {
  return pad.value.t + (1 - value / max.value) * (props.height - pad.value.t - pad.value.b)
}

const line = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`).join(''))
const area = computed(() => props.points.length
  ? `${line.value}L${x(end.value).toFixed(1)} ${y(0)}L${x(start.value).toFixed(1)} ${y(0)}Z`
  : '')
const last = computed(() => props.points.at(-1))
const hovered = computed(() => hover.value === undefined
  ? undefined
  : props.points[hover.value])

/** The crosshair snaps to the nearest sample, so the reader aims at a time, not a 2px line. */
function track(event: PointerEvent): void {
  if (props.compact || !props.points.length)
    return
  const left = (event.currentTarget as SVGElement).getBoundingClientRect().left
  const at = event.clientX - left
  let best = 0
  for (let i = 1; i < props.points.length; i++) {
    if (Math.abs(x(props.points[i].time) - at) < Math.abs(x(props.points[best].time) - at))
      best = i
  }
  hover.value = best
}
</script>

<template>
  <div ref="root" class="relative w-full" :style="{ height: `${height}px` }">
    <svg
      v-if="width" :width="width" :height="height" class="block overflow-visible"
      role="img" :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'"
      @pointermove="track" @pointerleave="hover = undefined"
    >
      <template v-if="!compact">
        <g v-for="tick in ticks" :key="tick">
          <line :x1="pad.l" :x2="width - pad.r" :y1="y(tick)" :y2="y(tick)" stroke="var(--c-line)" stroke-width="1" />
          <text :x="pad.l - 8" :y="y(tick)" dy="0.32em" text-anchor="end" class="fill-faint font-mono text-[10px] tabular-nums">{{ format(tick) }}</text>
        </g>
        <template v-if="points.length > 1">
          <text :x="pad.l" :y="height - 4" class="fill-faint font-mono text-[10px]">{{ clockLabel(start, true) }}</text>
          <text :x="width - pad.r" :y="height - 4" text-anchor="end" class="fill-faint font-mono text-[10px]">{{ clockLabel(end, true) }}</text>
        </template>
      </template>
      <path :d="area" fill="var(--c-fg)" fill-opacity="0.08" />
      <path :d="line" fill="none" stroke="var(--c-fg)" :stroke-width="compact ? 1.5 : 2" stroke-linejoin="round" stroke-linecap="round" />
      <circle v-if="last" :cx="x(last.time)" :cy="y(last.value)" :r="compact ? 2.5 : 4" fill="var(--c-fg)" stroke="var(--c-bg)" stroke-width="2" />
      <template v-if="hovered">
        <line :x1="x(hovered.time)" :x2="x(hovered.time)" :y1="pad.t" :y2="height - pad.b" stroke="var(--c-strong)" stroke-width="1" />
        <circle :cx="x(hovered.time)" :cy="y(hovered.value)" r="4" fill="var(--c-fg)" stroke="var(--c-bg)" stroke-width="2" />
      </template>
    </svg>
    <div
      v-if="hovered"
      class="pointer-events-none absolute top-0 z-10 flex flex-col border border-strong bg-bg px-2 py-1 whitespace-nowrap"
      :style="{ left: `${x(hovered.time)}px`, transform: x(hovered.time) > width / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }"
    >
      <span class="font-mono text-sm font-medium tabular-nums">{{ format(hovered.value) }}</span>
      <span class="font-mono text-[10px] text-muted">{{ clockLabel(hovered.time, true) }}</span>
    </div>
  </div>
</template>
