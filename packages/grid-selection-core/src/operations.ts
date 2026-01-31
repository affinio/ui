import {
  addRange,
  clampSelectionArea,
  isCellSelected,
  removeRange,
} from "./geometry"
import {
  clampGridSelectionPoint,
  createGridSelectionRange,
} from "./range"
import type {
  GridSelectionContext,
  GridSelectionPointLike,
  GridSelectionRange,
  SelectionArea,
} from "./types"
import {
  resolveSelectionUpdate,
  type HeadlessSelectionState,
  type ResolveSelectionUpdateResult,
} from "./update"
import { clampIndex } from "./utils"

function areaContainsPoint<TRowKey>(range: GridSelectionRange<TRowKey>, rowIndex: number, colIndex: number) {
  return (
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol
  )
}

function createRangeFromArea<TRowKey>(area: SelectionArea, context: GridSelectionContext<TRowKey>): GridSelectionRange<TRowKey> {
  return createGridSelectionRange(
    { rowIndex: area.startRow, colIndex: area.startCol },
    { rowIndex: area.endRow, colIndex: area.endCol },
    context,
  )
}

/**
 * Focuses a single grid cell by creating a 1x1 range anchored and focused on the same point.
 */
export function selectSingleCell<TRowKey>(input: {
  point: GridSelectionPointLike<TRowKey>
  context: GridSelectionContext<TRowKey>
}): ResolveSelectionUpdateResult<TRowKey> {
  const normalized = clampGridSelectionPoint(input.point, input.context)
  const range = createGridSelectionRange(normalized, normalized, input.context)

  return resolveSelectionUpdate<TRowKey>({
    ranges: [range],
    activeRangeIndex: 0,
    context: input.context,
    selectedPoint: normalized,
    anchorPoint: normalized,
    dragAnchorPoint: normalized,
  })
}

/**
 * Extends the active range toward a new focus while preserving the original anchor.
 */
export function extendSelectionToPoint<TRowKey>(input: {
  state: HeadlessSelectionState<TRowKey>
  activeRangeIndex: number
  point: GridSelectionPointLike<TRowKey>
  context: GridSelectionContext<TRowKey>
}): ResolveSelectionUpdateResult<TRowKey> {
  const { state, context } = input
  if (!state.ranges.length) {
    return selectSingleCell({ point: input.point, context })
  }

  const index = clampIndex(input.activeRangeIndex, 0, state.ranges.length - 1)
  const anchor = state.ranges[index]?.anchor ?? { rowIndex: 0, colIndex: 0 }
  const normalizedPoint = clampGridSelectionPoint(input.point, context)
  const nextRange = createGridSelectionRange(anchor, normalizedPoint, context)
  const ranges = state.ranges.slice()
  ranges[index] = nextRange

  return resolveSelectionUpdate<TRowKey>({
    ranges,
    activeRangeIndex: index,
    context,
    selectedPoint: normalizedPoint,
  })
}

export function appendSelectionRange<TRowKey>(input: {
  state: HeadlessSelectionState<TRowKey>
  range: GridSelectionRange<TRowKey>
  context: GridSelectionContext<TRowKey>
}): ResolveSelectionUpdateResult<TRowKey> {
  const ranges = input.state.ranges.concat(input.range)
  const activeIndex = Math.max(ranges.length - 1, 0)
  return resolveSelectionUpdate<TRowKey>({
    ranges,
    activeRangeIndex: activeIndex,
    context: input.context,
  })
}

export function setSelectionRanges<TRowKey>(input: {
  ranges: readonly GridSelectionRange<TRowKey>[]
  context: GridSelectionContext<TRowKey>
  activeRangeIndex?: number
  selectedPoint?: GridSelectionPointLike<TRowKey> | null
  anchorPoint?: GridSelectionPointLike<TRowKey> | null
  dragAnchorPoint?: GridSelectionPointLike<TRowKey> | null
}): ResolveSelectionUpdateResult<TRowKey> {
  const resolvedActiveIndex =
    input.activeRangeIndex !== undefined
      ? input.activeRangeIndex
      : input.ranges.length
        ? 0
        : -1

  return resolveSelectionUpdate<TRowKey>({
    ranges: input.ranges,
    activeRangeIndex: resolvedActiveIndex,
    context: input.context,
    selectedPoint:
      input.selectedPoint === undefined
        ? undefined
        : input.selectedPoint,
    anchorPoint:
      input.anchorPoint === undefined
        ? undefined
        : input.anchorPoint,
    dragAnchorPoint:
      input.dragAnchorPoint === undefined
        ? undefined
        : input.dragAnchorPoint,
  })
}

