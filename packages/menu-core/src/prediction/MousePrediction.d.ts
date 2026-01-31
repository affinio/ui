import type { MousePredictionConfig, MousePredictionDebugCallback, Point, Rect } from "../types";
/**
 * Predicts whether the pointer is travelling toward the child submenu. Consumers push points and
 * query `isMovingToward` with the trigger and panel rects. All thresholds are configurable to make
 * the heuristic easier to tune for different UI densities.
 */
export declare class MousePrediction {
    private readonly points;
    private readonly config;
    private debugListener;
    constructor(config?: MousePredictionConfig);
    push(point: Point): void;
    clear(): void;
    enableDebug(callback?: MousePredictionDebugCallback): void;
    isMovingToward(target: Rect, origin: Rect): boolean;
}
export declare function predictMouseDirection(points: Point[], target: Rect, origin: Rect, config?: MousePredictionConfig): boolean;
//# sourceMappingURL=MousePrediction.d.ts.map