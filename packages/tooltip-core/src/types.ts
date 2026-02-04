import type {
  EventHandler,
  PointerEventLike,
  PositionResult,
  Rect,
  SurfaceCallbacks,
  SurfaceOptions,
  SurfaceReason,
  SurfaceState,
  SurfaceSubscriber,
  Subscription,
} from "@affino/surface-core"
import type { OverlayEntryInit, OverlayKind, OverlayManager } from "@affino/overlay-kernel"

export type {
  EventHandler,
  PointerEventLike,
  Subscription,
  SurfaceReason,
  PositionOptions,
} from "@affino/surface-core"

export interface TooltipCallbacks extends SurfaceCallbacks {}

export interface TooltipOptions extends SurfaceOptions {
  overlayKind?: OverlayKind
  overlayManager?: OverlayManager | null
  getOverlayManager?: () => OverlayManager | null | undefined
  overlayEntryTraits?: TooltipOverlayTraits
}

export interface TooltipState extends SurfaceState {}

export type TooltipSubscriber = SurfaceSubscriber<TooltipState>

export type TooltipReason = SurfaceReason

export interface TooltipTriggerProps {
  id: string
  tabIndex: number
  "aria-describedby": string
  onPointerEnter?: EventHandler<PointerEventLike>
  onPointerLeave?: EventHandler<PointerEventLike>
  onFocus?: EventHandler<FocusEvent>
  onBlur?: EventHandler<FocusEvent>
}

export interface TooltipContentProps {
  id: string
  role: "tooltip"
  "data-state": "open" | "closed"
  onPointerEnter?: EventHandler<PointerEventLike>
  onPointerLeave?: EventHandler<PointerEventLike>
}

export interface TooltipTriggerOptions {
  describedBy?: string | string[]
  tabIndex?: number
}

export interface TooltipArrowOptions {
  size?: number
  inset?: number
  staticOffset?: number
}

export interface TooltipArrowParams {
  anchorRect: Rect
  tooltipRect: Rect
  position: PositionResult
  options?: TooltipArrowOptions
}

export interface TooltipArrowProps {
  "data-placement": PositionResult["placement"]
  "data-align": PositionResult["align"]
  "data-arrow": PositionResult["placement"]
  style: Record<string, string | number>
}

export interface TooltipDescriptionOptions {
  id?: string
  politeness?: "polite" | "assertive"
  role?: "status" | "alert" | "log"
  atomic?: boolean
}

export interface TooltipDescriptionProps {
  id: string
  role: "status" | "alert" | "log"
  "aria-live": "polite" | "assertive"
  "aria-atomic": boolean
  "aria-hidden": "true" | "false"
  "data-state": "open" | "closed"
}

export type TooltipOverlayTraits = Partial<
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
