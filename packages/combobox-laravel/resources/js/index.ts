import { scan, setupMutationObserver, hydrateCombobox } from "./combobox/hydrate"
import { setupLivewireHooks } from "./combobox/livewire"
import { testing } from "./combobox/helpers"

export { hydrateCombobox }
export type { ComboboxHandle, ComboboxMode, ComboboxSnapshot, RootEl } from "./combobox/types"

export function bootstrapAffinoComboboxes(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
}

export const __testing = testing
