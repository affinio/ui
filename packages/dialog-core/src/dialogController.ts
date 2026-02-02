import type {
  CloseGuard,
  CloseGuardDecision,
  CloseRequestOptions,
  CloseStrategy,
  DialogCloseReason,
  DialogControllerOptions,
  DialogEventListener,
  DialogEventName,
  DialogEventMap,
  DialogFocusOrchestrator,
  DialogLifecycleHooks,
  DialogCloseContext,
  DialogOpenContext,
  DialogOpenReason,
  DialogPhase,
  DialogSnapshot,
  OverlayKind,
  OverlayRegistration,
  OverlayRegistrar,
} from "./types.js"
import { createOverlayInteractionMatrix } from "./overlay/interactionMatrix.js"
import type { OverlayInteractionMatrix } from "./overlay/interactionMatrix.js"

const DEFAULT_PENDING_MESSAGE = "Dialog close pending"
let controllerId = 0

function createDialogId(prefix = "affino-dialog") {
  controllerId += 1
  return `${prefix}-${controllerId}`
}

export class DialogController {
  private phase: DialogPhase
  private closeGuard?: CloseGuard
  private guardPromise: Promise<CloseGuardDecision> | null = null
  private optimisticClose = false
  private optimisticReason?: DialogCloseReason
  private lastReason?: DialogCloseReason
  private guardMessage?: string
  private pendingAttempts = 0
  private readonly subscribers = new Set<(snapshot: DialogSnapshot) => void>()
  private readonly eventListeners = new Map<DialogEventName, Set<(payload: unknown) => void>>()
  private readonly matrix: OverlayInteractionMatrix
  private readonly overlayKind: OverlayKind
  private readonly defaultStrategy: CloseStrategy
  private readonly lifecycle: DialogLifecycleHooks
  private readonly focusOrchestrator?: DialogFocusOrchestrator
  private readonly overlayRegistrar?: OverlayRegistrar
  private readonly overlayId: string
  private selfOverlayDisposer: (() => void) | null = null
  private focusActive = false
  private destroyed = false

  constructor(private readonly options: DialogControllerOptions = {}) {
    this.phase = options.defaultOpen ? "open" : "idle"
    this.overlayKind = options.overlayKind ?? "dialog"
    this.defaultStrategy = options.closeStrategy ?? "blocking"
    this.matrix = createOverlayInteractionMatrix(options.interactionMatrix)
    this.lifecycle = options.lifecycle ?? {}
    this.focusOrchestrator = options.focusOrchestrator
    this.overlayRegistrar = options.overlayRegistrar
    this.overlayId = options.id ?? createDialogId()
    if (options.onSnapshot) {
      this.subscribe(options.onSnapshot)
    }
    if (this.phase === "open") {
      this.registerSelfOverlay()
    }
  }

  get snapshot(): DialogSnapshot {
    return {
      phase: this.phase,
      isOpen: this.phase === "open",
      isGuardPending: this.isGuardPending,
      lastCloseReason: this.lastReason,
      guardMessage: this.guardMessage,
      optimisticCloseInFlight: this.optimisticClose,
      optimisticCloseReason: this.optimisticReason,
      pendingCloseAttempts: this.pendingAttempts,
      pendingNavigationMessage: this.pendingNavigationMessage,
    }
  }

  destroy(reason: DialogCloseReason = "programmatic"): void {
    if (this.destroyed) return
    this.destroyed = true
    this.unregisterSelfOverlay()
    this.subscribers.clear()
    this.eventListeners.clear()
    this.guardPromise = null
    this.closeGuard = undefined
    this.optimisticClose = false
    this.optimisticReason = undefined
    this.guardMessage = undefined
    this.pendingAttempts = 0
    this.deactivateFocus({ reason })
  }

  get isGuardPending(): boolean {
    return Boolean(this.guardPromise)
  }

  get pendingNavigationMessage(): string | undefined {
    if (!this.guardPromise) return undefined
    return this.options.pendingNavigationMessage ?? DEFAULT_PENDING_MESSAGE
  }

  subscribe(listener: (snapshot: DialogSnapshot) => void): () => void {
    if (this.destroyed) {
      return () => {}
    }
    this.subscribers.add(listener)
    listener(this.snapshot)
    return () => this.subscribers.delete(listener)
  }

  setCloseGuard(guard: CloseGuard | undefined): void {
    if (this.destroyed) return
    this.closeGuard = guard
  }

  open(reason: DialogOpenReason = "programmatic"): void {
    if (this.destroyed) return
    if (this.phase === "open" || this.phase === "opening") return
    const context: DialogOpenContext = { reason }
    this.guardMessage = undefined
    this.runOpenLifecycle("beforeOpen", context)
    this.transition("opening")
    this.registerSelfOverlay()
    this.activateFocus(context)
    this.transition("open", { openReason: reason })
    this.runOpenLifecycle("afterOpen", context)
  }

