import type { PositionResult, SurfaceCallbacks } from "../types";
export declare class SurfaceEvents<C extends SurfaceCallbacks = SurfaceCallbacks> {
    private readonly surfaceId;
    private readonly callbacks;
    constructor(surfaceId: string, callbacks?: C);
    emitOpen(): void;
    emitClose(): void;
    emitPosition(position: PositionResult): void;
}
//# sourceMappingURL=SurfaceEvents.d.ts.map