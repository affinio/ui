import { MenuCore } from "./MenuCore"
import { MousePrediction } from "../prediction/MousePrediction"
import type {
  ItemProps,
  MenuCallbacks,
  MenuOptions,
  PanelProps,
  PointerEventLike,
  Rect,
  TriggerProps,
} from "../types"
import type { MenuTreeState } from "./MenuTree"

function getProcessEnv() {
  if (typeof globalThis === "undefined") {
    return undefined
  }
  const candidate = (globalThis as { process?: { env?: Record<string, unknown> } }).process
  return candidate?.env as Record<string, unknown> | undefined
}

const isDebugMenuEnabled = () => (
  Boolean(getProcessEnv()?.DEBUG_MENU) ||
  (typeof globalThis !== "undefined" && Boolean((globalThis as Record<string, unknown>).__MENU_DEBUG__))
)

export interface SubmenuOptions extends MenuOptions {
  parentItemId: string
}

export class SubmenuCore extends MenuCore {
  protected override autoHighlightOnOpen = true
  private readonly parent: MenuCore
  private readonly parentItemId: string
  private readonly predictor: MousePrediction | null
  private triggerRect: Rect | null = null
  private panelRect: Rect | null = null
  private releaseTree: (() => void) | null = null

  constructor(parent: MenuCore, options: SubmenuOptions, callbacks: MenuCallbacks = {}) {
    const resolvedOptions: SubmenuOptions = {
      ...options,
      closeOnSelect: options.closeOnSelect ?? parent.isCloseOnSelectEnabled(),
      overlayKind: options.overlayKind ?? parent.getOverlayKind(),
      overlayManager: options.overlayManager ?? parent.getOverlayManager() ?? null,
      getOverlayManager:
        options.getOverlayManager ?? (() => parent.getOverlayManager()),
      overlayEntryTraits: {
        ownerId: options.overlayEntryTraits?.ownerId ?? parent.id,
        ...options.overlayEntryTraits,
      },
    }
    super(resolvedOptions, callbacks, parent.getTree(), {
      parentId: parent.id,
      parentItemId: options.parentItemId,
    })
    this.parent = parent
    this.parentItemId = options.parentItemId
    this.predictor = this.menuOptions.mousePrediction
      ? new MousePrediction(this.menuOptions.mousePrediction)
      : null
    this.configurePredictionDebug(callbacks)
    this.releaseTree = this.tree.subscribe(this.id, (state) => this.syncWithTree(state))
  }

  override destroy() {
    this.parent.releasePointerHighlightHold(this.parentItemId)
    this.releaseTree?.()
    this.releaseTree = null
    this.predictor?.clear()
    super.destroy()
  }

  override close(reason: "pointer" | "keyboard" | "programmatic" = "programmatic") {
    this.predictor?.clear()
    this.parent.releasePointerHighlightHold(this.parentItemId)
    super.close(reason)
  }

  override requestClose(reason: "pointer" | "keyboard" | "programmatic" = "programmatic") {
    const resolved = reason === "pointer" || reason === "keyboard" ? "programmatic" : reason
    super.requestClose(resolved)
  }

  setTriggerRect(rect: Rect | null) {
    this.triggerRect = rect
  }

  setPanelRect(rect: Rect | null) {
    this.panelRect = rect
  }

  recordPointer(point: { x: number; y: number }) {
    this.predictor?.push(point)
  }

  override select(id: string) {
    const shouldCascade = this.menuOptions.closeOnSelect
    super.select(id)
    if (!shouldCascade) {
      return
    }
    this.closeAncestorChain()
  }

