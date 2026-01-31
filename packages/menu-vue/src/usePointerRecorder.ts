import { onBeforeUnmount, onMounted } from "vue"

export function usePointerRecorder(recordPointer?: (point: { x: number; y: number }) => void) {
  let handler: ((event: PointerEvent) => void) | null = null

  onMounted(() => {
    if (!recordPointer) {
      return
    }
    handler = (event: PointerEvent) => {
      recordPointer({ x: event.clientX, y: event.clientY })
    }
    window.addEventListener("pointermove", handler)
  })

  onBeforeUnmount(() => {
    if (handler) {
      window.removeEventListener("pointermove", handler)
      handler = null
    }
  })
}
