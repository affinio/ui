export type ScrollGuardTarget = {
  selector: string
  shouldClose: (root: HTMLElement) => boolean
  close: (root: HTMLElement & Record<string, unknown>) => void
}

export function registerScrollGuards(targets: readonly ScrollGuardTarget[]): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return
  }
  const globalScope = window as unknown as Record<string, unknown>
  const flag = "__affinoScrollGuardsRegistered"
  if (globalScope[flag]) {
    return
  }
  globalScope[flag] = true

  let ticking = false
  const closeAll = () => {
    ticking = false
    targets.forEach((target) => {
      document.querySelectorAll<HTMLElement>(target.selector).forEach((root) => {
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
}
