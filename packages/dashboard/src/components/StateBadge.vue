<script setup lang="ts">
import type { Service } from '../types'
import { computed } from 'vue'

const props = defineProps<{ service: Service }>()
const ok = computed(() => props.service.state === 'running' && props.service.health !== 'unhealthy')
</script>

<template>
  <span class="inline-flex items-center gap-2 text-sm">
    <span class="size-2 rounded-full" :class="ok ? 'bg-accent' : 'bg-bad'" />
    {{ service.state }}<span v-if="service.health" class="text-muted">· {{ service.health }}</span>
  </span>
</template>
