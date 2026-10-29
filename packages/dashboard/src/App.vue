<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import DaemonBanner from './components/DaemonBanner.vue'
import LoginForm from './components/LoginForm.vue'
import LogoMark from './components/LogoMark.vue'
import NetworkView from './components/NetworkView.vue'
import OverviewView from './components/OverviewView.vue'
import ServiceView from './components/ServiceView.vue'
import SideNav from './components/SideNav.vue'
import { route, routeHref } from './route'
import { busy, connect, connected, daemon, error, offline, refresh, REFRESH_MS, restartAll, updateAll, upgrade } from './state'
import { cycleTheme, theme } from './theme'

const navOpen = ref(false)
let timer: ReturnType<typeof setInterval>

const crumb = computed(() => {
  if (route.value.view === 'service')
    return route.value.name
  return route.value.view === 'network'
    ? 'network'
    : 'overview'
})
const themeIcon = computed(() => ({
  auto: 'i-ph-circle-half-duotone',
  light: 'i-ph-sun-duotone',
  dark: 'i-ph-moon-duotone',
})[theme.value])

watch(crumb, (page) => {
  document.title = `${page} · dev-container dashboard`
}, { immediate: true })

onMounted(() => {
  void refresh()
  timer = setInterval(refresh, REFRESH_MS)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <LoginForm v-if="!connected && !offline" :error="error" @connect="connect" />
  <div v-else class="flex h-full flex-col">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-line px-3 md:px-4">
      <button type="button" class="btn-icon md:hidden" aria-label="Menu" :aria-expanded="navOpen" @click="navOpen = !navOpen">
        <span class="i-ph-list" />
      </button>
      <a :href="routeHref({ view: 'overview' })" class="focus-ring flex items-center gap-2.5 font-mono text-sm font-medium text-fg no-underline">
        <LogoMark class="size-6 shrink-0" />
        <span class="hidden sm:inline">dev-container</span>
      </a>
      <span class="text-faint">/</span>
      <span class="min-w-0 truncate font-mono text-xs uppercase tracking-[0.12em] text-muted">{{ crumb }}</span>
      <span class="flex-auto" />
      <span v-if="busy" class="hidden items-center gap-2 font-mono text-xs text-muted sm:flex" role="status">
        <span class="i-ph-circle-notch animate-spin" />{{ busy }}
      </span>
      <div class="flex items-center gap-1">
        <button class="btn-ghost" :disabled="!!busy || offline || !daemon" title="Pull the git checkout, rebuild the images and restart; the daemon restarts itself" @click="upgrade">
          <span class="i-ph-rocket-launch-duotone" /><span class="hidden lg:inline">Upgrade</span>
        </button>
        <button class="btn-ghost" :disabled="!!busy || offline" title="Pull every image and recreate the services" @click="updateAll">
          <span class="i-ph-cloud-arrow-down-duotone" /><span class="hidden lg:inline">Update all</span>
        </button>
        <button class="btn-ghost" :disabled="!!busy || offline" title="Restart every service" @click="restartAll">
          <span class="i-ph-arrow-clockwise-duotone" /><span class="hidden lg:inline">Restart all</span>
        </button>
        <span class="mx-1 h-5 w-px bg-line" />
        <button type="button" class="btn-icon" :title="`Theme: ${theme}`" :aria-label="`Theme: ${theme}`" @click="cycleTheme">
          <span :class="themeIcon" />
        </button>
      </div>
    </header>

    <div class="relative flex min-h-0 flex-auto">
      <SideNav
        class="absolute inset-y-0 left-0 z-20 w-64 border-r border-line md:static md:flex md:w-56 md:shrink-0"
        :class="navOpen ? 'flex' : 'hidden'"
        @navigate="navOpen = false"
      />
      <main class="min-w-0 flex-auto overflow-auto">
        <DaemonBanner v-if="offline || !daemon" :offline="offline" />
        <p v-if="error" class="m-0 flex items-center gap-2 border-b border-line px-4 py-2 text-sm text-bad" role="alert">
          <span class="i-ph-warning-circle-duotone" />{{ error }}
        </p>
        <ServiceView v-if="route.view === 'service'" :key="route.name" :name="route.name" />
        <NetworkView v-else-if="route.view === 'network'" />
        <OverviewView v-else />
      </main>
    </div>
    <ConfirmDialog />
  </div>
</template>
