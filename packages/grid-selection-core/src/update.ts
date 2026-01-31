import {
  clampGridSelectionPoint,
  normalizeGridSelectionRange,
} from "./range"
import {
  mergeRanges as mergeSelectionAreas,
  rangesFromSelection,
} from "./geometry"
import type {
  GridSelectionContext,
  GridSelectionPoint,
  GridSelectionPointLike,
  GridSelectionRange,
  SelectionArea,
} from "./types"
import { clampIndex } from "./utils"

/**
 * Immutable-by-convention snapshot describing the current selection.
 * Callers should treat instances as read-only data for rendering or diffing.
 */
export interface HeadlessSelectionState<TRowKey = unknown> {
  readonly ranges: readonly GridSelectionRange<TRowKey>[]
  readonly areas: readonly SelectionArea[]
  readonly activeRangeIndex: number
  readonly selectedPoint: GridSelectionPoint<TRowKey> | null
  readonly anchorPoint: GridSelectionPoint<TRowKey> | null
  readonly dragAnchorPoint: GridSelectionPoint<TRowKey> | null
}

export interface ResolveSelectionUpdateInput<TRowKey = unknown> {
  ranges: readonly GridSelectionRange<TRowKey>[]
  activeRangeIndex: number
  context: GridSelectionContext<TRowKey>
  selectedPoint?: GridSelectionPointLike<TRowKey> | null
  anchorPoint?: GridSelectionPointLike<TRowKey> | null
  dragAnchorPoint?: GridSelectionPointLike<TRowKey> | null
}

export type ResolveSelectionUpdateResult<TRowKey = unknown> = HeadlessSelectionState<TRowKey>

/**
 * Normalizes input ranges against grid constraints and produces a coherent selection snapshot.
 * Throws when required invariants (like the active range index) are violated.
 */
export function resolveSelectionUpdate<TRowKey = unknown>(
  input: ResolveSelectionUpdateInput<TRowKey>,
): ResolveSelectionUpdateResult<TRowKey> {
  const normalized = input.ranges
    .map(range => normalizeGridSelectionRange(range, input.context))
    .filter((range): range is GridSelectionRange<TRowKey> => range != null)

  if (!normalized.length) {
    return {
      ranges: [],
      areas: [],
      activeRangeIndex: -1,
      selectedPoint: null,
      anchorPoint: null,
      dragAnchorPoint: null,
    }
  }

  if (input.activeRangeIndex < 0 || input.activeRangeIndex >= normalized.length) {
    throw new Error(
      `Selection invariant violated: activeRangeIndex ${input.activeRangeIndex} is invalid for ${normalized.length} normalized range(s)`,
    )
  }

  const nextActiveIndex = clampIndex(input.activeRangeIndex, 0, normalized.length - 1)
  const activeRange = normalized[nextActiveIndex]
  if (!activeRange) {
    throw new Error("resolveSelectionUpdate: missing active range")
  }

  const selectedPoint = input.selectedPoint === undefined
    ? clonePoint(activeRange.focus)
    : input.selectedPoint
      ? clampGridSelectionPoint(input.selectedPoint, input.context)
      : null

  const anchorPoint = input.anchorPoint === undefined
    ? clonePoint(activeRange.anchor)
    : input.anchorPoint
      ? clampGridSelectionPoint(input.anchorPoint, input.context)
      : null

  const dragAnchorPoint = input.dragAnchorPoint === undefined
    ? (anchorPoint ? clonePoint(anchorPoint) : null)
    : input.dragAnchorPoint
      ? clampGridSelectionPoint(input.dragAnchorPoint, input.context)
      : null

  const areas = mergeSelectionAreas(rangesFromSelection(normalized))

  const state: HeadlessSelectionState<TRowKey> = {
    ranges: normalized,
    areas,
    activeRangeIndex: nextActiveIndex,
    selectedPoint,
    anchorPoint,
    dragAnchorPoint,
  }

  return state
}

export function emptySelectionState<TRowKey = unknown>(): HeadlessSelectionState<TRowKey> {
  return {
    ranges: [],
    areas: [],
    activeRangeIndex: -1,
    selectedPoint: null,
    anchorPoint: null,
    dragAnchorPoint: null,
  }
}

function clonePoint<TRowKey>(point: GridSelectionPoint<TRowKey>): GridSelectionPoint<TRowKey> {
  return {
    rowIndex: point.rowIndex,
    colIndex: point.colIndex,
    rowId: point.rowId ?? null,
  }
}
