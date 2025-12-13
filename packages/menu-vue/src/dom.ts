import type { Rect } from "@affino/menu-core"

export function toRect(el: HTMLElement | null): Rect | null {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  }
}

export function assignPanelPosition(el: HTMLElement | null, rect: { left: number; top: number }) {
  if (!el) return
  const scrollLeft = getScrollOffset("x")
  const scrollTop = getScrollOffset("y")
  el.style.left = `${rect.left + scrollLeft}px`
  el.style.top = `${rect.top + scrollTop}px`
}

function getScrollOffset(axis: "x" | "y") {
  if (typeof window === "undefined") {
    return 0
  }
  if (axis === "x") {
    return window.scrollX ?? window.pageXOffset ?? document.documentElement?.scrollLeft ?? document.body?.scrollLeft ?? 0
  }
  return window.scrollY ?? window.pageYOffset ?? document.documentElement?.scrollTop ?? document.body?.scrollTop ?? 0
}
