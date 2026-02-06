import { hydrateMenu, scan, scheduleRefresh, setupMutationObserver } from "./menu/hydrate"
import { setupLivewireHooks } from "./menu/livewire"

export { hydrateMenu }
export type { MenuHandle, MenuSnapshot, RootEl } from "./menu/types"

export function bootstrapAffinoMenus(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
  scheduleRefresh()
}

export function refreshAffinoMenus(): void {
  scheduleRefresh()
}
