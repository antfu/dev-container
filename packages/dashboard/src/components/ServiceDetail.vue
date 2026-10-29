<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '../composables/useApi'
import LogTerminal from './LogTerminal.vue'

const props = defineProps<{ name: string }>()

const logs = ref<string[]>([])

async function load(): Promise<void> {
  try {
    const { lines } = await api<{ lines: string[] }>(`/services/${props.name}/logs?tail=200`)
    // The page polls, so an unchanged tail should not redraw the terminal.
    if (lines.join('\n') !== logs.value.join('\n'))
      logs.value = lines
  }
  catch (error) {
    logs.value = [(error as Error).message]
  }
}

watch(() => props.name, load, { immediate: true })
defineExpose({ load })
</script>

<template>
  <section class="flex flex-col gap-2 min-w-0">
    <h2 class="label">
      Logs · {{ name }}
    </h2>
    <LogTerminal :lines="logs" />
  </section>
</template>
