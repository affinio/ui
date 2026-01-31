import type {
  EventHandler,
  PositionResult,
  Rect,
  SurfaceCallbacks,
  SurfaceOptions,
  SurfaceReason,
  SurfaceState,
  SurfaceSubscriber,
  Subscription,
} from "@affino/surface-core"

export type { PositionOptions, SurfaceReason, Subscription } from "@affino/surface-core"

export type PopoverRole = "dialog" | "menu" | "listbox" | "tree" | "grid"

export interface PopoverOptions extends SurfaceOptions {
  role?: PopoverRole
  modal?: boolean
  closeOnEscape?: boolean
  closeOnInteractOutside?: boolean
}

export interface PopoverCallbacks extends SurfaceCallbacks {
  onInteractOutside?: (event: PopoverInteractOutsideEvent) => void
}

export interface PopoverInteractOutsideEvent {
  event: Event
  target: EventTarget | null
}

export interface PopoverState extends SurfaceState {}

export type PopoverSubscriber = SurfaceSubscriber<PopoverState>

export interface PopoverTriggerOptions {
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  role?: PopoverRole
}

export interface PopoverTriggerProps {
  id: string
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  "aria-haspopup": PopoverRole
  "aria-expanded": "true" | "false"
  "aria-controls": string
  onClick?: EventHandler<MouseEvent>
  onKeyDown?: EventHandler<KeyboardEvent>
}

export interface PopoverContentOptions {
  role?: PopoverRole | "region"
  tabIndex?: number
  modal?: boolean
}

export interface PopoverContentProps {
  id: string
  role: string
  tabIndex: number
  "aria-modal"?: "true"
  "data-state": "open" | "closed"
  onKeyDown?: EventHandler<KeyboardEvent>
}

export interface PopoverArrowOptions {
  size?: number
  inset?: number
  staticOffset?: number
}

export interface PopoverArrowParams {
  anchorRect: Rect
  popoverRect: Rect
  position: PositionResult
  options?: PopoverArrowOptions
}

export interface PopoverArrowProps {
  "data-placement": PositionResult["placement"]
  "data-align": PositionResult["align"]
  "data-arrow": PositionResult["placement"]
  style: Record<string, string | number>
}
