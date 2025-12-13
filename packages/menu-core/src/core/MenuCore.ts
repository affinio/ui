import { computePosition } from "../positioning/computePosition"
import type {
  EventHandler,
  ItemProps,
  MenuCallbacks,
  MenuOptions,
  MenuState,
  MenuSubscriber,
  PanelProps,
  Rect,
  Subscription,
  TriggerProps,
} from "../types"
import type { HighlightChange } from "./StateMachine"
import { ItemRegistry } from "./ItemRegistry"
import { MenuEvents } from "./Events"
import { MenuStateMachine } from "./StateMachine"
import { MenuTimers } from "./Timers"
import { MenuTree } from "./MenuTree"

let idCounter = 0

interface NormalizedOptions extends Required<MenuOptions> {}

const DEFAULT_OPTIONS: NormalizedOptions = {
  id: "",
  openDelay: 80,
  closeDelay: 150,
  closeOnSelect: true,
  loopFocus: true,
  mousePrediction: {},
}

export class MenuCore {
  readonly id: string
  protected readonly options: NormalizedOptions
  protected readonly subscribers = new Set<MenuSubscriber>()
  protected readonly registry = new ItemRegistry()
  protected readonly timers: MenuTimers
  protected readonly stateMachine: MenuStateMachine
  protected readonly events: MenuEvents
  protected readonly tree: MenuTree
  protected autoHighlightOnOpen = false

