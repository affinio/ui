import { useEffect } from "react"

export function usePointerRecorder(recordPointer?: (point: { x: number; y: number }) => void) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    if (!recordPointer) {
      return undefined
    }
    const handler = (event: PointerEvent) => {
      recordPointer({ x: event.clientX, y: event.clientY })
    }
    window.addEventListener("pointermove", handler)
    return () => {
      window.removeEventListener("pointermove", handler)
    }
  }, [recordPointer])
}
