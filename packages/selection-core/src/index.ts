export * from "@affino/grid-selection-core"

// Linear selection (1D)
export {
	normalizeLinearRange,
	mergeLinearRanges,
	addLinearRange,
	removeLinearRange,
	toggleLinearRange,
	resolveLinearSelectionUpdate,
	emptyLinearSelectionState,
	selectLinearIndex,
	extendLinearSelectionToIndex,
	toggleLinearIndex,
	clearLinearSelection,
} from "./linear"
export type {
	LinearRange,
	LinearSelectionState,
	ResolveLinearSelectionInput,
	ResolveLinearSelectionResult,
	SelectLinearIndexInput,
	ExtendLinearSelectionInput,
	ToggleLinearIndexInput,
} from "./linear"
