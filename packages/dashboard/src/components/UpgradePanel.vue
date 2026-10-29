<script setup lang="ts">
import type { UpgradePhase } from '../types'
import { computed } from 'vue'
import { upgrade, upgradeStatus, upgrading } from '../state'

const STEPS: { phase: UpgradePhase, label: string }[] = [
  { phase: 'pulling', label: 'Pulling changes' },
  { phase: 'building', label: 'Rebuilding images' },
  { phase: 'restarting', label: 'Restarting services' },
]

const phase = computed(() => upgradeStatus.value?.run.phase ?? 'idle')
const behind = computed(() => upgradeStatus.value?.behind ?? 0)
const commits = computed(() => upgradeStatus.value?.commits ?? [])
/** Steps before the current one are done; once deployed they all are. */
const current = computed(() => phase.value === 'deployed'
  ? STEPS.length
  : STEPS.findIndex(step => step.phase === phase.value))
const visible = computed(() => upgrading.value || behind.value > 0)
</script>

<template>
  <aside v-if="visible" class="flex flex-col gap-3 border-b border-line px-4 py-3 text-sm" role="status">
    <template v-if="upgrading">
      <p class="m-0 font-medium">
        Upgrading dev-container
      </p>
      <ol class="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 font-mono text-xs">
        <li v-for="(step, i) in STEPS" :key="step.phase" class="flex items-center gap-2" :class="i > current ? 'text-faint' : i === current ? 'text-fg' : 'text-muted'">
          <span v-if="i < current" class="i-ph-check-circle-duotone text-ok" />
          <span v-else-if="i === current" class="i-ph-circle-notch animate-spin" />
          <span v-else class="i-ph-circle" />
          {{ step.label }}
        </li>
      </ol>
      <p v-if="phase === 'deployed'" class="m-0 text-muted">
        Done. The dashboard restarts on the new code and reconnects when it is back.
      </p>
    </template>
    <template v-else>
      <div class="flex items-center gap-3">
        <span class="i-ph-git-commit-duotone text-info" />
        <p class="m-0 flex-auto font-medium">
          {{ behind }} new {{ behind === 1 ? 'commit' : 'commits' }}
        </p>
        <button class="btn-ghost" @click="upgrade">
          <span class="i-ph-rocket-launch-duotone" />Upgrade
        </button>
      </div>
      <ul v-if="commits.length" class="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-xs text-muted">
        <li v-for="commit in commits" :key="commit.sha" class="truncate">
          <span class="text-faint">{{ commit.sha }}</span> {{ commit.subject }}
        </li>
        <li v-if="behind > commits.length" class="text-faint">
          and {{ behind - commits.length }} more
        </li>
      </ul>
    </template>
  </aside>
</template>
