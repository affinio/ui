import { SurfaceCore } from "@affino/surface-core"
import type { PointerEventLike, SurfaceReason, SurfaceState } from "@affino/surface-core"
import {
  createOverlayIntegration,
  type OverlayIntegration,
  type OverlayCloseReason,
  type OverlayKind,
  type OverlayManager,
} from "@affino/overlay-kernel"
import type {
  EventHandler,
  ItemProps,
  MenuCallbacks,
  MenuOptions,
  MenuState,
  PanelProps,
  TriggerProps,
  MousePredictionConfig,
} from "../types"
import type { HighlightChange } from "./StateMachine"
import { ItemRegistry } from "./ItemRegistry"
import { MenuEvents } from "./Events"
import { MenuStateMachine } from "./StateMachine"
import { MenuTree } from "./MenuTree"

interface NormalizedMenuOptions {
  closeOnSelect: boolean
  loopFocus: boolean
  mousePrediction: MousePredictionConfig
}

interface ParentLink {
  parentId: string
  parentItemId: string | null
}
export class MenuCore extends SurfaceCore<MenuState, MenuCallbacks> {
  protected readonly registry = new ItemRegistry()
  protected readonly selectionMachine: MenuStateMachine
  protected readonly tree: MenuTree
  protected readonly menuOptions: NormalizedMenuOptions
  protected readonly menuEvents: MenuEvents
  protected autoHighlightOnOpen = false
  private pointerHighlightLock: { id: string; timer: ReturnType<typeof setTimeout> | null } | null = null
  private readonly overlayKind: OverlayKind
  private readonly overlayIntegration: OverlayIntegration
  private destroyedLocal = false

  constructor(options: MenuOptions = {}, callbacks: MenuCallbacks = {}, tree?: MenuTree, parentLink?: ParentLink) {
    super(options, callbacks)
    this.menuOptions = {
      closeOnSelect: options.closeOnSelect ?? true,
      loopFocus: options.loopFocus ?? true,
      mousePrediction: options.mousePrediction ?? {},
    }
    this.menuEvents = new MenuEvents(this.id, callbacks)
    this.overlayKind = options.overlayKind ?? "menu"
    const overlayTraits = options.overlayEntryTraits ?? {}
    this.overlayIntegration = createOverlayIntegration({
      id: this.id,
      kind: this.overlayKind,
      traits: {
        ownerId: overlayTraits.ownerId ?? null,
        modal: overlayTraits.modal ?? false,
        trapsFocus: overlayTraits.trapsFocus ?? false,
        blocksPointerOutside: overlayTraits.blocksPointerOutside ?? false,
        inertSiblings: overlayTraits.inertSiblings ?? false,
        returnFocus: overlayTraits.returnFocus ?? false,
        priority: overlayTraits.priority,
        root: overlayTraits.root ?? null,
        data: overlayTraits.data,
      },
      overlayManager: options.overlayManager ?? null,
      getOverlayManager: options.getOverlayManager,
      onCloseRequested: (reason) => this.handleKernelCloseRequest(reason),
      initialState: this.surfaceState.open ? "open" : "idle",
      releaseOnIdle: false,
    })
    this.selectionMachine = new MenuStateMachine({
      loopFocus: this.menuOptions.loopFocus,
      closeOnSelect: this.menuOptions.closeOnSelect,
    })
    const existingTree = Boolean(tree)
    this.tree = tree ?? new MenuTree(this.id)
    if (existingTree || parentLink) {
      this.tree.register(this.id, parentLink?.parentId ?? null, parentLink?.parentItemId ?? null)
    }
    if (this.surfaceState.open) {
      this.syncOverlayState(true)
    }
  }

  override destroy() {
    if (this.destroyedLocal) {
      return
    }
    this.destroyedLocal = true
    this.tree.unregister(this.id)
    this.releasePointerHighlightHold()
    this.teardownOverlayIntegration()
    super.destroy()
  }

  protected override composeState(surface: SurfaceState): MenuState {
    return {
      ...surface,
      activeItemId: this.selectionMachine.snapshot.activeItemId,
    }
  }

  protected override onOpened(_reason: SurfaceReason) {
    this.syncOverlayState(true)
    this.tree.updateOpenState(this.id, true)
    if (this.autoHighlightOnOpen) {
      this.ensureInitialHighlight()
    }
  }

  protected override onClosed(_reason: SurfaceReason) {
    this.syncOverlayState(false)
    const before = this.selectionMachine.snapshot.activeItemId
    this.tree.updateOpenState(this.id, false)
    this.selectionMachine.reset()
    if (before !== null) {
      this.handleHighlightChange({ changed: true, previous: before, current: null })
    }
  }

