import type { OverlayEntryInit, OverlayManager } from "@affino/overlay-kernel"
/**
 * Contract:
 * - "idle" means the overlay has never reached "open" since controller creation.
 * - "closed" means it was open at least once and completed a close transition.
 */
export type DialogPhase = "idle" | "opening" | "open" | "closing" | "closed"

export type DialogCloseReason =
  | "escape-key"
  | "backdrop"
  | "programmatic"
  | "pointer"
  | "nested-dialog-request"
  | "focus-loss"

export type DialogOpenReason = "programmatic" | "pointer" | "keyboard" | "trigger"

export type OverlayKind = "dialog" | "sheet"

export interface OverlayInteractionRule {
  source: OverlayKind
  target: OverlayKind
  allowStack: boolean
  closeStrategy: "cascade" | "single"
}

export type OverlayInteractionTelemetryEvent =
  | {
      type: "stack-decision"
      source: OverlayKind
      target: OverlayKind
      allowed: boolean
      rule?: OverlayInteractionRule
    }
  | {
      type: "close-decision"
      source: OverlayKind
      target: OverlayKind
      strategy: "cascade" | "single"
      rule?: OverlayInteractionRule
    }

export interface OverlayInteractionTelemetry {
  emit: (event: OverlayInteractionTelemetryEvent) => void
}

export interface OverlayInteractionMatrixConfig {
  rules?: OverlayInteractionRule[]
  telemetry?: OverlayInteractionTelemetry
}

export interface OverlayRegistration {
  id: string
  kind: OverlayKind
  depth?: number
  metadata?: Record<string, unknown>
}

export interface OverlayRegistrar {
  register: (overlay: OverlayRegistration) => (() => void) | void
  isTopMost: (id: string) => boolean
}

export type DialogOverlayTraits = Partial<
  Pick<
    OverlayEntryInit,
    | "ownerId"
    | "modal"
    | "trapsFocus"
    | "blocksPointerOutside"
    | "inertSiblings"
    | "returnFocus"
    | "priority"
    | "root"
    | "data"
  >
>

export interface DialogOpenContext {
  reason: DialogOpenReason
}

export interface DialogCloseContext {
  reason: DialogCloseReason
}

export type DialogOpenHook = (context: DialogOpenContext) => void
export type DialogCloseHook = (context: DialogCloseContext) => void

export interface DialogLifecycleHooks {
  beforeOpen?: DialogOpenHook
  afterOpen?: DialogOpenHook
  beforeClose?: DialogCloseHook
  afterClose?: DialogCloseHook
}

export interface DialogFocusOrchestrator {
  activate: (context: DialogOpenContext) => void
  deactivate: (context: DialogCloseContext) => void
}

export interface DialogEventMap {
  "phase-change": DialogSnapshot
  open: { reason: DialogOpenReason; snapshot: DialogSnapshot }
  close: { reason: DialogCloseReason; snapshot: DialogSnapshot }
  "overlay-registered": OverlayRegistration
  "overlay-unregistered": OverlayRegistration
  error: DialogControllerErrorEvent
}

export type DialogEventName = keyof DialogEventMap

export type DialogEventListener<Event extends DialogEventName> = (
  payload: DialogEventMap[Event]
) => void

export interface CloseGuardContext {
  reason: DialogCloseReason
  metadata?: Record<string, unknown>
}

export type CloseGuardDecision =
  | { outcome: "allow" }
  | { outcome: "deny"; message?: string }

export type CloseGuard = (
  context: CloseGuardContext
) => CloseGuardDecision | Promise<CloseGuardDecision>

export type CloseStrategy = "blocking" | "optimistic"

export interface DialogSnapshot {
  phase: DialogPhase
  isOpen: boolean
  isGuardPending: boolean
  lastCloseReason?: DialogCloseReason
  guardMessage?: string
  optimisticCloseInFlight: boolean
  optimisticCloseReason?: DialogCloseReason
  pendingCloseAttempts: number
  pendingNavigationMessage?: string
}

export type DialogControllerErrorCode = "close-guard-error"

export interface DialogControllerErrorEvent {
  code: DialogControllerErrorCode
  phase: DialogPhase
  reason: DialogCloseReason
  error: unknown
  message?: string
}

export interface DialogControllerOptions {
  id?: string
  defaultOpen?: boolean
  overlayKind?: OverlayKind
  interactionMatrix?: OverlayInteractionMatrixConfig
  closeStrategy?: CloseStrategy
  pendingNavigationMessage?: string
  onSnapshot?: (snapshot: DialogSnapshot) => void
  onPendingCloseAttempt?: (info: PendingCloseAttemptInfo) => void
  onPendingCloseLimitReached?: (info: PendingCloseAttemptLimitInfo) => void
  onError?: (event: DialogControllerErrorEvent) => void
  lifecycle?: DialogLifecycleHooks
  focusOrchestrator?: DialogFocusOrchestrator
  overlayRegistrar?: OverlayRegistrar
  overlayManager?: OverlayManager | null
  getOverlayManager?: () => OverlayManager | null | undefined
  overlayEntryTraits?: DialogOverlayTraits
  maxPendingAttempts?: number
}

export interface PendingCloseAttemptInfo {
  reason: DialogCloseReason
  attempt: number
}

export interface PendingCloseAttemptLimitInfo extends PendingCloseAttemptInfo {
  limit: number
}

export interface CloseRequestOptions {
  strategy?: CloseStrategy
  metadata?: Record<string, unknown>
}