  override getTriggerProps(): TriggerProps {
    const parentItem = this.parent.getItemProps(this.parentItemId)
    return {
      id: `${this.id}-trigger`,
      role: "button",
      tabIndex: parentItem.tabIndex,
      "aria-haspopup": "menu",
      "aria-expanded": this.getSnapshot().open,
      "aria-controls": `${this.id}-panel`,
      onPointerEnter: (event) => {
        this.recordPointerFromEvent(event)
        this.parent.highlight(this.parentItemId)
        this.keepChainOpen()
        this.timers.scheduleOpen(() => this.open("pointer"))
      },
      onPointerLeave: (event) => {
        if (this.shouldHoldPointer(event)) return
        this.parent.releasePointerHighlightHold(this.parentItemId)
        this.timers.scheduleClose(() => this.close("pointer"))
      },
      onClick: (event) => {
        const pointerEvent = event as PointerEventLike | undefined
        pointerEvent?.preventDefault?.()
        this.open("pointer")
      },
      onKeyDown: (event) => this.handleNestedTriggerKeydown(event),
    }
  }

  override getPanelProps(): PanelProps {
    const props = super.getPanelProps()
    return {
      ...props,
      onPointerEnter: (event) => {
        props.onPointerEnter?.(event)
        this.recordPointerFromEvent(event)
        this.keepChainOpen()
        this.parent.releasePointerHighlightHold(this.parentItemId)
      },
      onPointerLeave: (event) => {
        if (this.shouldHoldPointer(event)) return
        this.parent.releasePointerHighlightHold(this.parentItemId)
        props.onPointerLeave?.(event)
      },
    }
  }

  override getItemProps(id: string): ItemProps {
    const props = super.getItemProps(id)
    return {
      ...props,
      onPointerEnter: (event) => {
        props.onPointerEnter?.(event)
        this.recordPointerFromEvent(event)
      },
    }
  }

  private syncWithTree(state: MenuTreeState) {
    const isOpen = state.openPath.includes(this.id)
    if (!isOpen && this.getSnapshot().open) {
      super.close("programmatic")
    }
  }

  private closeAncestorChain() {
    let current: MenuCore | null = this.parent
    while (current) {
      if (!current.isCloseOnSelectEnabled()) {
        break
      }
      current.requestClose("programmatic")
      current = current instanceof SubmenuCore ? current.parent : null
    }
  }

  private shouldHoldPointer(event?: PointerEventLike): boolean {
    this.recordPointerFromEvent(event)
    const movingWithinTree = Boolean(event?.meta?.isWithinTree)
    if (event?.meta?.isInsidePanel && event.meta.relatedMenuId === this.id) {
      this.keepChainOpen()
      return true
    }
    if (event?.meta?.enteredChildPanel) {
      this.keepChainOpen()
      this.parent.holdPointerHighlight(this.parentItemId)
      return true
    }
    if (
      movingWithinTree &&
      this.triggerRect &&
      this.panelRect &&
      this.predictor?.isMovingToward(this.panelRect, this.triggerRect)
    ) {
      this.keepChainOpen()
      this.parent.holdPointerHighlight(this.parentItemId)
      return true
    }
    return false
  }

  private keepChainOpen() {
    this.timers.cancelClose()
    this.parent.cancelPendingClose()
  }

  private handleNestedTriggerKeydown(event: KeyboardEvent) {
    if (isDebugMenuEnabled()) {
      // eslint-disable-next-line no-console
      console.log("submenu core keydown", event.key)
    }
    if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      this.open("keyboard")
      this.ensureInitialHighlight()
      return
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault()
      this.close("keyboard")
      this.parent.highlight(this.parentItemId)
    }
  }

  private recordPointerFromEvent(event?: PointerEventLike) {
    if (!event || event.clientX == null || event.clientY == null) {
      return
    }
    this.recordPointer({ x: event.clientX, y: event.clientY })
  }

  private configurePredictionDebug(callbacks: MenuCallbacks) {
    if (!this.predictor) {
      return
    }
    if (callbacks.onDebug) {
      this.predictor.enableDebug((payload) => {
        this.menuEvents.emitDebug({
          type: "mouse-prediction",
          menuId: this.id,
          payload,
        })
      })
      return
    }
    if (isDebugMenuEnabled()) {
      this.predictor.enableDebug((payload) => {
        // eslint-disable-next-line no-console
        console.debug(`[menu:${this.id}] mouse-prediction`, payload)
      })
    }
  }
}
