<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ text: string, label: string }>()
const copied = ref(false)

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => copied.value = false, 1500)
  }
  catch {
    copied.value = false
  }
}
</script>

<template>
  <button type="button" class="btn-ghost h-7 px-2" @click="copy">
    <span :class="copied ? 'i-ph-check-bold text-ok' : 'i-ph-copy-duotone'" />
    {{ copied ? 'Copied' : label }}
  </button>
</template>
