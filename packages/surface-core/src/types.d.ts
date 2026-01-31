export interface Point {
    x: number;
    y: number;
    time?: number;
}
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type Placement = "left" | "right" | "top" | "bottom" | "auto";
export type Alignment = "start" | "center" | "end" | "auto";
export interface PositionOptions {
    gutter?: number;
    viewportPadding?: number;
    placement?: Placement;
    align?: Alignment;
    viewportWidth?: number;
    viewportHeight?: number;
}
export interface PositionResult {
    left: number;
    top: number;
    placement: Exclude<Placement, "auto">;
    align: Exclude<Alignment, "auto">;
}
export interface PointerMeta {
    isInsidePanel?: boolean;
    enteredChildPanel?: boolean;
    relatedTargetId?: string | null;
    isWithinTree?: boolean;
    relatedMenuId?: string | null;
}
export interface PointerEventLike {
    clientX?: number;
    clientY?: number;
    meta?: PointerMeta;
    preventDefault?: () => void;
}
export type EventHandler<E = unknown> = (event: E) => void;
export type SurfaceReason = "pointer" | "keyboard" | "programmatic";
export interface SurfaceCallbacks {
    onOpen?: (surfaceId: string) => void;
    onClose?: (surfaceId: string) => void;
    onPositionChange?: (surfaceId: string, position: PositionResult) => void;
}
export interface SurfaceOptions {
    id?: string;
    openDelay?: number;
    closeDelay?: number;
    defaultOpen?: boolean;
}
export interface SurfaceState {
    open: boolean;
}
export interface Subscription {
    unsubscribe: () => void;
}
export type SurfaceSubscriber<State extends SurfaceState = SurfaceState> = (state: State) => void;
//# sourceMappingURL=types.d.ts.map