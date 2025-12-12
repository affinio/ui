import type { Ref } from "vue"

export function useMenuFocus(panelRef: Ref<HTMLElement | null>) {
  const getItems = () => {
    if (typeof window === "undefined") return [] as HTMLElement[]
    return panelRef.value ? Array.from(panelRef.value.querySelectorAll<HTMLElement>("[role='menuitem']")) : []
  }

  const focusFallback = () => {
    panelRef.value?.focus()
  }

  const focusFirst = () => {
    const items = getItems()
    if (!items.length) {
      focusFallback()
      return
    }
    items[0].focus()
  }

  const focusLast = () => {
    const items = getItems()
    if (!items.length) {
      focusFallback()
      return
    }
    items[items.length - 1].focus()
  }

  return {
    focusFirst,
    focusLast,
  }
}
