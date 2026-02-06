import { bindLivewireHooks } from "@affino/overlay-kernel"
import { setActivePopoverRoot } from "./registry"
import { captureFocusSnapshotForNode, restoreFocusSnapshotForNode } from "./hydrate"

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
          if (el instanceof HTMLElement) {
            captureFocusSnapshotForNode(el)
          }
        },
      },
      {
        name: "morph.updated",
        handler: ({ el }: { el: Element }) => {
          if (el instanceof HTMLElement) {
            restoreFocusSnapshotForNode(el)
          }
        },
      },
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (el instanceof HTMLElement || el instanceof DocumentFragment) {
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
