<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue'
import { api } from '../composables/useApi'

const props = defineProps<{ name: string }>()

const logs = ref<string[]>([])
const logBox = useTemplateRef<HTMLElement>('logBox')

async function load(): Promise<void> {
  try {
    logs.value = (await api<{ lines: string[] }>(`/services/${props.name}/logs?tail=200`)).lines
  }
  catch (error) {
    logs.value = [(error as Error).message]
  }
  await nextTick()
  logBox.value?.scrollTo({ top: logBox.value.scrollHeight })
}

watch(() => props.name, load, { immediate: true })
defineExpose({ load })
</script>

<template>
  <section class="flex flex-col gap-2 min-w-0">
    <h2 class="label">
      Logs · {{ name }}
    </h2>
    <pre ref="logBox" class="panel m-0 p-3 h-96 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap break-all">{{ logs.join('\n') || 'No output.' }}</pre>
  </section>
</template>