  registerItem(id: string, options: { disabled?: boolean } = {}) {
    const disabled = Boolean(options.disabled)
    const allowUpdate = this.registry.has(id)
    const registration = this.registry.register(id, disabled, allowUpdate)
    if (registration.changed) {
      const change = this.selectionMachine.handleItemsChanged(this.getEnabledItemIds(), this.surfaceState.open)
      if (this.handleHighlightChange(change)) {
        this.emitState()
      }
    }
    return () => {
      const removed = this.registry.unregister(id)
      if (!removed) {
        return
      }
      const invalidation = this.selectionMachine.handleItemsChanged(this.getEnabledItemIds(), this.surfaceState.open)
      if (this.handleHighlightChange(invalidation)) {
        this.emitState()
      }
    }
  }

  highlight(id: string | null) {
    const change = this.selectionMachine.highlight(id, this.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  moveFocus(delta: 1 | -1) {
    const change = this.selectionMachine.moveFocus(delta, this.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  override close(reason: SurfaceReason = "programmatic") {
    this.requestClose(reason)
  }

  requestClose(reason: SurfaceReason = "programmatic") {
    this.closeWithSource(reason, "local")
  }

  private closeWithSource(reason: SurfaceReason, source: "local" | "kernel") {
    if (this.destroyedLocal) {
      return
    }
    if (source === "local" && this.isKernelManagedReason(reason)) {
      const overlayReason = this.mapSurfaceReasonToOverlay(reason)
      if (overlayReason && this.requestOverlayClose(overlayReason)) {
        return
      }
    }
    this.performClose(reason)
  }

  private performClose(reason: SurfaceReason) {
    super.close(reason)
  }

  protected isKernelManagedReason(reason: SurfaceReason): boolean {
    return reason === "pointer" || reason === "keyboard"
  }

  private mapSurfaceReasonToOverlay(reason: SurfaceReason): OverlayCloseReason | null {
    switch (reason) {
      case "pointer":
        return "pointer-outside"
      case "keyboard":
        return "escape-key"
      case "programmatic":
      default:
        return "programmatic"
    }
  }

  private mapOverlayReasonToSurface(reason: OverlayCloseReason): SurfaceReason | null {
    switch (reason) {
      case "pointer-outside":
        return "pointer"
      case "escape-key":
        return "keyboard"
      case "owner-close":
      case "focus-loss":
      case "programmatic":
      default:
        return "programmatic"
    }
  }

  private handleKernelCloseRequest(reason: OverlayCloseReason) {
    const surfaceReason = this.mapOverlayReasonToSurface(reason)
    if (!surfaceReason) {
      return
    }
    this.closeWithSource(surfaceReason, "kernel")
  }

  select(id: string) {
    const { accepted, shouldClose } = this.selectionMachine.handleSelection(this.surfaceState.open)
    if (!accepted) return
    this.menuEvents.emitSelect(id)
    if (shouldClose) {
      this.requestClose("programmatic")
    }
  }

  getTriggerProps(): TriggerProps {
    return {
      id: `${this.id}-trigger`,
      role: "button",
      tabIndex: 0,
      "aria-haspopup": "menu",
      "aria-expanded": this.surfaceState.open,
      "aria-controls": `${this.id}-panel`,
      onPointerEnter: (event) => {
        this.handlePointerEnter(event)
        this.timers.scheduleOpen(() => this.open("pointer"))
      },
      onPointerLeave: (event) => this.handlePointerLeave(event),
      onClick: () => this.toggle(),
      onKeyDown: this.handleTriggerKeydown,
    }
  }

  getPanelProps(): PanelProps {
    return {
      id: `${this.id}-panel`,
      role: "menu",
      tabIndex: -1,
      "aria-labelledby": `${this.id}-trigger`,
      onKeyDown: this.handlePanelKeydown,
      onPointerEnter: (event) => this.handlePointerEnter(event),
      onPointerLeave: (event) => this.handlePointerLeave(event),
    }
  }

  getItemProps(id: string): ItemProps {
    const highlighted = this.selectionMachine.snapshot.activeItemId === id
    const disabled = this.registry.isDisabled(id)
    return {
      id,
      role: "menuitem",
      tabIndex: highlighted ? 0 : -1,
      "aria-disabled": disabled ? true : undefined,
      "data-state": highlighted ? "highlighted" : "idle",
      onPointerEnter: () => {
        if (this.pointerHighlightLock && this.pointerHighlightLock.id !== id) {
          this.releasePointerHighlightHold()
        }
        if (!disabled && !this.shouldBlockPointerHighlight(id)) {
          this.highlight(id)
        }
      },
      onClick: (event) => {
        if (disabled) {
          event.preventDefault?.()
          return
        }
        this.select(id)
      },
      onKeyDown: (event) => this.handleItemKeydown(event, id, disabled),
    }
  }

  /** Shared tree instance for nested menus. */
  getTree(): MenuTree {
    return this.tree
  }

  isCloseOnSelectEnabled() {
    return this.menuOptions.closeOnSelect
  }

  protected ensureInitialHighlight() {
    const change = this.selectionMachine.ensureInitialHighlight(this.getEnabledItemIds(), this.surfaceState.open)
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  holdPointerHighlight(itemId: string, duration = this.options.closeDelay) {
    if (this.selectionMachine.snapshot.activeItemId !== itemId) {
      return
    }
    if (this.pointerHighlightLock?.id === itemId) {
      return
    }
    this.releasePointerHighlightHold()
    const timer = duration > 0 ? setTimeout(() => {
      if (this.pointerHighlightLock?.id === itemId) {
        this.pointerHighlightLock = null
      }
    }, duration) : null
    this.pointerHighlightLock = { id: itemId, timer }
  }

  releasePointerHighlightHold(itemId?: string) {
    if (!this.pointerHighlightLock) return
    if (itemId && this.pointerHighlightLock.id !== itemId) return
    if (this.pointerHighlightLock.timer) {
      clearTimeout(this.pointerHighlightLock.timer)
    }
    this.pointerHighlightLock = null
  }

  protected shouldBlockPointerHighlight(targetId: string) {
    return Boolean(this.pointerHighlightLock && this.pointerHighlightLock.id !== targetId)
  }

  protected override handlePointerEnter(event?: PointerEventLike) {
    if (event?.meta?.isWithinTree) {
      this.cancelPendingClose()
      return
    }
    this.timers.cancelClose()
  }

  protected override shouldIgnorePointerLeave(event?: PointerEventLike) {
    const meta = event?.meta
    if (!meta) {
      return false
    }
    if (meta.isWithinTree) {
      return true
    }
    if (meta.enteredChildPanel) {
      return true
    }
    if (meta.isInsidePanel) {
      return true
    }
    return false
  }

  protected override handlePointerLeave(event?: PointerEventLike) {
    if (this.shouldIgnorePointerLeave(event)) {
      this.cancelPendingClose()
      return
    }
    this.timers.cancelOpen()
    this.timers.scheduleClose(() => this.requestClose("pointer"))
  }

  protected handleHighlightChange(change: HighlightChange) {
    if (!change.changed) return false
    this.menuEvents.emitHighlight(change.current)
    this.tree.updateHighlight(this.id, change.current)
    return true
  }

  protected handleTriggerKeydown: EventHandler<KeyboardEvent> = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.toggle()
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      this.open("keyboard")
      this.ensureInitialHighlight()
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      this.open("keyboard")
      const enabled = this.getEnabledItemIds()
      if (enabled.length) {
        const last = enabled[enabled.length - 1] ?? null
        this.highlight(last)
      }
    }
  }

  protected handlePanelKeydown: EventHandler<KeyboardEvent> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      this.requestClose("keyboard")
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      this.moveFocus(1)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      this.moveFocus(-1)
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      const enabled = this.getEnabledItemIds()
      if (enabled.length) {
        const first = enabled[0] ?? null
        this.highlight(first)
      }
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      const enabled = this.getEnabledItemIds()
      if (enabled.length) {
        const last = enabled[enabled.length - 1] ?? null
        this.highlight(last)
      }
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      const active = this.selectionMachine.snapshot.activeItemId
      if (active) {
        event.preventDefault()
        this.select(active)
      }
    }
  }

  protected handleItemKeydown(event: KeyboardEvent, id: string, disabled: boolean) {
    if (disabled) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
      }
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.select(id)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      this.moveFocus(-1)
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      this.moveFocus(1)
    }
  }

  getOverlayManager(): OverlayManager | null {
    try {
      return this.overlayIntegration.getManager()
    } catch (error) {
      this.emitOverlayDebug("get-manager", error)
      return null
    }
  }

  getOverlayKind(): OverlayKind {
    return this.overlayKind
  }

  private syncOverlayState(isOpen: boolean) {
    try {
      this.overlayIntegration.syncState(isOpen ? "open" : "closed")
    } catch (error) {
      this.emitOverlayDebug("sync-state", error)
    }
  }

  private getEnabledItemIds(): readonly string[] {
    return this.registry.getEnabledItemIdsSnapshot()
  }

  private teardownOverlayIntegration() {
    try {
      this.overlayIntegration.destroy()
    } catch (error) {
      this.emitOverlayDebug("destroy", error)
    }
  }

  private requestOverlayClose(reason: OverlayCloseReason): boolean {
    try {
      return this.overlayIntegration.requestClose(reason)
    } catch (error) {
      this.emitOverlayDebug("request-close", error)
      return false
    }
  }

  private emitOverlayDebug(operation: "sync-state" | "request-close" | "destroy" | "get-manager", error: unknown) {
    this.menuEvents.emitDebug({
      type: "overlay-error",
      menuId: this.id,
      operation,
      error,
    })
  }
}
