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
  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
}
