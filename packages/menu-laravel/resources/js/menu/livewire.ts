import { bindLivewireHooks } from "@affino/overlay-kernel"
import { disconnectMutationObserver, restartMutationObserver, scheduleRefresh } from "./hydrate"

const LIVEWIRE_EVENTS = ["message.processed", "component.removed", "commit"]

export function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoMenuLivewireHooked",
    hooks: LIVEWIRE_EVENTS.map((eventName) => ({
      name: eventName,
      handler: () => scheduleRefresh(),
    })),
    navigateMode: "navigating+navigated",
    onNavigating: () => disconnectMutationObserver(),
    onNavigated: () => {
      restartMutationObserver()
      scheduleRefresh()
    },
  })
}
