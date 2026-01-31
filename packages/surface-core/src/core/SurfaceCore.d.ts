import { SurfaceEvents } from "./SurfaceEvents";
import { SurfaceTimers } from "./SurfaceTimers";
import { SurfaceStateMachine } from "./SurfaceStateMachine";
import type { PointerEventLike, PositionOptions, PositionResult, Rect, SurfaceCallbacks, SurfaceOptions, SurfaceReason, SurfaceState, SurfaceSubscriber, Subscription } from "../types";
interface NormalizedSurfaceOptions extends Required<Omit<SurfaceOptions, "id">> {
    id: string;
}
export declare class SurfaceCore<State extends SurfaceState = SurfaceState, Callbacks extends SurfaceCallbacks = SurfaceCallbacks> {
    readonly id: string;
    protected readonly options: NormalizedSurfaceOptions;
    protected readonly callbacks: Callbacks;
    protected readonly events: SurfaceEvents<Callbacks>;
    protected readonly timers: SurfaceTimers;
    protected readonly stateMachine: SurfaceStateMachine;
    private readonly subscribers;
    constructor(options?: SurfaceOptions, callbacks?: Callbacks);
    destroy(): void;
    getSnapshot(): State;
    subscribe(listener: SurfaceSubscriber<State>): Subscription;
    open(reason?: SurfaceReason): void;
    close(reason?: SurfaceReason): void;
    toggle(): void;
    computePosition(anchor: Rect, surface: Rect, options?: PositionOptions): PositionResult;
    cancelPendingClose(): void;
    protected composeState(surface: SurfaceState): State;
    protected get surfaceState(): SurfaceState;
    protected emitState(): void;
    protected onOpened(_reason: SurfaceReason): void;
    protected onClosed(_reason: SurfaceReason): void;
    protected handlePointerEnter(_event?: PointerEventLike): void;
    protected shouldIgnorePointerLeave(_event?: PointerEventLike): boolean;
    protected handlePointerLeave(event?: PointerEventLike): void;
}
export {};
//# sourceMappingURL=SurfaceCore.d.ts.map