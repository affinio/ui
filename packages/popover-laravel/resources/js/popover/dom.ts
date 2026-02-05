import { PopoverCore } from "@affino/popover-core"
import type { PopoverArrowProps, PopoverContentProps, PopoverTriggerProps } from "@affino/popover-core"
import { arrowStyleRegistry } from "./registry"
import type { Detachment, PopoverHandle, RootEl } from "./types"

export function bindArrowProps(arrow: HTMLElement, props: PopoverArrowProps): void {
  const previousKeys = arrowStyleRegistry.get(arrow)
  previousKeys?.forEach((key) => arrow.style.removeProperty(key))

  const nextKeys = new Set<string>()
  Object.entries(props.style ?? {}).forEach(([key, value]) => {
    arrow.style.setProperty(key, String(value))
    nextKeys.add(key)
  })
  arrowStyleRegistry.set(arrow, nextKeys)

  arrow.setAttribute("data-placement", props["data-placement"])
  arrow.setAttribute("data-align", props["data-align"])
  arrow.setAttribute("data-arrow", props["data-arrow"])
}

export function resetArrow(arrow: HTMLElement): void {
  arrow.removeAttribute("data-placement")
  arrow.removeAttribute("data-align")
  arrow.removeAttribute("data-arrow")
  const keys = arrowStyleRegistry.get(arrow)
  keys?.forEach((key) => arrow.style.removeProperty(key))
  arrowStyleRegistry.delete(arrow)
}

export function bindProps(element: HTMLElement, props: PopoverTriggerProps | PopoverContentProps): Detachment {
  const disposers: Detachment[] = []

  for (const [key, value] of Object.entries(props)) {
    if (key === "tabIndex") {
      if (value == null) {
        element.removeAttribute("tabindex")
      } else {
        element.setAttribute("tabindex", String(value))
        element.tabIndex = Number(value)
      }
      continue
    }

    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key === "onKeydown" ? "keydown" : key.slice(2).toLowerCase()
      const handler = value as EventListener
      element.addEventListener(eventName, handler)
      disposers.push(() => element.removeEventListener(eventName, handler))
      continue
    }

    if (value == null) {
      continue
    }

    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(toKebabCase(key), "")
      } else {
        element.removeAttribute(toKebabCase(key))
      }
      continue
    }

    element.setAttribute(toKebabCase(key), String(value))
  }

  return () => disposers.forEach((dispose) => dispose())
}

export function attachHandle(root: RootEl, popover: PopoverCore): Detachment {
  const handle: PopoverHandle = {
    open: (reason = "programmatic") => popover.open(reason),
    close: (reason = "programmatic") => popover.close(reason),
    toggle: () => popover.toggle(),
    getSnapshot: () => popover.getSnapshot(),
  }
  root.affinoPopover = handle
  return () => {
    if (root.affinoPopover === handle) {
      delete root.affinoPopover
    }
  }
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
}
