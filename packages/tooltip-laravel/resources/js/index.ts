import {
  hydrateTooltip,
  scan,
  setupMutationObserver,
  setupPointerGuards,
  setupPointerIntentTracker,
} from "./tooltip/hydrate"
import { setupLivewireHooks } from "./tooltip/livewire"

export { hydrateTooltip }
export type { RootEl, TooltipHandle } from "./tooltip/types"

export function bootstrapAffinoTooltips(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
  setupPointerGuards()
  setupPointerIntentTracker()
}
