<script setup lang="ts">
import LineChart from '../LineChart.vue'

defineProps<{
  label: string
  value: string
  /** A secondary figure under the value, like the limit. */
  detail?: string
  tone?: 'ok' | 'warn' | 'bad'
  /** Recent values, drawn as a sparkline. */
  trend?: { time: number, value: number }[]
  scale?: (value: number) => number
}>()
</script>

<template>
  <div class="relative flex flex-col gap-1 px-4 py-3 min-w-0">
    <span class="label">{{ label }}</span>
    <span class="font-mono text-2xl leading-8 truncate" :class="{ 'text-warn': tone === 'warn', 'text-bad': tone === 'bad' }">{{ value }}</span>
    <span v-if="detail" class="font-mono text-xs text-faint truncate">{{ detail }}</span>
    <LineChart v-if="trend && trend.length > 1" class="mt-1" :points="trend" compact :height="24" :scale="scale" />
  </div>
</template>
