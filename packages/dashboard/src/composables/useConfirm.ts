import { shallowRef } from 'vue'

export interface Confirmation {
  title: string
  message: string
  /** The confirm button's label, like `Restart`. */
  action: string
}

interface Pending extends Confirmation {
  resolve: (ok: boolean) => void
}

/** The question on screen; one at a time, since actions are disabled while one runs. */
export const pending = shallowRef<Pending>()

export function confirm(question: Confirmation): Promise<boolean> {
  pending.value?.resolve(false)
  return new Promise((resolve) => {
    pending.value = { ...question, resolve }
  })
}

export function answer(ok: boolean): void {
  pending.value?.resolve(ok)
  pending.value = undefined
}
