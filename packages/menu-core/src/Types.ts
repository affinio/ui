export interface Point {
  x: number
  y: number
  time?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Placement = "left" | "right" | "top" | "bottom" | "auto"
export type Alignment = "start" | "center" | "end" | "auto"

export interface PositionOptions {
  gutter?: number
  viewportPadding?: number
  placement?: Placement
  align?: Alignment
  viewportWidth?: number
  viewportHeight?: number
}

export interface PositionResult {
  left: number
  top: number
  placement: Exclude<Placement, "auto">
  align: Exclude<Alignment, "auto">
}

export interface MousePredictionConfig {
  history?: number
  verticalTolerance?: number
  headingThreshold?: number
  samplingOffset?: number
  horizontalThreshold?: number
  driftBias?: number
}

export interface MousePredictionDebugPayload {
  points: ReadonlyArray<Point>
  target: Rect
  origin: Rect
  headingScore: number
  orientation: "horizontal" | "vertical"
  withinCorridor: boolean
  forwardProgress: number
}

export type MousePredictionDebugCallback = (payload: MousePredictionDebugPayload) => void

export interface MenuCallbacks {
  onOpen?: (menuId: string) => void
  onClose?: (menuId: string) => void
  onSelect?: (itemId: string, menuId: string) => void
  onHighlight?: (itemId: string | null, menuId: string) => void
  onPositionChange?: (menuId: string, position: PositionResult) => void
}

export interface MenuOptions {
  id?: string
  openDelay?: number
  closeDelay?: number
  closeOnSelect?: boolean
  loopFocus?: boolean
  mousePrediction?: MousePredictionConfig
}

export interface MenuState {
  open: boolean
  activeItemId: string | null
}

export interface PointerMeta {
  isInsidePanel?: boolean
  enteredChildPanel?: boolean
  relatedTargetId?: string | null
}

export interface PointerEventLike {
  clientX?: number
  clientY?: number
  meta?: PointerMeta
  preventDefault?: () => void
}

export type EventHandler<E = unknown> = (event: E) => void

export interface TriggerProps {
  id: string
  role: "button"
  tabIndex: number
  "aria-haspopup": "menu"
  "aria-expanded": boolean
  "aria-controls": string
  onPointerEnter?: EventHandler<PointerEventLike>
  onPointerLeave?: EventHandler<PointerEventLike>
  onClick?: EventHandler
  onKeyDown?: EventHandler<KeyboardEvent>
}

export interface PanelProps {
  id: string
  role: "menu"
  tabIndex: number
  "aria-labelledby": string
  onKeyDown?: EventHandler<KeyboardEvent>
  onPointerEnter?: EventHandler<PointerEventLike>
  onPointerLeave?: EventHandler<PointerEventLike>
}

export interface ItemProps {
  id: string
  role: "menuitem"
  tabIndex: number
  "aria-disabled"?: boolean
  "data-state": "highlighted" | "idle"
  onPointerEnter?: EventHandler<PointerEventLike>
  onClick?: EventHandler<MouseEvent>
  onKeyDown?: EventHandler<KeyboardEvent>
}

export interface Subscription {
  unsubscribe: () => void
}

export type MenuSubscriber = (state: MenuState) => void
