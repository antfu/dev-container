<script setup lang="ts">
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { isDark } from '../theme'
import '@xterm/xterm/css/xterm.css'

const props = defineProps<{ lines: string[] }>()

const host = useTemplateRef<HTMLElement>('host')
let term: Terminal | undefined
let fit: FitAddon | undefined
let resize: ResizeObserver | undefined

const LIGHT: ITheme = {
  foreground: '#0a0a0a',
  cursor: 'transparent',
  selectionBackground: '#0a0a0a33',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#b45309',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0e7490',
  white: '#a1a1aa',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#d97706',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#0891b2',
  brightWhite: '#52525b',
}

const DARK: ITheme = {
  foreground: '#fafafa',
  cursor: 'transparent',
  selectionBackground: '#fafafa33',
  black: '#52525b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#d4d4d8',
  brightBlack: '#8b8b94',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
}

/** The page's own background, so the terminal follows the colour scheme with the rest of the dashboard. */
function theme(): ITheme {
  const background = getComputedStyle(document.documentElement).getPropertyValue('--c-bg').trim()
  return {
    ...isDark.value ? DARK : LIGHT,
    background,
  }
}

function applyTheme(): void {
  if (!term)
    return
  term.options.theme = theme()
  term.refresh(0, term.rows - 1)
}

/** Rewrites the buffer, and keeps the view where it was unless it was following the end. */
function render(): void {
  if (!term)
    return
  const buffer = term.buffer.active
  const following = buffer.viewportY >= buffer.baseY
  const top = buffer.viewportY
  // The reset travels in the write stream, so it cannot overtake a write that is still queued.
  term.write(`\u001Bc${props.lines.join('\r\n') || 'No output.'}`, () => {
    if (following)
      term?.scrollToBottom()
    else
      term?.scrollToLine(top)
  })
}

onMounted(() => {
  term = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorInactiveStyle: 'none',
    scrollback: 5000,
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    theme: theme(),
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(host.value!)
  fit.fit()
  // A resize reflows the buffer in place, which can clip long lines; writing the lines again at the new width cannot.
  resize = new ResizeObserver(() => {
    fit?.fit()
    render()
  })
  resize.observe(host.value!)
  render()
})

onBeforeUnmount(() => {
  resize?.disconnect()
  term?.dispose()
})

watch(() => props.lines, render)
// The tokens change with the `dark` class, which is set in the same tick as the flag.
watch(isDark, () => nextTick(applyTheme))
</script>

<template>
  <div ref="host" class="h-[28rem] px-4 py-3 overflow-hidden" />
</template>
