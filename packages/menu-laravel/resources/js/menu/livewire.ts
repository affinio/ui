import { bindLivewireHooks } from "@affino/overlay-kernel"
import { disconnectMutationObserver, refreshMenusInScope, restartMutationObserver, scheduleRefresh } from "./hydrate"
import { MENU_ROOT_SELECTOR } from "./hydrate"

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  if (typeof document !== "undefined") {
    const key = "__affinoMenuLivewireLoadBound"
    const scope = window as unknown as Record<string, unknown>
    if (!scope[key]) {
      scope[key] = true
      document.addEventListener(
        "livewire:load",
        () => {
          scheduleRefresh()
        },
        { once: true },
      )
    }
  }
  bindLivewireHooks({
    globalKey: "__affinoMenuLivewireHooked",
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el?: unknown }) => {
          const scope = normalizeScope(el)
          if (refreshFromScope(scope)) {
            return
          }
          if (!scope) {
            scheduleRefresh()
          }
        },
      },
      {
        name: "morph.updated",
        handler: ({ el }: { el?: unknown }) => {
          const scope = normalizeScope(el)
          if (refreshFromScope(scope)) {
            return
          }
          if (!scope) {
            scheduleRefresh()
          }
        },
      },
      {
        name: "message.processed",
        handler: (...args: unknown[]) => {
          const scope = resolveLivewireScope(args)
          if (refreshFromScope(scope)) {
            return
          }
          if (!scope) {
            scheduleRefresh()
          }
        },
      },
      {
        name: "component.removed",
        handler: (...args: unknown[]) => {
          const scope = resolveLivewireScope(args)
          if (refreshFromScope(scope)) {
            return
          }
          scheduleRefresh()
        },
      },
      {
        name: "commit",
        handler: (...args: unknown[]) => {
          const scope = resolveLivewireScope(args)
          if (refreshFromScope(scope)) {
            return
          }
          if (!scope) {
            scheduleRefresh()
          }
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
  if (entry instanceof HTMLElement || entry instanceof DocumentFragment) {
    return entry
  }
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

function refreshFromScope(scope: ParentNode | null): boolean {
  if (!scope || !isConnectedScope(scope) || !scopeContainsMenus(scope)) {
    return false
  }
  refreshMenusInScope(scope)
  return true
}

function isConnectedScope(scope: ParentNode): boolean {
  if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
    return scope.isConnected
  }
  return true
}

function scopeContainsMenus(scope: ParentNode): boolean {
  if (scope instanceof Element && scope.matches(MENU_ROOT_SELECTOR)) {
    return true
  }
  return scope.querySelector(MENU_ROOT_SELECTOR) !== null
}
