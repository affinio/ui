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
} from "./linear"
export type {
	LinearRange,
	LinearSelectionState,
	ResolveLinearSelectionInput,
	ResolveLinearSelectionResult,
} from "./linear"
