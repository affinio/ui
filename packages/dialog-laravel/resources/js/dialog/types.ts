import type {
  CloseRequestOptions,
  CloseStrategy,
  DialogOpenReason,
  DialogCloseReason,
  DialogSnapshot,
  OverlayKind,
} from "@affino/dialog-core"
import type { DialogController } from "@affino/dialog-core"

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoDialogRoot?: string
    affinoDialogModal?: string
    affinoDialogCloseBackdrop?: string
    affinoDialogCloseEscape?: string
    affinoDialogLockScroll?: string
    affinoDialogReturnFocus?: string
    affinoDialogPinned?: string
    affinoDialogDefaultOpen?: string
    affinoDialogOverlayKind?: OverlayKind
    affinoDialogCloseStrategy?: string
    affinoDialogTeleport?: string
    affinoDialogStateSync?: string
    affinoDialogPendingMessage?: string
    affinoDialogMaxPending?: string
    affinoDialogState?: string
  }
  affinoDialog?: DialogHandle
}

type OverlayEl = HTMLElement & {
  dataset: DOMStringMap & {
    state?: string
    affinoDialogOwner?: string
  }
}

type SurfaceEl = HTMLElement & {
  dataset: DOMStringMap & {
    state?: string
  }
}

type DialogHandle = {
  open: (reason?: DialogOpenReason) => void
  close: (reason?: DialogCloseReason, options?: CloseRequestOptions) => void
  toggle: (reason?: DialogOpenReason | DialogCloseReason) => void
  getSnapshot: () => DialogSnapshot
}

type BindingOptions = {
  modal: boolean
  closeOnBackdrop: boolean
  closeOnEscape: boolean
  lockScroll: boolean
  returnFocus: boolean
  pinned: boolean
  defaultOpen: boolean
  overlayKind: OverlayKind
  closeStrategy: CloseStrategy
  teleportTarget: string | null
  stateSync: boolean
  pendingMessage: string | null
  maxPendingAttempts: number | null
}

type DialogBinding = {
  root: RootEl
  overlay: OverlayEl
  surface: SurfaceEl
  controller: DialogController
  options: BindingOptions
  detachments: Array<() => void>
  lockHeld: boolean
  teleportRestore: (() => void) | null
  sentinelCleanup: (() => void) | null
  overlayId: string
}

type Cleanup = () => void

type FocusSentinel = HTMLElement & {
  dataset: DOMStringMap & { affinoDialogSentinel?: string }
}

type ManualDetail = {
  id?: string
  action?: "open" | "close" | "toggle"
  reason?: DialogOpenReason | DialogCloseReason
  options?: CloseRequestOptions
}

export type {
  RootEl,
  OverlayEl,
  SurfaceEl,
  DialogHandle,
  BindingOptions,
  DialogBinding,
  Cleanup,
  FocusSentinel,
  ManualDetail,
}

export type { DialogFocusOrchestrator } from "@affino/dialog-core"
