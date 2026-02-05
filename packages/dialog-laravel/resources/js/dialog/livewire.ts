import { bindLivewireHooks } from "@affino/overlay-kernel"

type ScanFn = (root: ParentNode | Document) => void

function setupLivewireHooks(scan: ScanFn): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoDialogLivewireHooked",
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (el instanceof HTMLElement || el instanceof DocumentFragment) {
            scan(el)
          }
        },
      },
      {
        name: "message.processed",
        handler: (_message: unknown, component: { el?: Element }) => {
          const scope = component?.el
          if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
            scan(scope)
            return
          }
          scan(document)
        },
      },
    ],
    onNavigated: () => {
      scan(document)
    },
  })
}

export { setupLivewireHooks }