export function applySelectionAreas<TRowKey>(input: {
  areas: readonly SelectionArea[]
  context: GridSelectionContext<TRowKey>
  state?: HeadlessSelectionState<TRowKey>
  activePoint?: GridSelectionPointLike<TRowKey> | null
}): ResolveSelectionUpdateResult<TRowKey> {
  const { context } = input
  const clampedAreas = input.areas
    .map(area => clampSelectionArea(area, context))
    .filter((area): area is SelectionArea => Boolean(area))

  const resolvedActivePoint =
    input.activePoint === undefined
      ? undefined
      : input.activePoint
        ? clampGridSelectionPoint(input.activePoint, context)
        : null

  if (!clampedAreas.length) {
    return resolveSelectionUpdate<TRowKey>({
      ranges: [],
      activeRangeIndex: -1,
      context,
      selectedPoint: resolvedActivePoint ?? null,
      anchorPoint: resolvedActivePoint ?? null,
      dragAnchorPoint: resolvedActivePoint ?? null,
    })
  }

  const ranges = clampedAreas.map(area => createRangeFromArea(area, context))
  let activeIndex = ranges.length ? clampIndex(input.state?.activeRangeIndex ?? 0, 0, ranges.length - 1) : -1

  if (resolvedActivePoint && ranges.length) {
    const containingIndex = ranges.findIndex(range =>
      areaContainsPoint(range, resolvedActivePoint.rowIndex, resolvedActivePoint.colIndex),
    )
    if (containingIndex !== -1) {
      activeIndex = containingIndex
    }
  }

  const selectedPointParam = resolvedActivePoint === undefined ? undefined : resolvedActivePoint
  const anchorPointParam = resolvedActivePoint === undefined ? undefined : resolvedActivePoint

  return resolveSelectionUpdate<TRowKey>({
    ranges,
    activeRangeIndex: activeIndex,
    context,
    selectedPoint: selectedPointParam,
    anchorPoint: anchorPointParam,
  })
}

/**
 * Toggles a single cell inside the current multi-range selection, expanding or removing a 1x1 range.
 */
export function toggleCellSelection<TRowKey>(input: {
  state: HeadlessSelectionState<TRowKey>
  point: GridSelectionPointLike<TRowKey>
  context: GridSelectionContext<TRowKey>
}): ResolveSelectionUpdateResult<TRowKey> {
  const normalizedPoint = clampGridSelectionPoint(input.point, input.context)
  const cellArea: SelectionArea = {
    startRow: normalizedPoint.rowIndex,
    endRow: normalizedPoint.rowIndex,
    startCol: normalizedPoint.colIndex,
    endCol: normalizedPoint.colIndex,
  }

  const isSelected = isCellSelected(
    input.state.areas,
    normalizedPoint.rowIndex,
    normalizedPoint.colIndex,
  )

  const nextAreas = isSelected
    ? removeRange(input.state.areas, cellArea)
    : addRange(input.state.areas, cellArea)

  if (!nextAreas.length) {
    return selectSingleCell<TRowKey>({
      point: normalizedPoint,
      context: input.context,
    })
  }

  return applySelectionAreas<TRowKey>({
    areas: nextAreas,
    context: input.context,
    state: input.state,
    activePoint: normalizedPoint,
  })
}

export function clearSelection<TRowKey>(input: { context: GridSelectionContext<TRowKey> }): ResolveSelectionUpdateResult<TRowKey> {
  return resolveSelectionUpdate<TRowKey>({
    ranges: [],
    activeRangeIndex: -1,
    context: input.context,
    selectedPoint: null,
    anchorPoint: null,
    dragAnchorPoint: null,
  })
}
