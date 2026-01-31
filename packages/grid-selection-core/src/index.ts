// Types
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

// Geometry helpers
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

// Range utilities
export {
  clampGridSelectionPoint,
  createGridSelectionRange,
  normalizeGridSelectionRange,
  createGridSelectionRangeFromInput,
} from "./range"

// Core operations
export {
  selectSingleCell,
  extendSelectionToPoint,
  appendSelectionRange,
  setSelectionRanges,
  applySelectionAreas,
  toggleCellSelection,
  clearSelection,
} from "./operations"

// State management
export {
  resolveSelectionUpdate,
  emptySelectionState,
} from "./update"
export type { HeadlessSelectionState, ResolveSelectionUpdateInput, ResolveSelectionUpdateResult } from "./update"
