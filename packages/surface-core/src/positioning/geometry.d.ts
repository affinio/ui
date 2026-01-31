export type Axis = "x" | "y";
export declare const SIDES: readonly ["bottom", "top", "right", "left"];
export type Side = (typeof SIDES)[number];
export declare const ALIGNMENTS: readonly ["start", "center", "end"];
export declare function clamp(value: number, min: number, max: number): number;
export declare function sideAxis(side: Side): Axis;
export declare function crossAxis(side: Side): Axis;
//# sourceMappingURL=geometry.d.ts.map