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
    items[0].focus()
  }, [])

  const focusLast = useCallback(() => {
    const items = getItems()
    if (!items.length) {
      focusFallback()
      return
    }
    items[items.length - 1].focus()
  }, [])

  return {
    focusFirst,
    focusLast,
  }
}
