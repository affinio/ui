import { bindLivewireHooks } from "@affino/overlay-kernel"
import { disconnectMutationObserver, refreshMenusInScope, restartMutationObserver, scheduleRefresh } from "./hydrate"
import { MENU_ROOT_SELECTOR } from "./hydrate"

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoMenuLivewireHooked",
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el?: unknown }) => {
          const scope = normalizeScope(el)
          if (scope) {
            refreshMenusInScope(scope)
            return
          }
          scheduleRefresh()
        },
      },
      {
        name: "morph.updated",
        handler: ({ el }: { el?: unknown }) => {
          const scope = normalizeScope(el)
          if (scope) {
            refreshMenusInScope(scope)
            return
          }
          scheduleRefresh()
        },
      },
      {
        name: "message.processed",
        handler: (...args: unknown[]) => {
          const scope = resolveLivewireScope(args)
          if (scope) {
            refreshMenusInScope(scope)
            return
          }
          scheduleRefresh()
        },
      },
      {
        name: "component.removed",
        handler: () => {
          scheduleRefresh()
        },
      },
      {
        name: "commit",
        handler: () => {
          scheduleRefresh()
        },
      },
    ],
    navigateMode: "navigating+navigated",
    onNavigating: () => disconnectMutationObserver(),
    onNavigated: () => {
      restartMutationObserver()
      scheduleRefresh()
    },
  })
}

function resolveLivewireScope(args: unknown[]): ParentNode | null {
  for (const entry of args) {
    const scope = findLivewireScope(entry)
    if (scope) {
      return scope
    }
  }
  return null
}

function normalizeScope(scope: unknown): ParentNode | null {
  if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
    return scope
  }
  return null
}

function findLivewireScope(entry: unknown): ParentNode | null {
  if (!entry || typeof entry !== "object") {
    return null
  }
  const candidate = entry as { el?: unknown; component?: { el?: unknown } }
  const el = candidate.el ?? candidate.component?.el
  if (el instanceof Element && (el.matches(MENU_ROOT_SELECTOR) || el.querySelector(MENU_ROOT_SELECTOR))) {
    return el
  }
  return null
}
