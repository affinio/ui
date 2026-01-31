import type { Point, Rect } from "../types";
export interface Vector {
    x: number;
    y: number;
}
export declare function subtract(a: Point, b: Point): Vector;
export declare function magnitude(vector: Vector): number;
export declare function dotProduct(a: Vector, b: Vector): number;
export declare function center(rect: Rect): Point;
export declare function clamp(value: number, min: number, max: number): number;
//# sourceMappingURL=helpers.d.ts.map