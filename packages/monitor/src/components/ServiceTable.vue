<script setup lang="ts">
import type { Service, Stats } from '../types'
import StateBadge from './StateBadge.vue'

defineProps<{ services: Service[], stats: Record<string, Stats>, selected: string, busy: boolean }>()
defineEmits<{ select: [name: string], act: [label: string, path: string] }>()
</script>

<template>
  <div class="panel overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="label text-left border-b border-line">
          <th class="px-4 py-2.5 font-medium">
            Service
          </th>
          <th class="px-4 py-2.5 font-medium">
            State
          </th>
          <th class="px-4 py-2.5 font-medium text-right">
            CPU
          </th>
          <th class="px-4 py-2.5 font-medium text-right">
            Memory
          </th>
          <th class="px-4 py-2.5" />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="s in services" :key="s.name"
          class="border-b border-line last:border-b-0 cursor-pointer hover:bg-bg"
          :class="{ 'bg-bg': s.name === selected }"
          @click="$emit('select', s.name)"
        >
          <td class="px-4 py-2.5 font-medium" :class="{ 'text-accent': s.name === selected }">
            {{ s.name }}
          </td>
          <td class="px-4 py-2.5">
            <StateBadge :service="s" />
          </td>
          <td class="px-4 py-2.5 text-right font-mono tabular-nums">
            {{ stats[s.name] ? `${stats[s.name].cpuPercent.toFixed(1)}%` : '–' }}
          </td>
          <td class="px-4 py-2.5 text-right font-mono tabular-nums">
            {{ stats[s.name]?.memory ?? '–' }}
          </td>
          <td class="px-4 py-2.5 text-right whitespace-nowrap">
            <button class="btn mr-2" :disabled="busy" @click.stop="$emit('act', `${s.name}: restart`, `/services/${s.name}/restart`)">
              Restart
            </button>
            <button class="btn" :disabled="busy" @click.stop="$emit('act', `${s.name}: update`, `/services/${s.name}/update`)">
              Update
            </button>
          </td>
        </tr>
        <tr v-if="!services.length">
          <td colspan="5" class="px-4 py-6 text-center text-muted">
            No services.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
