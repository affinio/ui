import { findDialogRoot, hydrateDialog, scan, setupMutationObserver, toCloseReason, toOpenReason } from "./dialog/hydrate"
import { setupLivewireHooks } from "./dialog/livewire"
import type { ManualDetail } from "./dialog/types"

let manualBridgeBound = false

export { hydrateDialog }

export function bootstrapAffinoDialogs(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks(scan)
  setupManualBridge()
}

function setupManualBridge(): void {
  if (manualBridgeBound || typeof document === "undefined") {
    return
  }
  const handledFlag = "__affinoDialogManualHandled"
  document.addEventListener("affino-dialog:manual", (nativeEvent) => {
    const event = nativeEvent as CustomEvent<ManualDetail>
    if ((event as any)[handledFlag]) {
      return
    }
    ;(event as any)[handledFlag] = true
    const detail = event.detail
    if (!detail?.id || !detail.action) {
      return
    }
    const root = findDialogRoot(detail.id)
    if (!root?.affinoDialog) {
      return
    }
    if (detail.action === "open") {
      root.affinoDialog.open(toOpenReason(detail.reason))
      return
    }
    if (detail.action === "close") {
      root.affinoDialog.close(toCloseReason(detail.reason), detail.options)
      return
    }
    root.affinoDialog.toggle(detail.reason)
  })
  manualBridgeBound = true
}