  constructor(options: MenuOptions = {}, callbacks: MenuCallbacks = {}, tree?: MenuTree, parentLink?: { parentId: string; parentItemId: string | null }) {
    const resolvedId = options.id ?? `menu-${++idCounter}`
    this.id = resolvedId
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      id: resolvedId,
      mousePrediction: options.mousePrediction ?? {},
    }
    this.events = new MenuEvents(this.id, callbacks)
    this.stateMachine = new MenuStateMachine({
      loopFocus: this.options.loopFocus,
      closeOnSelect: this.options.closeOnSelect,
    })
    this.timers = new MenuTimers({ openDelay: this.options.openDelay, closeDelay: this.options.closeDelay })
    const existingTree = Boolean(tree)
    this.tree = tree ?? new MenuTree(this.id)
    if (existingTree || parentLink) {
      this.tree.register(this.id, parentLink?.parentId ?? null, parentLink?.parentItemId ?? null)
    }
  }

  destroy() {
    this.subscribers.clear()
    this.timers.clearAll()
    this.tree.unregister(this.id)
  }

  getSnapshot(): MenuState {
    return this.stateMachine.snapshot
  }

  subscribe(listener: MenuSubscriber): Subscription {
    this.subscribers.add(listener)
    listener(this.getSnapshot())
    return {
      unsubscribe: () => {
        this.subscribers.delete(listener)
      },
    }
  }

  open(reason: "pointer" | "keyboard" | "programmatic" = "programmatic") {
    const result = this.stateMachine.open()
    if (!result.changed) return
    this.timers.cancelClose()
    this.tree.updateOpenState(this.id, true)
    this.events.emitOpen()
    if (this.autoHighlightOnOpen) {
      this.ensureInitialHighlight()
    }
    this.emitState()
  }

  close(reason: "pointer" | "keyboard" | "programmatic" = "programmatic") {
    const before = this.stateMachine.snapshot.activeItemId
    const result = this.stateMachine.close()
    if (!result.changed) return
    this.timers.cancelOpen()
    this.tree.updateOpenState(this.id, false)
    this.events.emitClose()
    const after = this.stateMachine.snapshot.activeItemId
    if (before !== after) {
      this.handleHighlightChange({ changed: true, previous: before, current: after })
    }
    this.emitState()
  }

  toggle() {
    const before = this.stateMachine.snapshot.activeItemId
    const result = this.stateMachine.toggle()
    if (result.changed) {
      if (result.state.open) {
        this.tree.updateOpenState(this.id, true)
        this.events.emitOpen()
        if (this.autoHighlightOnOpen) {
          this.ensureInitialHighlight()
        }
      } else {
        this.tree.updateOpenState(this.id, false)
        this.events.emitClose()
        const after = this.stateMachine.snapshot.activeItemId
        if (before !== after) {
          this.handleHighlightChange({ changed: true, previous: before, current: after })
        }
      }
      this.emitState()
    }
  }

  registerItem(id: string, options: { disabled?: boolean } = {}) {
    const disabled = Boolean(options.disabled)
    const allowUpdate = this.registry.has(id)
    this.registry.register(id, disabled, allowUpdate)
    const change = this.stateMachine.handleItemsChanged(this.registry.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
    return () => {
      this.registry.unregister(id)
      const invalidation = this.stateMachine.handleItemsChanged(this.registry.getEnabledItemIds())
      if (this.handleHighlightChange(invalidation)) {
        this.emitState()
      }
    }
  }

  highlight(id: string | null) {
    const change = this.stateMachine.highlight(id, this.registry.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  moveFocus(delta: 1 | -1) {
    const change = this.stateMachine.moveFocus(delta, this.registry.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  select(id: string) {
    const { accepted, shouldClose } = this.stateMachine.handleSelection()
    if (!accepted) return
    this.events.emitSelect(id)
    if (shouldClose) {
      this.close("programmatic")
    }
  }

  getTriggerProps(): TriggerProps {
    return {
      id: `${this.id}-trigger`,
      role: "button",
      tabIndex: 0,
      "aria-haspopup": "menu",
      "aria-expanded": this.stateMachine.snapshot.open,
      "aria-controls": `${this.id}-panel`,
      onPointerEnter: () => this.timers.scheduleOpen(() => this.open("pointer")),
      onPointerLeave: () => this.timers.scheduleClose(() => this.close("pointer")),
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
      onPointerEnter: () => this.timers.cancelClose(),
      onPointerLeave: () => this.timers.scheduleClose(() => this.close("pointer")),
    }
  }

  getItemProps(id: string): ItemProps {
    const highlighted = this.stateMachine.snapshot.activeItemId === id
    const disabled = this.registry.isDisabled(id)
    return {
      id,
      role: "menuitem",
      tabIndex: highlighted ? 0 : -1,
      "aria-disabled": disabled ? true : undefined,
      "data-state": highlighted ? "highlighted" : "idle",
      onPointerEnter: () => {
        if (!disabled) {
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

  computePosition(anchor: Rect, panel: Rect, options = {}) {
    const position = computePosition(anchor, panel, options)
    this.events.emitPosition(position)
    return position
  }

  /** Shared tree instance for nested menus. */
  getTree(): MenuTree {
    return this.tree
  }

  /** Exposed so children can keep the chain open while interacting. */
  cancelPendingClose() {
    this.timers.cancelClose()
  }

  protected ensureInitialHighlight() {
    const change = this.stateMachine.ensureInitialHighlight(this.registry.getEnabledItemIds())
    if (this.handleHighlightChange(change)) {
      this.emitState()
    }
  }

  protected emitState() {
    const snapshot = this.getSnapshot()
    this.subscribers.forEach((subscriber) => subscriber(snapshot))
  }

  protected handleHighlightChange(change: HighlightChange) {
    if (!change.changed) return false
    this.events.emitHighlight(change.current)
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
      const enabled = this.registry.getEnabledItemIds()
      if (enabled.length) {
        this.highlight(enabled[enabled.length - 1])
      }
    }
  }

  protected handlePanelKeydown: EventHandler<KeyboardEvent> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      this.close("keyboard")
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
      const enabled = this.registry.getEnabledItemIds()
      if (enabled.length) {
        this.highlight(enabled[0])
      }
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      const enabled = this.registry.getEnabledItemIds()
      if (enabled.length) {
        this.highlight(enabled[enabled.length - 1])
      }
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      const active = this.stateMachine.snapshot.activeItemId
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
}
