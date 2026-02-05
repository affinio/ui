import { getCurrentInstance, onBeforeUnmount, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import {
  DialogController,
  type DialogControllerOptions,
  type DialogSnapshot,
  type DialogOpenReason,
  type DialogCloseReason,
  type CloseRequestOptions,
} from "@affino/dialog-core"
import { getDocumentOverlayManager, type OverlayManager } from "@affino/overlay-kernel"
import { useDialogOverlayRegistrar } from "./overlayRegistrar"

export type UseDialogControllerOptions = DialogControllerOptions

export interface DialogControllerBinding {
  readonly controller: DialogController
  readonly snapshot: ShallowRef<DialogSnapshot>
  readonly open: (reason?: DialogOpenReason) => void
  readonly close: (
    reason?: DialogCloseReason,
    request?: CloseRequestOptions
  ) => Promise<boolean>
  readonly dispose: () => void
}

export function useDialogController(options: UseDialogControllerOptions = {}): DialogControllerBinding {
  const resolvedOverlayRegistrar = options.overlayRegistrar ?? useDialogOverlayRegistrar() ?? undefined
  const resolvedGetOverlayManager =
    options.getOverlayManager ??
    (() => options.overlayManager ?? resolveDocumentOverlayManager())
  const controllerOptions: DialogControllerOptions = {
    ...options,
    overlayRegistrar: resolvedOverlayRegistrar,
    getOverlayManager: resolvedGetOverlayManager,
  }
  const controller = new DialogController(controllerOptions)
  const snapshot = shallowRef<DialogSnapshot>(controller.snapshot)
  const unsubscribe = controller.subscribe((next: DialogSnapshot) => {
    snapshot.value = next
  })

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    controller.destroy()
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose)
  }

  return {
    controller,
    snapshot,
    open: (reason?: DialogOpenReason) => controller.open(reason),
    close: (reason?: DialogCloseReason, request?: CloseRequestOptions) =>
      controller.close(reason, request),
    dispose,
  }
}

function resolveDocumentOverlayManager(): OverlayManager | null {
  if (typeof document === "undefined") {
    return null
  }
  return getDocumentOverlayManager(document)
}
