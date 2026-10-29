<script setup lang="ts">
import { nextTick, useTemplateRef, watch } from 'vue'
import { answer, pending } from '../composables/useConfirm'
import UiCross from './ui/UiCross.vue'

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

// The native modal traps focus, closes on Escape and makes the page behind it inert.
watch(pending, async (question) => {
  await nextTick()
  if (question && !dialog.value?.open)
    dialog.value?.showModal()
  else if (!question)
    dialog.value?.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[calc(100%-2rem)] max-w-md overflow-visible border border-strong bg-bg p-0 text-fg backdrop:bg-black/40"
    :aria-labelledby="pending ? 'confirm-title' : undefined"
    @close="answer(false)"
    @click.self="answer(false)"
  >
    <form v-if="pending" method="dialog" class="relative flex flex-col" @submit.prevent="answer(true)">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <UiCross class="-left-[6px] -bottom-[6px]" />
      <UiCross class="-right-[6px] -bottom-[6px]" />
      <header class="flex items-center gap-2 border-b border-line px-4 h-10">
        <span class="i-ph-warning-duotone text-warn" />
        <span class="label">Confirm</span>
      </header>
      <div class="flex flex-col gap-2 px-4 py-4">
        <h2 id="confirm-title" class="m-0 text-base font-semibold">
          {{ pending.title }}
        </h2>
        <p class="m-0 text-sm text-muted">
          {{ pending.message }}
        </p>
      </div>
      <footer class="flex justify-end gap-2 border-t border-line px-4 py-3">
        <button type="button" class="btn-outline" @click="answer(false)">
          Cancel
        </button>
        <button type="submit" class="btn-solid" autofocus>
          {{ pending.action }}
        </button>
      </footer>
    </form>
  </dialog>
</template>
