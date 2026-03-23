// Grid selection (2D)
export type {
	Anchor,
	SelectionArea,
	Range,
	SelectionGrid,
	GridSelectionPointLike,
	GridSelectionPoint,
	GridSelectionRangeInput,
	GridSelectionRange,
	GridSelectionContext,
} from "./types"

export {
	normalizeSelectionArea,
	clampSelectionArea,
	resolveSelectionBounds,
	mergeRanges,
	addRange,
	removeRange,
	isCellSelected,
	rangesFromSelection,
	selectionFromAreas,
	areaContainsCell,
} from "./geometry"

export {
	clampGridSelectionPoint,
	createGridSelectionRange,
	normalizeGridSelectionRange,
	createGridSelectionRangeFromInput,
} from "./range"

export {
	selectSingleCell,
	extendSelectionToPoint,
	appendSelectionRange,
	setSelectionRanges,
	applySelectionAreas,
	toggleCellSelection,
	clearSelection,
} from "./operations"

export {
	resolveSelectionUpdate,
	emptySelectionState,
} from "./update"
export type { HeadlessSelectionState, ResolveSelectionUpdateInput, ResolveSelectionUpdateResult } from "./update"

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
