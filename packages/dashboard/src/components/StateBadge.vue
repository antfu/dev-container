<script setup lang="ts">
import type { Service } from '../types'
import { computed } from 'vue'
import { serviceTone } from '../usage'

const props = defineProps<{ service: Service, compact?: boolean }>()
const tone = computed(() => serviceTone(props.service))
</script>

<template>
  <span class="inline-flex items-center gap-2" :title="service.status || service.state">
    <span
      class="size-2 shrink-0 rounded-full"
      :class="{ 'bg-ok': tone === 'ok', 'bg-warn': tone === 'warn', 'bg-bad': tone === 'bad' }"
      :aria-label="compact ? service.state : undefined"
    />
    <template v-if="!compact">
      <span class="font-mono text-xs">{{ service.state }}</span>
      <span v-if="service.health" class="badge">{{ service.health }}</span>
    </template>
  </span>
</template>
