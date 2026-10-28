import { defineConfig, presetWind4 } from 'unocss'

/** Flat system: hairline borders, one accent, no shadows or gradients, 4px corners. */
export default defineConfig({
  presets: [
    presetWind4({
      preflights: { reset: true },
    }),
  ],
  theme: {
    colors: {
      bg: 'var(--c-bg)',
      surface: 'var(--c-surface)',
      line: 'var(--c-line)',
      fg: 'var(--c-fg)',
      muted: 'var(--c-muted)',
      accent: 'var(--c-accent)',
      bad: 'var(--c-bad)',
      warn: 'var(--c-warn)',
    },
    font: {
      sans: 'ui-sans-serif, system-ui, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    radius: { DEFAULT: '4px' },
  },
  shortcuts: {
    'btn': 'inline-flex items-center gap-1.5 h-8 px-3 rounded border border-line bg-surface text-fg text-sm cursor-pointer hover:border-fg disabled:(opacity-50 cursor-default hover:border-line)',
    'btn-primary': 'btn !bg-accent !border-accent !text-bg hover:!opacity-90',
    'btn-danger': 'btn !text-bad hover:!border-bad',
    'field': 'h-8 w-full px-2.5 rounded border border-line bg-bg text-fg text-sm outline-none focus:border-accent placeholder:text-muted',
    'label': 'text-xs uppercase tracking-wider text-muted font-medium',
    'panel': 'rounded border border-line bg-surface',
  },
  preflights: [
    {
      getCSS: () => `
      :root { color-scheme: light dark; --c-bg: #fff; --c-surface: #fafafa; --c-line: #e4e4e7; --c-fg: #18181b; --c-muted: #71717a; --c-accent: #16a34a; --c-bad: #dc2626; --c-warn: #d97706; }
      @media (prefers-color-scheme: dark) { :root { --c-bg: #0c0c0e; --c-surface: #131316; --c-line: #27272a; --c-fg: #e4e4e7; --c-muted: #8b8b94; --c-accent: #22c55e; --c-bad: #f87171; --c-warn: #fbbf24; } }
      body { background: var(--c-bg); color: var(--c-fg); font-family: ui-sans-serif, system-ui, sans-serif; font-size: 14px; }
    `,
    },
  ],
})
