import { disconnectMutationObserver, restartMutationObserver, scheduleRefresh } from "./hydrate"

const LIVEWIRE_EVENTS = ["message.processed", "component.removed", "commit"]
let livewireHooksBound = false

export function setupLivewireHooks(): void {
  if (livewireHooksBound || typeof window === "undefined") {
    return
  }
  const livewire = (window as any).Livewire
  if (!livewire) {
    const target: EventTarget | null = typeof document !== "undefined" ? document : window
    target?.addEventListener(
      "livewire:load",
      () => {
        setupLivewireHooks()
      },
      { once: true },
    )
    return
  }
  livewireHooksBound = true
  if (typeof livewire.hook === "function") {
    LIVEWIRE_EVENTS.forEach((eventName) => {
      try {
        livewire.hook(eventName, () => scheduleRefresh())
      } catch {
        // ignore unknown hook names
      }
    })
  }
  const target: EventTarget | null = typeof document !== "undefined" ? document : window
  target?.addEventListener("livewire:navigating", () => disconnectMutationObserver())
  target?.addEventListener("livewire:navigated", () => {
    restartMutationObserver()
    scheduleRefresh()
  })
}
