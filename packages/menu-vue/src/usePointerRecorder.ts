import { onBeforeUnmount, onMounted } from "vue"

type PointerListener = (point: { x: number; y: number }) => void

const listeners = new Set<PointerListener>()
let windowHandler: ((event: PointerEvent) => void) | null = null

function attachListener() {
  if (windowHandler || typeof window === "undefined") return
  windowHandler = (event: PointerEvent) => {
    const point = { x: event.clientX, y: event.clientY }
    for (const listener of listeners) listener(point)
  }
  window.addEventListener("pointermove", windowHandler)
}

function detachListener() {
  if (!windowHandler || typeof window === "undefined") return
  window.removeEventListener("pointermove", windowHandler)
  windowHandler = null
}

export function usePointerRecorder(recordPointer?: (point: { x: number; y: number }) => void) {
  onMounted(() => {
    if (!recordPointer) {
      return
    }
    listeners.add(recordPointer)
    attachListener()
  })

  onBeforeUnmount(() => {
    if (!recordPointer) return
    listeners.delete(recordPointer)
    if (listeners.size === 0) detachListener()
  })
}
