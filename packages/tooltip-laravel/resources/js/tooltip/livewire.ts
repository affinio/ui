import { clearTrackedFocus, scan } from "./hydrate"

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  const global = window as any
  const livewire = global.Livewire
  if (!livewire || global.__affinoTooltipLivewireHooked) {
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
    clearTrackedFocus()
    scan(document)
  })
  global.__affinoTooltipLivewireHooked = true
}
