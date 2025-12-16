import type {
  GridSelectionContext,
  GridSelectionPoint,
  GridSelectionPointLike,
  GridSelectionRange,
  GridSelectionRangeInput,
  SelectionArea,
} from "./types"
import { clampIndex } from "./utils"

export function clampGridSelectionPoint<TRowKey = unknown>(
  point: GridSelectionPointLike<TRowKey>,
  context: GridSelectionContext<TRowKey>,
): GridSelectionPoint<TRowKey> {
  const rowCount = Math.max(0, context.grid.rowCount)
  const colCount = Math.max(0, context.grid.colCount)
  const maxRow = Math.max(rowCount - 1, 0)
  const maxCol = Math.max(colCount - 1, 0)

  const rowIndex = rowCount > 0 ? clampIndex(point.rowIndex, 0, maxRow) : 0
  const colIndex = colCount > 0 ? clampIndex(point.colIndex, 0, maxCol) : 0
  const resolveRowId = context.getRowIdByIndex
  const rowId =
    point.rowId != null
      ? point.rowId
      : resolveRowId
        ? resolveRowId(rowIndex) ?? null
        : null

  return {
    rowIndex,
    colIndex,
    rowId,
  }
}

export function createGridSelectionRange<TRowKey = unknown>(
  anchor: GridSelectionPointLike<TRowKey>,
  focus: GridSelectionPointLike<TRowKey>,
  context: GridSelectionContext<TRowKey>,
): GridSelectionRange<TRowKey> {
  const clampedAnchor = clampGridSelectionPoint(anchor, context)
  const clampedFocus = clampGridSelectionPoint(focus, context)

  const startRow = Math.min(clampedAnchor.rowIndex, clampedFocus.rowIndex)
  const endRow = Math.max(clampedAnchor.rowIndex, clampedFocus.rowIndex)
  const startCol = Math.min(clampedAnchor.colIndex, clampedFocus.colIndex)
  const endCol = Math.max(clampedAnchor.colIndex, clampedFocus.colIndex)

  const resolveRowId = context.getRowIdByIndex

  const startRowIdCandidate = clampedAnchor.rowIndex === startRow ? clampedAnchor.rowId : null
  const startRowIdFallback = clampedFocus.rowIndex === startRow ? clampedFocus.rowId : null
  const endRowIdCandidate = clampedFocus.rowIndex === endRow ? clampedFocus.rowId : null
  const endRowIdFallback = clampedAnchor.rowIndex === endRow ? clampedAnchor.rowId : null

  const startRowId =
    startRowIdCandidate ??
    startRowIdFallback ??
    (resolveRowId ? resolveRowId(startRow) ?? null : null)

  const endRowId =
    endRowIdCandidate ??
    endRowIdFallback ??
    (resolveRowId ? resolveRowId(endRow) ?? null : null)

  return {
    anchor: clampedAnchor,
    focus: clampedFocus,
    startRow,
    endRow,
    startCol,
    endCol,
    startRowId: startRowId ?? null,
    endRowId: endRowId ?? null,
  }
}

export function normalizeGridSelectionRange<TRowKey = unknown>(
  range: GridSelectionRange<TRowKey>,
  context: GridSelectionContext<TRowKey>,
): GridSelectionRange<TRowKey> | null {
  if (context.grid.rowCount <= 0 || context.grid.colCount <= 0) {
    return null
  }
  return createGridSelectionRange(range.anchor, range.focus, context)
}

export function createGridSelectionRangeFromInput<TRowKey = unknown>(
  input: GridSelectionRangeInput<TRowKey>,
  context: GridSelectionContext<TRowKey>,
): GridSelectionRange<TRowKey> {
  const anchor = input.anchor ?? {
    rowIndex: Math.min(input.startRow, input.endRow),
    colIndex: Math.min(input.startCol, input.endCol),
  }
  const focus = input.focus ?? {
    rowIndex: Math.max(input.startRow, input.endRow),
    colIndex: Math.max(input.startCol, input.endCol),
  }

  return createGridSelectionRange(anchor, focus, context)
}