  async close(
    reason: DialogCloseReason = "programmatic",
    request: CloseRequestOptions = {}
  ): Promise<boolean> {
    if (this.destroyed) {
      return false
    }
    if (this.phase === "idle" || this.phase === "closed") {
      return false
    }

    if (this.phase === "closing" && !this.guardPromise) {
      return false
    }

    if (!this.canHandleClose(reason)) {
      return false
    }

    this.lastReason = reason

    if (!this.closeGuard) {
      this.enterClosing(reason)
      this.transition("closed", { closeReason: reason })
      return true
    }

    if (this.guardPromise) {
      this.pendingAttempts += 1
      this.options.onPendingCloseAttempt?.({ reason, attempt: this.pendingAttempts })
      this.maybeNotifyPendingLimit(reason)
      this.emit()
      return this.guardPromise.then((decision) => decision.outcome === "allow")
    }

    this.pendingAttempts = 0
    this.guardMessage = undefined
    const strategy = request.strategy ?? this.defaultStrategy

    const pending = Promise.resolve(
      this.closeGuard({ reason, metadata: request.metadata })
    )
    this.guardPromise = pending

    if (strategy === "optimistic") {
      this.optimisticClose = true
      this.optimisticReason = reason
      this.enterClosing(reason)
    } else {
      this.emit()
    }

    try {
      const decision = await pending
      if (decision.outcome === "allow") {
        if (strategy === "blocking") {
          this.enterClosing(reason)
        }
        this.transition("closed", { closeReason: reason })
        return true
      }

      this.guardMessage = decision.message
      if (strategy === "optimistic") {
        this.transition("open")
      } else {
        this.emit()
      }
      return false
    } finally {
      this.guardPromise = null
      this.optimisticClose = false
      this.optimisticReason = undefined
      this.emit()
    }
  }

  on<Event extends DialogEventName>(event: Event, listener: DialogEventListener<Event>): () => void {
    const listeners = this.eventListeners.get(event) ?? new Set<(payload: unknown) => void>()
    const wrapped = listener as unknown as (payload: unknown) => void
    listeners.add(wrapped)
    this.eventListeners.set(event, listeners)
    return () => {
      listeners.delete(wrapped)
      if (!listeners.size) {
        this.eventListeners.delete(event)
      }
    }
  }

  registerOverlay(registration: OverlayRegistration): () => void {
    if (this.destroyed) {
      return () => {}
    }
    const dispose = this.overlayRegistrar?.register(registration)
    this.emitEvent("overlay-registered", registration)
    return () => {
      dispose?.()
      this.emitEvent("overlay-unregistered", registration)
    }
  }

  canStackOver(targetKind: OverlayKind): boolean {
    return this.matrix.canStack(this.overlayKind, targetKind)
  }

  closeStrategyFor(targetKind: OverlayKind): "cascade" | "single" {
    return this.matrix.closeStrategy(this.overlayKind, targetKind)
  }

  getPendingCloseAttempts(): number {
    return this.pendingAttempts
  }

  canHandleClose(reason: DialogCloseReason): boolean {
    if (!this.overlayRegistrar) {
      return true
    }
    if (reason !== "backdrop" && reason !== "escape-key") {
      return true
    }
    return this.overlayRegistrar.isTopMost(this.overlayId)
  }

  private enterClosing(reason: DialogCloseReason): void {
    if (this.phase !== "closing") {
      this.runCloseLifecycle("beforeClose", { reason })
      this.transition("closing")
    } else {
      this.emit()
    }
  }

  private transition(
    next: DialogPhase,
    context?: { openReason?: DialogOpenReason; closeReason?: DialogCloseReason }
  ): void {
    const hasChanged = this.phase !== next
    if (hasChanged) {
      this.phase = next
    }
    this.emit()
    if (!hasChanged) {
      return
    }
    this.emitEvent("phase-change", this.snapshot)
    if (next === "open" && context?.openReason) {
      this.emitEvent("open", { reason: context.openReason, snapshot: this.snapshot })
    }
    if (next === "closed") {
      const reason = context?.closeReason ?? this.lastReason ?? "programmatic"
      this.emitEvent("close", { reason, snapshot: this.snapshot })
      this.runCloseLifecycle("afterClose", { reason })
      this.unregisterSelfOverlay()
      this.deactivateFocus({ reason })
    }
  }

  private emit(): void {
    const snapshot = this.snapshot
    this.subscribers.forEach((listener) => listener(snapshot))
  }

  private runOpenLifecycle(hook: "beforeOpen" | "afterOpen", context: DialogOpenContext): void {
    const fn = this.lifecycle[hook]
    fn?.(context)
  }

  private runCloseLifecycle(hook: "beforeClose" | "afterClose", context: DialogCloseContext): void {
    const fn = this.lifecycle[hook]
    fn?.(context)
  }

  private activateFocus(context: DialogOpenContext): void {
    if (this.focusActive) return
    if (!this.focusOrchestrator) return
    this.focusActive = true
    this.focusOrchestrator.activate(context)
  }

  private deactivateFocus(context: DialogCloseContext): void {
    if (!this.focusActive) return
    this.focusActive = false
    this.focusOrchestrator?.deactivate(context)
  }

  private emitEvent<Event extends DialogEventName>(event: Event, payload: DialogEventMap[Event]): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners) return
    listeners.forEach((listener) => {
      ;(listener as (value: typeof payload) => void)(payload)
    })
  }

  private maybeNotifyPendingLimit(reason: DialogCloseReason): void {
    const limit = this.options.maxPendingAttempts
    if (!limit) return
    if (this.pendingAttempts < limit) return
    this.options.onPendingCloseLimitReached?.({
      reason,
      attempt: this.pendingAttempts,
      limit,
    })
  }

  private registerSelfOverlay(): void {
    if (this.selfOverlayDisposer) {
      return
    }
    this.selfOverlayDisposer = this.registerOverlay({ id: this.overlayId, kind: this.overlayKind })
  }

  private unregisterSelfOverlay(): void {
    if (!this.selfOverlayDisposer) {
      return
    }
    this.selfOverlayDisposer()
    this.selfOverlayDisposer = null
  }
}
