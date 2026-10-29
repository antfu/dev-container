import { computed, ref, watchEffect } from 'vue'

export type ThemeChoice = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'dc-theme'
const query = window.matchMedia('(prefers-color-scheme: dark)')
const systemDark = ref(query.matches)
query.addEventListener('change', () => {
  systemDark.value = query.matches
})

function stored(): ThemeChoice {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark'
    ? value
    : 'auto'
}

export const theme = ref<ThemeChoice>(stored())
export const isDark = computed(() => theme.value === 'auto'
  ? systemDark.value
  : theme.value === 'dark')

watchEffect(() => {
  document.documentElement.classList.toggle('dark', isDark.value)
  if (theme.value === 'auto')
    localStorage.removeItem(STORAGE_KEY)
  else
    localStorage.setItem(STORAGE_KEY, theme.value)
})

const ORDER: ThemeChoice[] = ['auto', 'light', 'dark']

export function cycleTheme(): void {
  theme.value = ORDER[(ORDER.indexOf(theme.value) + 1) % ORDER.length]
}
