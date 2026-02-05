import { hydratePopover, scan, setupMutationObserver } from "./popover/hydrate"
import { setupLivewireHooks } from "./popover/livewire"

export { hydratePopover }
export type { PopoverHandle, RootEl } from "./popover/types"

export function bootstrapAffinoPopovers(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks(scan)
}
