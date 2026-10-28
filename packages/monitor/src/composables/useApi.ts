import { ref } from 'vue'

const STORAGE_KEY = 'dc-token'

export const token = ref(sessionStorage.getItem(STORAGE_KEY) ?? '')

export function setToken(value: string): void {
  token.value = value
  if (value)
    sessionStorage.setItem(STORAGE_KEY, value)
  else
    sessionStorage.removeItem(STORAGE_KEY)
}

/** Calls the control API with the bearer token; failures throw the server's `why`. */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...init.headers, 'authorization': `Bearer ${token.value}`, 'content-type': 'application/json' },
  })
  const body = await res.json().catch(() => ({})) as { why?: string }
  if (!res.ok)
    throw new Error(body.why ?? res.statusText)
  return body as T
}
