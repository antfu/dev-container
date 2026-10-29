import { defineConfig, presetIcons, presetWind4 } from 'unocss'

/** Black and white, square corners, 1px guide lines; status colours are the only hues. */
const tokens = `
:root {
  --c-bg: #fff;
  --c-fg: #0a0a0a;
  --c-muted: #0a0a0a9e;
  --c-faint: #0a0a0a59;
  --c-line: #0a0a0a1f;
  --c-strong: #0a0a0a66;
  --c-hover: #0a0a0a0a;
  --c-track: #0a0a0a14;
  --c-ok: #15803d;
  --c-bad: #dc2626;
  --c-warn: #b45309;
  --c-info: #0369a1;
  color-scheme: light;
}
html.dark {
  --c-bg: #0a0a0a;
  --c-fg: #fafafa;
  --c-muted: #fafafa9e;
  --c-faint: #fafafa59;
  --c-line: #fafafa24;
  --c-strong: #fafafa66;
  --c-hover: #fafafa0f;
  --c-track: #fafafa1a;
  --c-ok: #4ade80;
  --c-bad: #f87171;
  --c-warn: #fbbf24;
  --c-info: #7dd3fc;
  color-scheme: dark;
}
html, body, #app {
  height: 100%;
  margin: 0;
  background: var(--c-bg);
  color: var(--c-fg);
}
body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
::selection {
  background: var(--c-fg);
  color: var(--c-bg);
}
`

/** Every colour is one of the tokens above, so light and dark stay in step. */
export default defineConfig({
  presets: [
    presetWind4({
      preflights: { reset: true },
    }),
    presetIcons({ scale: 1.1 }),
  ],
  theme: {
    colors: {
      bg: 'var(--c-bg)',
      fg: 'var(--c-fg)',
      muted: 'var(--c-muted)',
      faint: 'var(--c-faint)',
      line: 'var(--c-line)',
      strong: 'var(--c-strong)',
      hover: 'var(--c-hover)',
      track: 'var(--c-track)',
      ok: 'var(--c-ok)',
      bad: 'var(--c-bad)',
      warn: 'var(--c-warn)',
      info: 'var(--c-info)',
    },
    font: {
      sans: 'ui-sans-serif, system-ui, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
  },
  preflights: [
    {
      getCSS: () => tokens,
    },
  ],
  shortcuts: {
    'label': 'font-mono text-[11px] leading-[1.45] uppercase tracking-[0.12em] text-muted',
    'focus-ring': 'outline-none focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2',
    'field': 'h-8 px-2 border border-line bg-transparent text-sm text-fg outline-none transition-colors placeholder:text-faint focus:border-fg',
    'btn': 'inline-flex h-8 items-center justify-center gap-1.5 border px-3 text-xs font-medium transition-colors duration-150 select-none whitespace-nowrap cursor-pointer bg-transparent disabled:cursor-not-allowed disabled:opacity-40 focus-ring',
    'btn-solid': 'btn border-fg bg-fg text-bg hover:opacity-85',
    'btn-outline': 'btn border-strong text-fg hover:border-fg hover:bg-fg hover:text-bg disabled:hover:(bg-transparent text-fg border-strong)',
    'btn-ghost': 'btn border-transparent text-muted hover:text-fg hover:bg-hover',
    'btn-icon': 'btn-ghost w-8 px-0',
    'badge': 'inline-flex items-center border border-line px-1 font-mono text-[10px] leading-4 uppercase tracking-[0.08em] text-muted whitespace-nowrap',
  },
})
