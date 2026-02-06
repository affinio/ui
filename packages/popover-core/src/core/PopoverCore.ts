import { SurfaceCore } from "@affino/surface-core"
import type { SurfaceReason, SurfaceState } from "@affino/surface-core"
import {
  createOverlayIntegration,
  type OverlayCloseReason,
  type OverlayIntegration,
  type OverlayKind,
  type OverlayManager,
} from "@affino/overlay-kernel"
import type {
  PopoverArrowParams,
  PopoverArrowProps,
  PopoverCallbacks,
  PopoverContentOptions,
  PopoverContentProps,
  PopoverInteractOutsideEvent,
  PopoverOptions,
  PopoverRole,
  PopoverState,
  PopoverTriggerOptions,
  PopoverTriggerProps,
} from "../types"

const DEFAULT_OVERLAY_KIND: OverlayKind = "popover"

const DEFAULT_ROLE: PopoverRole = "dialog"
const SURFACE_TO_OVERLAY_CLOSE_REASON: Record<SurfaceReason, OverlayCloseReason> = {
  pointer: "pointer-outside",
  keyboard: "escape-key",
  programmatic: "programmatic",
}
const OVERLAY_TO_SURFACE_CLOSE_REASON: Record<string, SurfaceReason> = {
  "pointer-outside": "pointer",
  "escape-key": "keyboard",
}

export class PopoverCore extends SurfaceCore<PopoverState, PopoverCallbacks> {
  private readonly role: PopoverRole
  private readonly modal: boolean
  private readonly closeOnEscape: boolean
  private readonly closeOnInteractOutside: boolean
  private readonly overlayKind: OverlayKind
  private readonly triggerElementId: string
  private readonly contentElementId: string
  private readonly overlayIntegration: OverlayIntegration
  private destroyed = false

  constructor(options: PopoverOptions = {}, callbacks: PopoverCallbacks = {}) {
    super(options, callbacks)
    this.role = options.role ?? DEFAULT_ROLE
    this.modal = options.modal ?? false
    this.closeOnEscape = options.closeOnEscape ?? true
    this.closeOnInteractOutside = options.closeOnInteractOutside ?? true
    this.overlayKind = options.overlayKind ?? DEFAULT_OVERLAY_KIND
    this.triggerElementId = `${this.id}-trigger`
    this.contentElementId = `${this.id}-content`
    const overlayTraits = options.overlayEntryTraits ?? {}
    const resolvedModal = overlayTraits.modal ?? this.modal
    this.overlayIntegration = createOverlayIntegration({
      id: this.id,
      kind: this.overlayKind,
      traits: {
        ownerId: overlayTraits.ownerId ?? null,
        modal: resolvedModal,
        trapsFocus: overlayTraits.trapsFocus ?? resolvedModal,
        blocksPointerOutside: overlayTraits.blocksPointerOutside ?? resolvedModal,
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

  protected override composeState(surface: SurfaceState): PopoverState {
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

  getTriggerProps(options?: PopoverTriggerOptions): PopoverTriggerProps {
    const disabled = options?.disabled ?? false
    const type = options?.type ?? "button"
    const role = options?.role ?? this.role
    return {
      id: this.triggerElementId,
      type,
      disabled,
      "aria-haspopup": role,
      "aria-expanded": this.surfaceState.open ? "true" : "false",
      "aria-controls": this.contentElementId,
      onClick: (event) => {
        if (disabled) return
        event.preventDefault?.()
        this.toggle()
      },
      onKeyDown: (event) => {
        if (disabled) return
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          this.toggle()
        } else if (event.key === "Escape" && this.closeOnEscape) {
          event.stopPropagation()
          this.close("keyboard")
        }
      },
    }
  }

  getContentProps(options?: PopoverContentOptions): PopoverContentProps {
    const role = options?.role ?? this.role
    const modal = options?.modal ?? this.modal
    return {
      id: this.contentElementId,
      role,
      tabIndex: options?.tabIndex ?? -1,
      "aria-modal": modal ? "true" : undefined,
      "data-state": this.surfaceState.open ? "open" : "closed",
      onKeyDown: (event) => {
        if (event.key === "Escape" && this.closeOnEscape) {
          event.stopPropagation()
          this.close("keyboard")
        }
      },
    }
  }

  getArrowProps(params: PopoverArrowParams): PopoverArrowProps {
    return resolveArrowProps(params)
  }

  interactOutside(payload: PopoverInteractOutsideEvent) {
    this.callbacks.onInteractOutside?.(payload)
    if (this.closeOnInteractOutside) {
      this.close("pointer")
    }
  }

  shouldCloseOnInteractOutside(): boolean {
    return this.closeOnInteractOutside
  }

  isModal(): boolean {
    return this.modal
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

const STATIC_SIDES: Record<PopoverArrowProps["data-placement"], "top" | "right" | "bottom" | "left"> = {
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

function resolveArrowProps({ anchorRect, popoverRect, position, options }: PopoverArrowParams): PopoverArrowProps {
  const placement = position.placement
  const align = position.align
  const isVertical = placement === "top" || placement === "bottom"
  const size = Math.max(options?.size ?? 10, 1)
  const inset = Math.max(options?.inset ?? 4, 0)
  const staticOffset = options?.staticOffset ?? size / 2
  const half = size / 2
  const surfaceSpan = isVertical ? popoverRect.width : popoverRect.height
  const anchorCenter = isVertical ? anchorRect.x + anchorRect.width / 2 : anchorRect.y + anchorRect.height / 2
  const surfaceStart = isVertical ? position.left : position.top
  const rawCenter = anchorCenter - surfaceStart
  const min = inset + half
  const max = Math.max(min, surfaceSpan - inset - half)
  const center = clamp(rawCenter, min, max)
  const crossOffset = center - half

  const style: Record<string, string | number> = {
    "--popover-arrow-size": `${size}px`,
    "--popover-arrow-align": align,
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
