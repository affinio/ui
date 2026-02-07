import type {
  CloseGuard,
  CloseGuardDecision,
  CloseRequestOptions,
  CloseStrategy,
  DialogCloseReason,
  DialogControllerOptions,
  DialogControllerErrorEvent,
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
  DialogOverlayTraits,
} from "./types"
import { createOverlayInteractionMatrix } from "./overlay/interactionMatrix"
import type { OverlayInteractionMatrix } from "./overlay/interactionMatrix"
import {
  createOverlayIntegration,
  type OverlayIntegration,
  type OverlayCloseReason as KernelOverlayCloseReason,
  type OverlayManager,
} from "@affino/overlay-kernel"

const DEFAULT_PENDING_MESSAGE = "Dialog close pending"
const DEFAULT_GUARD_ERROR_MESSAGE = "Close guard failed"
let controllerId = 0

function createDialogId(prefix = "affino-dialog") {
  controllerId += 1
  return `${prefix}-${controllerId}`
}

export function createStandardModalDialogOptions(
  overrides: DialogControllerOptions = {},
): DialogControllerOptions {
  const mergedTraits: DialogOverlayTraits = {
    modal: true,
    trapsFocus: true,
    blocksPointerOutside: true,
    inertSiblings: true,
    returnFocus: true,
    ...(overrides.overlayEntryTraits ?? {}),
  }
  return {
    overlayKind: "dialog",
    closeStrategy: "blocking",
    ...overrides,
    overlayEntryTraits: mergedTraits,
  }
}

export function createStandardModalDialogController(
  overrides: DialogControllerOptions = {},
): DialogController {
  return new DialogController(createStandardModalDialogOptions(overrides))
}

function mapOverlayCloseReason(reason: KernelOverlayCloseReason): DialogCloseReason | null {
  switch (reason) {
    case "pointer-outside":
      return "backdrop"
    case "escape-key":
      return "escape-key"
    case "owner-close":
      return "nested-dialog-request"
    case "focus-loss":
      // Dialogs keep focus-loss as a no-op so ambient focus churn doesn't close modals.
      return null
    case "programmatic":
    default:
      return "programmatic"
  }
}

function mapDialogReasonToOverlayCloseReason(reason: DialogCloseReason): KernelOverlayCloseReason | null {
  switch (reason) {
    case "escape-key":
      return "escape-key"
    case "backdrop":
    case "pointer":
      return "pointer-outside"
    case "nested-dialog-request":
      return "owner-close"
    default:
      return null
  }
}

