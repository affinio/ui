export interface LinearRange {
    start: number;
    end: number;
}
export interface LinearSelectionState {
    readonly ranges: readonly LinearRange[];
    readonly activeRangeIndex: number;
    readonly anchor: number | null;
    readonly focus: number | null;
}
export interface ResolveLinearSelectionInput {
    readonly ranges: readonly LinearRange[];
    readonly activeRangeIndex: number;
    readonly anchor?: number | null;
    readonly focus?: number | null;
}
export type ResolveLinearSelectionResult = LinearSelectionState;
export interface SelectLinearIndexInput {
    readonly index: number;
}
export interface ExtendLinearSelectionInput {
    readonly state: LinearSelectionState;
    readonly index: number;
}
export interface ToggleLinearIndexInput {
    readonly state: LinearSelectionState;
    readonly index: number;
}
export declare function normalizeLinearRange(range: LinearRange): LinearRange;
export declare function mergeLinearRanges(ranges: readonly LinearRange[]): LinearRange[];
export declare function addLinearRange(ranges: readonly LinearRange[], next: LinearRange): LinearRange[];
export declare function removeLinearRange(ranges: readonly LinearRange[], target: LinearRange): LinearRange[];
export declare function toggleLinearRange(ranges: readonly LinearRange[], target: LinearRange): LinearRange[];
export declare function resolveLinearSelectionUpdate(input: ResolveLinearSelectionInput): ResolveLinearSelectionResult;
export declare function selectLinearIndex(input: SelectLinearIndexInput): LinearSelectionState;
export declare function extendLinearSelectionToIndex(input: ExtendLinearSelectionInput): LinearSelectionState;
export declare function toggleLinearIndex(input: ToggleLinearIndexInput): LinearSelectionState;
export declare function clearLinearSelection(): LinearSelectionState;
export declare function emptyLinearSelectionState(): LinearSelectionState;
//# sourceMappingURL=linear.d.ts.map