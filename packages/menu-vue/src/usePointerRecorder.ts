import { onBeforeUnmount, onMounted } from "vue"
import type { SubmenuCore } from "@affino/menu-core"

export function usePointerRecorder(core: Pick<SubmenuCore, "recordPointer">) {
  let handler: ((event: PointerEvent) => void) | null = null

  onMounted(() => {
    handler = (event: PointerEvent) => {
      core.recordPointer({ x: event.clientX, y: event.clientY })
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
