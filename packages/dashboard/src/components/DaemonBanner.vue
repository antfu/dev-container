<script setup lang="ts">
defineProps<{ offline: boolean }>()
</script>

<template>
  <aside class="flex items-start gap-3 border-b border-line px-4 py-3 text-sm" :class="offline ? 'bg-[color-mix(in_srgb,var(--c-bad)_8%,transparent)]' : 'bg-[color-mix(in_srgb,var(--c-warn)_8%,transparent)]'" role="status">
    <span class="mt-0.5 shrink-0" :class="offline ? 'i-ph-plugs-duotone text-bad' : 'i-ph-warning-duotone text-warn'" />
    <div class="flex flex-col gap-1">
      <p class="m-0 font-medium" :class="offline ? 'text-bad' : 'text-warn'">
        {{ offline ? 'The dashboard cannot reach its server.' : 'Running without the daemon.' }}
      </p>
      <p class="m-0 text-muted">
        <template v-if="offline">
          Services, logs and network requests need the server, and this page keeps trying. Start it on the host with <code class="font-mono text-fg">dev-container serve</code>.
          For upgrades and a server that starts at login and keeps running, install the daemon with <code class="font-mono text-fg">dev-container daemon install</code>.
        </template>
        <template v-else>
          Upgrade and scheduled self-upgrades are off. Install the daemon with <code class="font-mono text-fg">dev-container daemon install</code> for the full feature set.
        </template>
      </p>
    </div>
  </aside>
</template>
