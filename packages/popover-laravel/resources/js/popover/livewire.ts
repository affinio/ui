import { bindLivewireHooks } from "@affino/overlay-kernel"
import { setActivePopoverRoot } from "./registry"
import { captureFocusSnapshotForNode, restoreFocusSnapshotForNode } from "./hydrate"

const POPOVER_ROOT_SELECTOR = "[data-affino-popover-root]"

export function setupLivewireHooks(scan: (node: ParentNode) => void): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoPopoverLivewireHooked",
    retryOnLoad: true,
    hooks: [
      {
        name: "morph.updating",
        handler: ({ el }: { el: Element }) => {
          if (isPopoverRelatedElement(el)) {
            captureFocusSnapshotForNode(el)
          }
        },
      },
      {
        name: "morph.updated",
        handler: ({ el }: { el: Element }) => {
          if (isPopoverRelatedElement(el)) {
            restoreFocusSnapshotForNode(el)
          }
        },
      },
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (isPopoverRelatedElement(el)) {
            scan(el)
          }
        },
      },
    ],
    onNavigated: () => {
      setActivePopoverRoot(document, null)
      scan(document)
    },
  })
}

function isPopoverRelatedElement(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) {
    return false
  }
  if (el.matches(POPOVER_ROOT_SELECTOR)) {
    return true
  }
  if (el.closest(POPOVER_ROOT_SELECTOR)) {
    return true
  }
  return Boolean(el.querySelector(POPOVER_ROOT_SELECTOR))
}
