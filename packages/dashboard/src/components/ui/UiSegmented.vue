<script setup lang="ts" generic="T extends string">
defineProps<{
  options: readonly { value: T, label: string }[]
  /** Accessible name of the group. */
  label: string
}>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div role="tablist" :aria-label="label" class="inline-flex w-fit border border-strong">
    <button
      v-for="(option, i) in options"
      :key="option.value"
      type="button"
      role="tab"
      :aria-selected="model === option.value"
      class="focus-ring h-7 px-2.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors cursor-pointer"
      :class="[
        model === option.value ? 'bg-fg text-bg' : 'bg-transparent text-muted hover:text-fg hover:bg-hover',
        i > 0 && 'border-l border-strong',
      ]"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
