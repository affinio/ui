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
const SURFACE_TO_OVERLAY_CLOSE_REASON: Record<SurfaceReason, OverlayCloseReason> = {
  pointer: "pointer-outside",
  keyboard: "escape-key",
  programmatic: "programmatic",
}
const OVERLAY_TO_SURFACE_CLOSE_REASON: Record<string, SurfaceReason> = {
  "pointer-outside": "pointer",
  "escape-key": "keyboard",
}

export class TooltipCore extends SurfaceCore<TooltipState, TooltipCallbacks> {
  private focusWithin = false
  private readonly overlayKind: OverlayKind
  private readonly triggerElementId: string
  private readonly contentElementId: string
  private readonly descriptionElementId: string
  private readonly overlayIntegration: OverlayIntegration
  private destroyed = false

  constructor(options: TooltipOptions = {}, callbacks: TooltipCallbacks = {}) {
    super(options, callbacks)
    this.overlayKind = options.overlayKind ?? DEFAULT_OVERLAY_KIND
    this.triggerElementId = `${this.id}-trigger`
    this.contentElementId = `${this.id}-content`
    this.descriptionElementId = `${this.id}-description`
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

  getTriggerProps(options?: TooltipTriggerOptions): TooltipTriggerProps {
    const describedByOption = options?.describedBy
    let describedBy = this.contentElementId

    if (typeof describedByOption === "string") {
      if (describedByOption) {
        describedBy = `${describedBy} ${describedByOption}`
      }
    } else if (Array.isArray(describedByOption)) {
      for (const candidate of describedByOption) {
        if (candidate) {
          describedBy = `${describedBy} ${candidate}`
        }
      }
    }

    return {
      id: this.triggerElementId,
      tabIndex: options?.tabIndex ?? 0,
      "aria-describedby": describedBy,
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
      id: this.contentElementId,
      role: "tooltip",
      "data-state": this.surfaceState.open ? "open" : "closed",
      onPointerEnter: (event) => this.handlePointerEnter(event),
      onPointerLeave: (event) => this.handlePointerLeave(event),
    }
  }

  getArrowProps(params: TooltipArrowParams): TooltipArrowProps {
    return resolveArrowProps(params)
  }

  getDescriptionProps(options?: TooltipDescriptionOptions): TooltipDescriptionProps {
    const state = this.surfaceState.open ? "open" : "closed"
    const id = options?.id ?? this.descriptionElementId
    return {
      id,
      role: options?.role ?? "status",
      "aria-live": options?.politeness ?? "polite",
      "aria-atomic": options?.atomic ?? true,
      "aria-hidden": state === "open" ? "false" : "true",
      "data-state": state,
    }
  }

  protected override shouldIgnorePointerLeave(event?: PointerEventLike): boolean {
    return this.focusWithin || super.shouldIgnorePointerLeave(event)
  }

  private closeWithSource(reason: SurfaceReason, source: "local" | "kernel"): void {
    if (this.destroyed || !this.surfaceState.open) {
      return
    }
    if (source === "local" && this.isKernelManagedReason(reason)) {
      const overlayReason = this.mapSurfaceReasonToOverlay(reason)
      if (this.overlayIntegration.requestClose(overlayReason)) {
        return
      }
    }
    this.performClose(reason)
  }

  private performClose(reason: SurfaceReason): void {
    super.close(reason)
  }

  protected isKernelManagedReason(reason: SurfaceReason): boolean {
    return reason !== "programmatic"
  }

  private mapSurfaceReasonToOverlay(reason: SurfaceReason): OverlayCloseReason {
    return SURFACE_TO_OVERLAY_CLOSE_REASON[reason]
  }

  private mapOverlayReasonToSurface(reason: OverlayCloseReason): SurfaceReason {
    return OVERLAY_TO_SURFACE_CLOSE_REASON[reason] ?? "programmatic"
  }

  private handleKernelCloseRequest(reason: OverlayCloseReason): void {
    const surfaceReason = this.mapOverlayReasonToSurface(reason)
    this.closeWithSource(surfaceReason, "kernel")
  }
}

const STATIC_SIDES: Record<TooltipArrowProps["data-placement"], "top" | "right" | "bottom" | "left"> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
}

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveArrowProps({ anchorRect, tooltipRect, position, options }: TooltipArrowParams): TooltipArrowProps {
  const placement = position.placement
  const align = position.align
  const isVertical = placement === "top" || placement === "bottom"
  const size = Math.max(options?.size ?? 10, 1)
  const inset = Math.max(options?.inset ?? 4, 0)
  const staticOffset = options?.staticOffset ?? size / 2
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
