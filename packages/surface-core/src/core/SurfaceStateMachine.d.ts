import type { SurfaceState } from "../types";
export interface SurfaceStateChange {
    changed: boolean;
    state: SurfaceState;
}
export declare class SurfaceStateMachine {
    private state;
    constructor(initialOpen?: boolean);
    get snapshot(): SurfaceState;
    open(): SurfaceStateChange;
    close(): SurfaceStateChange;
    toggle(): SurfaceStateChange;
}
//# sourceMappingURL=SurfaceStateMachine.d.ts.map