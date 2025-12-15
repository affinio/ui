import { useEffect } from "react"
import type { SubmenuCore } from "@affino/menu-core"

export function usePointerRecorder(core: Pick<SubmenuCore, "recordPointer">) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    const handler = (event: PointerEvent) => {
      core.recordPointer({ x: event.clientX, y: event.clientY })
    }
    window.addEventListener("pointermove", handler)
    return () => {
      window.removeEventListener("pointermove", handler)
    }
  }, [core])
}
