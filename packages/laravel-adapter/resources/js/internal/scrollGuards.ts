export type ScrollGuardTarget = {
  selector: string
  shouldClose: (root: HTMLElement) => boolean
  close: (root: HTMLElement & Record<string, unknown>) => void
}

type TrackedScrollGuardTarget = ScrollGuardTarget & {
  roots: Set<HTMLElement>
  dirty: boolean
  attributeName: string | null
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
        if (!target.shouldClose(root)) {
          return
        }
        target.close(root as HTMLElement & Record<string, unknown>)
      })
    })
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) {
        return
      }
      ticking = true
      requestAnimationFrame(closeAll)
    },
    { passive: true },
  )

  function refreshTrackedRoots(target: TrackedScrollGuardTarget): void {
    if (!target.dirty) {
      return
    }
    target.dirty = false
    target.roots.clear()
    document.querySelectorAll<HTMLElement>(target.selector).forEach((root) => {
      target.roots.add(root)
    })
  }
}

function containsSelector(node: Node, selector: string): boolean {
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
}

function extractSingleAttributeSelector(selector: string): string | null {
  const match = /^\[\s*([^\s=\]]+)\s*(?:=\s*["'][^"']*["']\s*)?\]$/.exec(selector.trim())
  return match?.[1] ?? null
}
