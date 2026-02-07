import { bindLivewireHooks } from "@affino/overlay-kernel"

type ScanFn = (root: ParentNode | Document) => void
const DIALOG_ROOT_SELECTOR = "[data-affino-dialog-root]"

function setupLivewireHooks(scan: ScanFn): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoDialogLivewireHooked",
    retryOnLoad: true,
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (isDialogRelatedElement(el)) {
            scan(el)
          }
        },
      },
      {
        name: "message.processed",
        handler: (_message: unknown, component: { el?: Node }) => {
          const scope = resolveComponentScope(component)
          if (!scope) {
            scan(document)
            return
          }
          if (!containsDialogRoot(scope)) {
            return
          }
          scan(scope)
        },
      },
    ],
    onNavigated: () => {
      scan(document)
    },
  })
}

export { setupLivewireHooks }

function resolveComponentScope(component: { el?: Node } | undefined): HTMLElement | DocumentFragment | null {
  const scope = component?.el
  if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
    return scope
  }
  return null
}

function isDialogRelatedElement(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) {
    return false
  }
  if (el.matches(DIALOG_ROOT_SELECTOR)) {
    return true
  }
  if (el.closest(DIALOG_ROOT_SELECTOR)) {
    return true
  }
  return containsDialogRoot(el)
}

function containsDialogRoot(scope: ParentNode): boolean {
  if (scope instanceof Element && scope.matches(DIALOG_ROOT_SELECTOR)) {
    return true
  }
  return scope.querySelector(DIALOG_ROOT_SELECTOR) !== null
}
