import { bindLivewireHooks } from "@affino/overlay-kernel"
import { clearTrackedFocus, scan } from "./hydrate"

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
          if (el instanceof HTMLElement || el instanceof DocumentFragment) {
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
