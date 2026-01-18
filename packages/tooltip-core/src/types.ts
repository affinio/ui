import type {
  EventHandler,
  PointerEventLike,
  SurfaceCallbacks,
  SurfaceOptions,
  SurfaceReason,
  SurfaceState,
  SurfaceSubscriber,
  Subscription,
} from "@affino/surface-core"

export type {
  EventHandler,
  PointerEventLike,
  Subscription,
  SurfaceReason,
  PositionOptions,
} from "@affino/surface-core"

export interface TooltipCallbacks extends SurfaceCallbacks {}

export interface TooltipOptions extends SurfaceOptions {}

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
