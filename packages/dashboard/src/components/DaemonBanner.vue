<script setup lang="ts">
defineProps<{ offline: boolean }>()
</script>

<template>
  <aside class="panel p-4 flex flex-col gap-2 !border-warn text-sm" role="status">
    <p class="m-0 font-medium text-warn">
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
  </aside>
</template>
