import type { Ref, ShallowRef } from 'vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** The element's content width, kept current, so charts draw at real pixels instead of a stretched viewBox. */
export function useWidth(target: Readonly<ShallowRef<HTMLElement | null>>): Ref<number> {
  const width = ref(0)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
      width.value = entry.contentRect.width
    })
    observer.observe(target.value!)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}
