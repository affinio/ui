import type { Ref } from "vue"
import { focusEdge, getFocusableElements } from "@affino/focus-utils"

const MENU_ITEM_SELECTOR = "[role='menuitem']"

export function useMenuFocus(panelRef: Ref<HTMLElement | null>) {
  const getItems = () => getFocusableElements(panelRef.value, { selector: MENU_ITEM_SELECTOR })

  const focusFirst = () => focusWithin("start")
  const focusLast = () => focusWithin("end")

  const focusWithin = (edge: "start" | "end") => {
    if (!panelRef.value) {
      return
    }
    const items = getItems()
    focusEdge(panelRef.value, edge, { focusables: items, fallbackToContainer: true })
  }

  return {
    focusFirst,
    focusLast,
  }
}
