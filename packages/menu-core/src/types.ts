import type {
  EventHandler,
  PointerEventLike,
  Point,
  PositionOptions,
  PositionResult,
  Rect,
  SurfaceCallbacks,
  SurfaceOptions,
  SurfaceState,
  SurfaceSubscriber,
} from "@affino/surface-core"
import type { OverlayEntryInit, OverlayKind, OverlayManager } from "@affino/overlay-kernel"

export type {
  Point,
  Rect,
  Placement,
  Alignment,
  PositionOptions,
  PositionResult,
  PointerMeta,
  PointerEventLike,
  EventHandler,
  Subscription,
} from "@affino/surface-core"

export interface MousePredictionConfig {
  history?: number
  verticalTolerance?: number
  headingThreshold?: number
  samplingOffset?: number
  horizontalThreshold?: number
  driftBias?: number
  maxAge?: number
}

export interface MousePredictionDebugPayload {
  points: ReadonlyArray<Point>
  target: Rect
  origin: Rect
  headingScore: number
  orientation: "horizontal" | "vertical"
  withinIntentTriangle: boolean
  withinCorridor: boolean
  forwardProgress: number
}

export type MousePredictionDebugCallback = (payload: MousePredictionDebugPayload) => void

export interface MenuMousePredictionDebugEvent {
  type: "mouse-prediction"
  menuId: string
  payload: MousePredictionDebugPayload
}

export interface MenuOverlayErrorDebugEvent {
  type: "overlay-error"
  menuId: string
  operation: "sync-state" | "request-close" | "destroy" | "get-manager"
  error: unknown
}

export type MenuDebugEvent = MenuMousePredictionDebugEvent | MenuOverlayErrorDebugEvent

export interface MenuCallbacks extends SurfaceCallbacks {
  onSelect?: (itemId: string, menuId: string) => void
  onHighlight?: (itemId: string | null, menuId: string) => void
  onDebug?: (event: MenuDebugEvent) => void
}

export interface MenuOptions extends SurfaceOptions {
  closeOnSelect?: boolean
  loopFocus?: boolean
  mousePrediction?: MousePredictionConfig | null | false
  overlayManager?: OverlayManager | null
  getOverlayManager?: () => OverlayManager | null | undefined
  overlayKind?: OverlayKind
  overlayEntryTraits?: MenuOverlayTraits
}

export type MenuOverlayTraits = Partial<
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

export interface MenuState extends SurfaceState {
  activeItemId: string | null
}

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

export type MenuSubscriber = SurfaceSubscriber<MenuState>
