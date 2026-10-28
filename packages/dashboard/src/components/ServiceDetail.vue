<script setup lang="ts">
import type { GpgStatus } from '../types'
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { api } from '../composables/useApi'

const props = defineProps<{ name: string }>()
const emit = defineEmits<{ notice: [message: string], error: [message: string] }>()

const logs = ref<string[]>([])
const gpg = ref<GpgStatus>()
const gpgError = ref('')
const user = ref('')
const privateKey = ref('')
const logBox = useTemplateRef<HTMLElement>('logBox')

const query = computed(() => user.value ? `?user=${encodeURIComponent(user.value)}` : '')
const gpgSummary = computed(() => {
  if (gpgError.value)
    return gpgError.value
  if (!gpg.value)
    return ''
  if (!gpg.value.installed)
    return 'gpg is not installed in this container.'
  const keys = gpg.value.keys.map(k => `${k.uid} (${k.fingerprint.slice(-16)})`).join(', ')
  return `Signing is ${gpg.value.signing ? 'on' : 'off'}. ${keys ? `Keys: ${keys}` : 'No secret key.'}`
})

async function load(): Promise<void> {
  try {
    logs.value = (await api<{ lines: string[] }>(`/services/${props.name}/logs?tail=200`)).lines
    await nextTick()
    logBox.value?.scrollTo({ top: logBox.value.scrollHeight })
    gpg.value = await api<GpgStatus>(`/services/${props.name}/gpg${query.value}`)
    gpgError.value = ''
  }
  catch (error) {
    gpgError.value = (error as Error).message
  }
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action()
    emit('error', '')
  }
  catch (error) {
    emit('error', (error as Error).message)
  }
  await load()
}

function importKey() {
  return run(async () => {
    await api(`/services/${props.name}/gpg`, { method: 'POST', body: JSON.stringify({ privateKey: privateKey.value, user: user.value || undefined }) })
    privateKey.value = ''
  })
}
function disable() {
  return run(async () => {
    await api(`/services/${props.name}/gpg${query.value}`, { method: 'DELETE' })
  })
}
function copyPublic() {
  return run(async () => {
    const { publicKey } = await api<{ publicKey?: string }>(`/services/${props.name}/gpg/public${query.value}`)
    if (!publicKey)
      throw new Error('No signing key is set up in this service.')
    await navigator.clipboard.writeText(publicKey)
    emit('notice', 'Public key copied. Add it at github.com/settings/gpg/new.')
  })
}

watch(() => props.name, load, { immediate: true })
defineExpose({ load })
</script>

<template>
  <section class="grid gap-6 lg:grid-cols-2">
    <div class="flex flex-col gap-2 min-w-0">
      <h2 class="label">
        Logs · {{ name }}
      </h2>
      <pre ref="logBox" class="panel m-0 p-3 h-96 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap break-all">{{ logs.join('\n') || 'No output.' }}</pre>
    </div>
    <div class="flex flex-col gap-2 min-w-0">
      <h2 class="label">
        GPG signing
      </h2>
      <div class="panel p-4 flex flex-col gap-3">
        <p class="text-sm text-muted m-0">
          {{ gpgSummary }}
        </p>
        <input v-model="user" class="field" placeholder="Container user (optional)" @change="load">
        <textarea v-model="privateKey" class="field h-24 py-2 font-mono text-xs" placeholder="Armored private key, or base64 of one" />
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary" :disabled="!privateKey.trim()" @click="importKey">
            Import key and sign commits
          </button>
          <button class="btn" @click="copyPublic">
            Copy public key
          </button>
          <button class="btn-danger" @click="disable">
            Turn signing off
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
