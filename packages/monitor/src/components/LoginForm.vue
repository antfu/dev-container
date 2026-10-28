<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ error: string }>()
const emit = defineEmits<{ connect: [token: string] }>()
const value = ref('')
</script>

<template>
  <form class="panel mx-auto mt-24 max-w-sm p-5 flex flex-col gap-3" @submit.prevent="emit('connect', value.trim())">
    <h1 class="text-base font-semibold">
      dev-container monitor
    </h1>
    <label class="label" for="token">Control token</label>
    <input id="token" v-model="value" type="password" class="field font-mono" placeholder=".dev-container/control-token" autocomplete="current-password">
    <p v-if="error" class="text-sm text-bad">
      {{ error }}
    </p>
    <button class="btn-primary justify-center" :disabled="!value.trim()">
      Connect
    </button>
  </form>
</template>
