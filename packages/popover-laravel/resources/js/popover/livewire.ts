import { setActivePopoverRoot } from "./registry"

export function setupLivewireHooks(scan: (node: ParentNode) => void): void {
  const livewire = (window as any).Livewire
  if (!livewire || (window as any).__affinoPopoverLivewireHooked) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
  }
  document.addEventListener("livewire:navigated", () => {
    setActivePopoverRoot(document, null)
    scan(document)
  })
  ;(window as any).__affinoPopoverLivewireHooked = true
}