export class DialogController {
  private phase: DialogPhase
  private closeGuard?: CloseGuard
  private guardPromise: Promise<CloseGuardDecision> | null = null
  private guardOutcomePromise: Promise<boolean> | null = null
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
  private readonly overlayIntegration: OverlayIntegration
  private legacyOverlayDisposer: (() => void) | null = null
  private readonly pendingKernelCloseResolvers = new Set<(result: boolean) => void>()
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
    const overlayTraits = options.overlayEntryTraits ?? {}
    this.overlayIntegration = createOverlayIntegration({
      id: this.overlayId,
      kind: this.overlayKind,
      traits: {
        ownerId: overlayTraits.ownerId ?? null,
        modal: overlayTraits.modal ?? true,
        trapsFocus: overlayTraits.trapsFocus ?? true,
        blocksPointerOutside: overlayTraits.blocksPointerOutside ?? true,
        inertSiblings: overlayTraits.inertSiblings ?? true,
        returnFocus: overlayTraits.returnFocus ?? true,
        priority: overlayTraits.priority,
        root: overlayTraits.root ?? null,
        data: overlayTraits.data,
      },
      overlayManager: options.overlayManager ?? null,
      getOverlayManager: options.getOverlayManager,
      onCloseRequested: (reason) => this.handleKernelCloseRequest(reason),
      onRegistered: () => this.emitEvent("overlay-registered", { id: this.overlayId, kind: this.overlayKind }),
      onUnregistered: () => this.emitEvent("overlay-unregistered", { id: this.overlayId, kind: this.overlayKind }),
    })
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
    this.resolveKernelCloseRequests(false)
    this.subscribers.clear()
    this.eventListeners.clear()
    this.guardPromise = null
    this.guardOutcomePromise = null
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
    return this.requestClose(reason, request)
  }

  async requestClose(
    reason: DialogCloseReason = "programmatic",
    request: CloseRequestOptions = {}
  ): Promise<boolean> {
    if (!this.canHandleClose(reason)) {
      return false
    }

    if (this.isKernelManagedReason(reason)) {
      const manager = this.overlayIntegration.getManager()
      if (manager) {
        return this.requestKernelMediatedClose(manager, reason, request)
      }
      if (!this.canHandleCloseLegacy(reason)) {
        return false
      }
    }

    return this.performClose(reason, request)
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

  canHandleClose(reason: DialogCloseReason = "programmatic"): boolean {
    if (this.destroyed) {
      return false
    }
    if (!this.canAttemptClose()) {
      return false
    }
    if (!this.isKernelManagedReason(reason)) {
      return true
    }
    const manager = this.overlayIntegration.getManager()
    if (manager) {
      return Boolean(manager.getEntry(this.overlayId))
    }
    return this.canHandleCloseLegacy(reason)
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
      this.syncOverlayState(next)
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

  private emitError(event: DialogControllerErrorEvent): void {
    this.options.onError?.(event)
    this.emitEvent("error", event)
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

  private syncOverlayState(next: DialogPhase): void {
    const handled = this.overlayIntegration.syncState(next)
    if (handled) {
      this.unregisterLegacyOverlay()
      return
    }
    if (next === "idle" || next === "closed") {
      this.unregisterLegacyOverlay()
    } else {
      this.registerLegacyOverlay()
    }
  }

  private registerLegacyOverlay(): void {
    if (this.legacyOverlayDisposer) {
      return
    }
    this.legacyOverlayDisposer = this.registerOverlay({ id: this.overlayId, kind: this.overlayKind })
  }

  private unregisterLegacyOverlay(): void {
    if (!this.legacyOverlayDisposer) {
      return
    }
    this.legacyOverlayDisposer()
    this.legacyOverlayDisposer = null
  }

  private handleKernelCloseRequest(reason: KernelOverlayCloseReason): void {
    const dialogReason = mapOverlayCloseReason(reason)
    if (!dialogReason) {
      this.resolveKernelCloseRequests(false)
      return
    }
    void this.performClose(dialogReason, {}).then((result) => {
      this.resolveKernelCloseRequests(result)
    })
  }

  private isKernelManagedReason(reason: DialogCloseReason): boolean {
    return reason === "escape-key" || reason === "backdrop" || reason === "pointer"
  }

  private requestKernelMediatedClose(
    manager: OverlayManager,
    reason: DialogCloseReason,
    _request: CloseRequestOptions,
  ): Promise<boolean> {
    const overlayReason = mapDialogReasonToOverlayCloseReason(reason)
    if (!overlayReason) {
      return this.performClose(reason)
    }
    return new Promise<boolean>((resolve) => {
      let settled = false
      const resolver = (result: boolean) => {
        if (settled) {
          return
        }
        settled = true
        resolve(result)
      }
      this.pendingKernelCloseResolvers.add(resolver)
      manager.requestClose(this.overlayId, overlayReason)
      queueMicrotask(() => {
        if (settled) {
          return
        }
        if (this.pendingKernelCloseResolvers.delete(resolver)) {
          resolver(false)
        }
      })
    })
  }

  private resolveKernelCloseRequests(result: boolean): void {
    if (!this.pendingKernelCloseResolvers.size) {
      return
    }
    const resolvers = Array.from(this.pendingKernelCloseResolvers)
    this.pendingKernelCloseResolvers.clear()
    resolvers.forEach((resolve) => resolve(result))
  }

  private async performClose(
    reason: DialogCloseReason,
    request: CloseRequestOptions = {},
  ): Promise<boolean> {
    if (this.destroyed) {
      return false
    }
    if (!this.canAttemptClose()) {
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
      return this.guardOutcomePromise ?? Promise.resolve(false)
    }

    this.pendingAttempts = 0
    this.guardMessage = undefined
    const strategy = request.strategy ?? this.defaultStrategy

    const pendingDecision = Promise.resolve().then(() =>
      this.closeGuard!({ reason, metadata: request.metadata })
    )
    this.guardPromise = pendingDecision
    this.guardOutcomePromise = pendingDecision
      .then((decision) => decision.outcome === "allow")
      .catch(() => false)

    if (strategy === "optimistic") {
      this.optimisticClose = true
      this.optimisticReason = reason
      this.enterClosing(reason)
    } else {
      this.emit()
    }

    try {
      const decision = await pendingDecision
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
    } catch (error) {
      const message = resolveErrorMessage(error, DEFAULT_GUARD_ERROR_MESSAGE)
      this.guardMessage = message
      if (strategy === "optimistic") {
        this.transition("open")
      } else {
        this.emit()
      }
      this.emitError({
        code: "close-guard-error",
        phase: this.phase,
        reason,
        error,
        message,
      })
      return false
    } finally {
      this.guardPromise = null
      this.guardOutcomePromise = null
      this.optimisticClose = false
      this.optimisticReason = undefined
      this.emit()
    }
  }

  private canAttemptClose(): boolean {
    if (this.phase === "idle" || this.phase === "closed") {
      return false
    }
    if (this.phase === "closing" && !this.guardPromise) {
      return false
    }
    return true
  }

  private canHandleCloseLegacy(reason: DialogCloseReason): boolean {
    if (!this.overlayRegistrar) {
      return true
    }
    if (reason !== "backdrop" && reason !== "escape-key") {
      return true
    }
    return this.overlayRegistrar.isTopMost(this.overlayId)
  }

  private registerSelfOverlay(): void {
    this.syncOverlayState(this.phase)
  }

  private unregisterSelfOverlay(): void {
    this.overlayIntegration.destroy()
    this.unregisterLegacyOverlay()
  }
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) {
    return error
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) {
      return message
    }
  }
  return fallback
}
