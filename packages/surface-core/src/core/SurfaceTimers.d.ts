import type { SurfaceOptions } from "../types";
export declare class SurfaceTimers {
    private readonly options;
    private openTimer;
    private closeTimer;
    constructor(options: Required<Pick<SurfaceOptions, "openDelay" | "closeDelay">>);
    scheduleOpen(callback: () => void): void;
    scheduleClose(callback: () => void): void;
    cancelOpen(): void;
    cancelClose(): void;
    clearAll(): void;
}
//# sourceMappingURL=SurfaceTimers.d.ts.map