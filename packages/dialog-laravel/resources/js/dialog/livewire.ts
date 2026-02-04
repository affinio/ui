type ScanFn = (root: ParentNode | Document) => void

let livewireHooked = false

function setupLivewireHooks(scan: ScanFn): void {
  if (typeof window === "undefined" || livewireHooked) {
    return
  }
  const livewire = (window as any).Livewire
  if (!livewire) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
    livewire.hook("message.processed", (_message: unknown, component: { el?: Element }) => {
      const scope = component?.el
      if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
        scan(scope)
        return
      }
      scan(document)
    })
  }
  document.addEventListener("livewire:navigated", () => {
    scan(document)
  })
  livewireHooked = true
}

export { setupLivewireHooks }
