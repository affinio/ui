import { bindLivewireHooks } from "@affino/overlay-kernel"
import { scan } from "./hydrate"

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoComboboxLivewireHooked",
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
      scan(document)
    },
  })
}
