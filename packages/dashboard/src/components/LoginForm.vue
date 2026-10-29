<script setup lang="ts">
import { ref } from 'vue'
import LogoMark from './LogoMark.vue'
import UiCross from './ui/UiCross.vue'

defineProps<{ error: string }>()
const emit = defineEmits<{ connect: [token: string] }>()
const value = ref('')
</script>

<template>
  <div class="flex min-h-full items-center justify-center px-4">
    <form class="relative flex w-full max-w-sm flex-col gap-4 border border-line p-6" @submit.prevent="emit('connect', value.trim())">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <UiCross class="-left-[6px] -bottom-[6px]" />
      <UiCross class="-right-[6px] -bottom-[6px]" />
      <span class="flex items-center gap-2.5 font-mono text-sm font-medium">
        <LogoMark class="size-6" />
        dev-container
      </span>
      <h1 class="m-0 text-2xl font-semibold tracking-tight">
        dev-container dashboard
      </h1>
      <p class="m-0 text-sm text-muted">
        Paste the token from <code class="font-mono text-fg">.dev-container/dashboard-token</code>. It stays in this tab only.
      </p>
      <label class="label" for="token">Dashboard token</label>
      <input id="token" v-model="value" type="password" class="field h-10 font-mono" placeholder="••••••••••••" autocomplete="current-password" autofocus>
      <p v-if="error" class="m-0 flex items-center gap-1.5 text-sm text-bad">
        <span class="i-ph-warning-circle-duotone" />{{ error }}
      </p>
      <button class="btn-solid h-10 self-start" :disabled="!value.trim()">
        Connect
        <span class="i-ph-arrow-right" />
      </button>
    </form>
  </div>
</template>
