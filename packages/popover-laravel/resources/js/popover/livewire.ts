import { bindLivewireHooks } from "@affino/overlay-kernel"
import { setActivePopoverRoot } from "./registry"

export function setupLivewireHooks(scan: (node: ParentNode) => void): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoPopoverLivewireHooked",
    hooks: [
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
