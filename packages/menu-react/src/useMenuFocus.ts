import { useCallback } from "react"
import type { MutableRefObject } from "react"

export function useMenuFocus(panelRef: MutableRefObject<HTMLElement | null>) {
  const getItems = () => {
    if (typeof window === "undefined") return [] as HTMLElement[]
    return panelRef.current ? Array.from(panelRef.current.querySelectorAll<HTMLElement>("[role='menuitem']")) : []
  }

  const focusFallback = () => {
    panelRef.current?.focus()
  }

  const focusFirst = useCallback(() => {
    const items = getItems()
    if (!items.length) {
      focusFallback()
      return
    }
    const first = items[0]
    if (first) {
      first.focus()
      return
    }
    focusFallback()
  }, [])

  const focusLast = useCallback(() => {
    const items = getItems()
    if (!items.length) {
      focusFallback()
      return
    }
    const last = items[items.length - 1]
    if (last) {
      last.focus()
      return
    }
    focusFallback()
  }, [])

  return {
    focusFirst,
    focusLast,
  }
}
