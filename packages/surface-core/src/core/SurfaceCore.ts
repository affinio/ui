import { SurfaceEvents } from "./SurfaceEvents"
import { SurfaceTimers } from "./SurfaceTimers"
import { SurfaceStateMachine } from "./SurfaceStateMachine"
import { computePosition } from "../positioning/computePosition"
import type {
  PointerEventLike,
  PositionOptions,
  PositionResult,
  Rect,
  SurfaceCallbacks,
  SurfaceOptions,
  SurfaceReason,
  SurfaceState,
  SurfaceSubscriber,
  Subscription,
} from "../types"

let idCounter = 0

interface NormalizedSurfaceOptions extends Required<Omit<SurfaceOptions, "id">> {
  id: string
}

const DEFAULT_OPTIONS: NormalizedSurfaceOptions = {
  id: "",
  openDelay: 80,
  closeDelay: 150,
  defaultOpen: false,
}

export class SurfaceCore<
  State extends SurfaceState = SurfaceState,
  Callbacks extends SurfaceCallbacks = SurfaceCallbacks,
> {
  readonly id: string
  protected readonly options: NormalizedSurfaceOptions
  protected readonly callbacks: Callbacks
  protected readonly events: SurfaceEvents<Callbacks>
  protected readonly timers: SurfaceTimers
  protected readonly stateMachine: SurfaceStateMachine
  private readonly subscribers = new Set<SurfaceSubscriber<State>>()
  private destroyed = false

  constructor(options: SurfaceOptions = {}, callbacks: Callbacks = {} as Callbacks) {
    const resolvedId = options.id ?? `surface-${++idCounter}`
    this.id = resolvedId
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      id: resolvedId,
      defaultOpen: options.defaultOpen ?? DEFAULT_OPTIONS.defaultOpen,
    }
    this.callbacks = callbacks
    this.events = new SurfaceEvents(this.id, callbacks)
    this.timers = new SurfaceTimers({
      openDelay: this.options.openDelay,
      closeDelay: this.options.closeDelay,
    })
    this.stateMachine = new SurfaceStateMachine(this.options.defaultOpen)
  }

  destroy() {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.subscribers.clear()
    this.timers.clearAll()
  }

  getSnapshot(): State {
    return this.composeState(this.stateMachine.snapshot)
  }

  subscribe(listener: SurfaceSubscriber<State>): Subscription {
    if (this.destroyed) {
      return {
        unsubscribe: () => {},
      }
    }
    this.subscribers.add(listener)
    listener(this.getSnapshot())
    return {
      unsubscribe: () => {
        this.subscribers.delete(listener)
      },
    }
  }

  open(reason: SurfaceReason = "programmatic") {
    if (this.destroyed) return
    const result = this.stateMachine.open()
    if (!result.changed) return
    this.timers.cancelClose()
    this.events.emitOpen()
    this.onOpened(reason)
    this.emitState()
  }

  close(reason: SurfaceReason = "programmatic") {
    if (this.destroyed) return
    const result = this.stateMachine.close()
    if (!result.changed) return
    this.timers.cancelOpen()
    this.events.emitClose()
    this.onClosed(reason)
    this.emitState()
  }

  toggle() {
    if (this.destroyed) return
    const result = this.stateMachine.toggle()
    if (!result.changed) return
    if (result.state.open) {
      this.timers.cancelClose()
      this.events.emitOpen()
      this.onOpened("programmatic")
    } else {
      this.timers.cancelOpen()
      this.events.emitClose()
      this.onClosed("programmatic")
    }
    this.emitState()
  }

  computePosition(anchor: Rect, surface: Rect, options: PositionOptions = {}): PositionResult {
    const position = computePosition(anchor, surface, options)
    if (!this.destroyed) {
      this.events.emitPosition(position)
    }
    return position
  }

  cancelPendingClose() {
    if (this.destroyed) return
    this.timers.cancelClose()
  }

  protected composeState(surface: SurfaceState): State {
    return surface as State
  }

  protected get surfaceState(): SurfaceState {
    return this.stateMachine.snapshot
  }

  protected emitState() {
    if (this.destroyed) return
    const next = this.getSnapshot()
    this.subscribers.forEach((listener) => listener(next))
  }

  protected onOpened(_reason: SurfaceReason) {}

  protected onClosed(_reason: SurfaceReason) {}

  protected handlePointerEnter(_event?: PointerEventLike) {
    if (this.destroyed) return
    this.timers.cancelClose()
  }

  protected shouldIgnorePointerLeave(_event?: PointerEventLike) {
    return false
  }

  protected handlePointerLeave(event?: PointerEventLike) {
    if (this.destroyed) return
    if (this.shouldIgnorePointerLeave(event)) {
      this.cancelPendingClose()
      return
    }
    this.timers.cancelOpen()
    this.timers.scheduleClose(() => this.close("pointer"))
  }
}
