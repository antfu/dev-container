<script setup lang="ts">
import { computed } from 'vue'
import { severity } from '../../usage'

const props = defineProps<{
  /** 0 to 100; more is drawn full. */
  percent: number
  label: string
}>()

const width = computed(() => Math.min(100, Math.max(0, props.percent)))
const tone = computed(() => severity(props.percent))
</script>

<template>
  <span
    class="block h-1.5 w-full bg-track" role="meter" :aria-label="label"
    aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(percent)"
  >
    <span
      class="block h-full transition-[width] duration-500"
      :class="{ 'bg-fg': tone === 'ok', 'bg-warn': tone === 'warn', 'bg-bad': tone === 'bad' }"
      :style="{ width: `${width}%` }"
    />
  </span>
</template>
