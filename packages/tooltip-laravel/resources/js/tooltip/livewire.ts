import { bindLivewireHooks } from "@affino/overlay-kernel"
import { scan } from "./hydrate"
import { clearTrackedFocus } from "./registry"

const TOOLTIP_ROOT_SELECTOR = "[data-affino-tooltip-root]"

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoTooltipLivewireHooked",
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (isTooltipRelatedElement(el)) {
            scan(el)
          }
        },
      },
    ],
    onNavigated: () => {
      clearTrackedFocus()
      scan(document)
    },
  })
}

function isTooltipRelatedElement(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) {
    return false
  }
  if (el.matches(TOOLTIP_ROOT_SELECTOR)) {
    return true
  }
  if (el.closest(TOOLTIP_ROOT_SELECTOR)) {
    return true
  }
  return Boolean(el.querySelector(TOOLTIP_ROOT_SELECTOR))
}
