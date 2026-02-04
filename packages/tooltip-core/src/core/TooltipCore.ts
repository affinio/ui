import { SurfaceCore } from "@affino/surface-core"
import type { PointerEventLike, SurfaceReason, SurfaceState } from "@affino/surface-core"
import {
  createOverlayIntegration,
  type OverlayCloseReason,
  type OverlayIntegration,
  type OverlayKind,
  type OverlayManager,
} from "@affino/overlay-kernel"
import type {
  TooltipCallbacks,
  TooltipContentProps,
  TooltipDescriptionOptions,
  TooltipDescriptionProps,
  TooltipOptions,
  TooltipState,
  TooltipTriggerOptions,
  TooltipTriggerProps,
  TooltipArrowParams,
  TooltipArrowProps,
} from "../types"

const DEFAULT_OVERLAY_KIND: OverlayKind = "tooltip"

export class TooltipCore extends SurfaceCore<TooltipState, TooltipCallbacks> {
  private focusWithin = false
  private readonly overlayKind: OverlayKind
  private readonly overlayIntegration: OverlayIntegration
  private destroyed = false

  constructor(options: TooltipOptions = {}, callbacks: TooltipCallbacks = {}) {
    super(options, callbacks)
    this.overlayKind = options.overlayKind ?? DEFAULT_OVERLAY_KIND
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
        returnFocus: overlayTraits.returnFocus ?? true,
        priority: overlayTraits.priority,
        root: overlayTraits.root ?? null,
        data: overlayTraits.data,
      },
      overlayManager: options.overlayManager ?? null,
      getOverlayManager: options.getOverlayManager,
      onCloseRequested: (reason) => this.handleKernelCloseRequest(reason),
      initialState: this.surfaceState.open ? "open" : "closed",
      releaseOnIdle: false,
    })
    this.overlayIntegration.syncState(this.surfaceState.open ? "open" : "closed")
  }

  protected override composeState(surface: SurfaceState): TooltipState {
    return surface
  }

  override destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.overlayIntegration.destroy()
    super.destroy()
  }

  protected override onOpened(_reason: SurfaceReason): void {
    this.overlayIntegration.syncState("open")
  }

  protected override onClosed(_reason: SurfaceReason): void {
    this.overlayIntegration.syncState("closed")
  }

  override close(reason: SurfaceReason = "programmatic"): void {
    this.requestClose(reason)
  }

  requestClose(reason: SurfaceReason = "programmatic"): void {
    this.closeWithSource(reason, "local")
  }

  getOverlayManager(): OverlayManager | null {
    return this.overlayIntegration.getManager()
  }

  getTriggerProps(options: TooltipTriggerOptions = {}): TooltipTriggerProps {
    const describedByTargets = [this.contentId]
    if (options.describedBy) {
      const extra = Array.isArray(options.describedBy) ? options.describedBy : [options.describedBy]
      describedByTargets.push(...extra.filter(Boolean))
    }
    return {
      id: this.triggerId,
      tabIndex: options.tabIndex ?? 0,
      "aria-describedby": describedByTargets.join(" ").trim(),
      onPointerEnter: (event) => {
        this.handlePointerEnter(event)
        this.timers.scheduleOpen(() => this.open("pointer"))
      },
      onPointerLeave: (event) => this.handlePointerLeave(event),
      onFocus: () => {
        this.focusWithin = true
        this.open("keyboard")
      },
      onBlur: () => {
        this.focusWithin = false
        this.requestClose("keyboard")
      },
    }
  }

  getTooltipProps(): TooltipContentProps {
    return {
      id: this.contentId,
      role: "tooltip",
      "data-state": this.getSnapshot().open ? "open" : "closed",
      onPointerEnter: (event) => this.handlePointerEnter(event),
      onPointerLeave: (event) => this.handlePointerLeave(event),
    }
  }

  getArrowProps(params: TooltipArrowParams): TooltipArrowProps {
    return resolveArrowProps(params)
  }

  getDescriptionProps(options: TooltipDescriptionOptions = {}): TooltipDescriptionProps {
    const state = this.getSnapshot().open ? "open" : "closed"
    const id = options.id ?? `${this.id}-description`
    return {
      id,
      role: options.role ?? "status",
      "aria-live": options.politeness ?? "polite",
      "aria-atomic": options.atomic ?? true,
      "aria-hidden": state === "open" ? "false" : "true",
      "data-state": state,
    }
  }

  protected override shouldIgnorePointerLeave(event?: PointerEventLike): boolean {
    if (this.focusWithin) {
      return true
    }
    return super.shouldIgnorePointerLeave(event)
  }

  private get triggerId() {
    return `${this.id}-trigger`
  }

  private get contentId() {
    return `${this.id}-content`
  }

  private closeWithSource(reason: SurfaceReason, source: "local" | "kernel"): void {
    if (this.destroyed) {
      return
    }
    if (source === "local" && this.isKernelManagedReason(reason)) {
      const overlayReason = this.mapSurfaceReasonToOverlay(reason)
      if (overlayReason && this.overlayIntegration.requestClose(overlayReason)) {
        return
      }
    }
    this.performClose(reason)
  }

  private performClose(reason: SurfaceReason): void {
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

  private handleKernelCloseRequest(reason: OverlayCloseReason): void {
    const surfaceReason = this.mapOverlayReasonToSurface(reason)
    if (!surfaceReason) {
      return
    }
    this.closeWithSource(surfaceReason, "kernel")
  }
}

const STATIC_SIDES: Record<TooltipArrowProps["data-placement"], "top" | "right" | "bottom" | "left"> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
}

const isVerticalPlacement = (placement: TooltipArrowProps["data-placement"]) => placement === "top" || placement === "bottom"

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveArrowProps({ anchorRect, tooltipRect, position, options = {} }: TooltipArrowParams): TooltipArrowProps {
  const placement = position.placement
  const align = position.align
  const isVertical = isVerticalPlacement(placement)
  const size = Math.max(options.size ?? 10, 1)
  const inset = Math.max(options.inset ?? 4, 0)
  const staticOffset = options.staticOffset ?? size / 2
  const half = size / 2
  const surfaceSpan = isVertical ? tooltipRect.width : tooltipRect.height
  const anchorCenter = isVertical
    ? anchorRect.x + anchorRect.width / 2
    : anchorRect.y + anchorRect.height / 2
  const surfaceStart = isVertical ? position.left : position.top
  const rawCenter = anchorCenter - surfaceStart
  const min = inset + half
  const max = Math.max(min, surfaceSpan - inset - half)
  const center = clamp(rawCenter, min, max)
  const crossOffset = center - half

  const style: Record<string, string | number> = {
    "--tooltip-arrow-size": `${size}px`,
    "--tooltip-arrow-align": align,
  }

  if (isVertical) {
    style.left = `${crossOffset}px`
  } else {
    style.top = `${crossOffset}px`
  }

  const staticSide = STATIC_SIDES[placement]
  style[staticSide] = `${-staticOffset}px`

  return {
    "data-placement": placement,
    "data-align": align,
    "data-arrow": placement,
    style,
  }
}
