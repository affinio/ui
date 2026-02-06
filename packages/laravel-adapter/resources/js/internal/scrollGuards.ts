export type ScrollGuardTarget = {
  selector: string
  shouldClose: (root: HTMLElement) => boolean
  close: (root: HTMLElement & Record<string, unknown>) => void
}

type ScrollGuardErrorPhase = "selector-query" | "selector-match" | "should-close" | "close" | "raf"

type TrackedScrollGuardTarget = ScrollGuardTarget & {
  roots: Set<HTMLElement>
  dirty: boolean
  attributeName: string | null
}

type ScrollGuardDiagnostics = {
  errorCount: number
  lastError: {
    phase: ScrollGuardErrorPhase
    selector: string
    message: string
  } | null
}

export function registerScrollGuards(targets: readonly ScrollGuardTarget[]): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }
  if (!targets.length) {
    return
  }
  const globalScope = window as unknown as Record<string, unknown>
  const flag = "__affinoScrollGuardsRegistered"
  if (globalScope[flag]) {
    return
  }
  globalScope[flag] = true
  const diagnostics = resolveDiagnostics(globalScope)

  const trackedTargets: TrackedScrollGuardTarget[] = targets.map((target) => ({
    ...target,
    roots: new Set<HTMLElement>(),
    dirty: true,
    attributeName: extractSingleAttributeSelector(target.selector),
  }))

  const invalidateTargets = (matcher: (target: TrackedScrollGuardTarget) => boolean) => {
    trackedTargets.forEach((target) => {
      if (!target.dirty && matcher(target)) {
        target.dirty = true
      }
    })
  }

  if (typeof MutationObserver !== "undefined" && document.documentElement) {
    const attributeFilters = Array.from(
      new Set(
        trackedTargets
          .map((target) => target.attributeName)
          .filter((name): name is string => typeof name === "string" && name.length > 0),
      ),
    )
    const useAttributeFilter = trackedTargets.every((target) => target.attributeName)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          const targetNode = mutation.target
          if (!(targetNode instanceof Element)) {
            return
          }
          invalidateTargets((target) => {
            if (target.roots.has(targetNode as HTMLElement) || targetNode.matches(target.selector)) {
              return true
            }
            const mutationAttribute = mutation.attributeName
            return mutationAttribute != null && target.attributeName === mutationAttribute
          })
          return
        }
        mutation.addedNodes.forEach((node) => {
          invalidateTargets((target) => containsSelector(node, target.selector))
        })
        mutation.removedNodes.forEach((node) => {
          invalidateTargets((target) => containsSelector(node, target.selector))
        })
      })
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      ...(useAttributeFilter ? { attributeFilter: attributeFilters } : {}),
    })
  }

  let ticking = false
  const closeAll = () => {
    ticking = false
    trackedTargets.forEach((target) => {
      refreshTrackedRoots(target)
      target.roots.forEach((root) => {
        if (!root.isConnected || !root.matches(target.selector)) {
          target.roots.delete(root)
          return
        }
        let shouldClose = false
        try {
          shouldClose = target.shouldClose(root)
        } catch (error) {
          recordGuardError(diagnostics, "should-close", target.selector, error)
        }
        if (!shouldClose) {
          return
        }
        try {
          target.close(root as HTMLElement & Record<string, unknown>)
        } catch (error) {
          recordGuardError(diagnostics, "close", target.selector, error)
        }
      })
    })
  }

  const scheduleFrame = resolveFrameScheduler(diagnostics)
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) {
        return
      }
      ticking = true
      scheduleFrame(closeAll)
    },
    { passive: true },
  )

  function refreshTrackedRoots(target: TrackedScrollGuardTarget): void {
    if (!target.dirty) {
      return
    }
    target.dirty = false
    target.roots.clear()
    try {
      document.querySelectorAll<HTMLElement>(target.selector).forEach((root) => {
        target.roots.add(root)
      })
    } catch (error) {
      recordGuardError(diagnostics, "selector-query", target.selector, error)
    }
  }
}

function containsSelector(node: Node, selector: string): boolean {
  try {
    if (node instanceof Element) {
      if (node.matches(selector)) {
        return true
      }
      return node.querySelector(selector) !== null
    }
    if (node instanceof DocumentFragment) {
      return node.querySelector(selector) !== null
    }
    return false
  } catch {
    return false
  }
}

function extractSingleAttributeSelector(selector: string): string | null {
  const match = /^\[\s*([^\s=\]]+)\s*(?:=\s*["'][^"']*["']\s*)?\]$/.exec(selector.trim())
  return match?.[1] ?? null
}

function resolveDiagnostics(scope: Record<string, unknown>): ScrollGuardDiagnostics {
  const key = "__affinoScrollGuardsDiagnostics"
  const existing = scope[key]
  if (existing && typeof existing === "object") {
    return existing as ScrollGuardDiagnostics
  }
  const diagnostics: ScrollGuardDiagnostics = {
    errorCount: 0,
    lastError: null,
  }
  try {
    Object.defineProperty(scope, key, {
      value: diagnostics,
      configurable: true,
      enumerable: false,
      writable: true,
    })
  } catch {
    scope[key] = diagnostics
  }
  return diagnostics
}

function recordGuardError(
  diagnostics: ScrollGuardDiagnostics,
  phase: ScrollGuardErrorPhase,
  selector: string,
  error: unknown,
): void {
  diagnostics.errorCount += 1
  diagnostics.lastError = {
    phase,
    selector,
    message: toErrorMessage(error),
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function resolveFrameScheduler(
  diagnostics: ScrollGuardDiagnostics,
): (callback: FrameRequestCallback) => void {
  if (typeof requestAnimationFrame === "function") {
    return (callback) => {
      try {
        requestAnimationFrame(callback)
      } catch (error) {
        recordGuardError(diagnostics, "raf", "__frame__", error)
        callback(0)
      }
    }
  }
  return (callback) => {
    setTimeout(() => callback(0), 16)
  }
}
