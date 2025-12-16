import type {
  Anchor,
  GridSelectionContext,
  GridSelectionRange,
  Range,
  SelectionArea,
} from "./types"
import { clampScalar } from "./utils"

export function normalizeSelectionArea(area: SelectionArea): SelectionArea {
  const startRow = Math.min(area.startRow, area.endRow)
  const endRow = Math.max(area.startRow, area.endRow)
  const startCol = Math.min(area.startCol, area.endCol)
  const endCol = Math.max(area.startCol, area.endCol)

  return {
    startRow,
    endRow,
    startCol,
    endCol,
  }
}

export function clampSelectionArea<TRowKey = unknown>(
  area: SelectionArea,
  context: GridSelectionContext<TRowKey>,
): SelectionArea | null {
  const normalized = normalizeSelectionArea(area)
  const rowCount = Math.max(0, context.grid.rowCount)
  const colCount = Math.max(0, context.grid.colCount)
  if (rowCount === 0 || colCount === 0) {
    return null
  }

  const maxRow = Math.max(rowCount - 1, 0)
  const maxCol = Math.max(colCount - 1, 0)

  const startRow = clampScalar(normalized.startRow, 0, maxRow)
  const endRow = clampScalar(normalized.endRow, 0, maxRow)
  const startCol = clampScalar(normalized.startCol, 0, maxCol)
  const endCol = clampScalar(normalized.endCol, 0, maxCol)

  if (startRow > endRow || startCol > endCol) {
    return null
  }

  return {
    startRow,
    endRow,
    startCol,
    endCol,
  }
}

export function resolveSelectionBounds<TRowKey = unknown>(
  range: GridSelectionRange<TRowKey> | null,
  context: GridSelectionContext<TRowKey>,
  fallbackToAll = false,
): SelectionArea | null {
  if (range) {
    return clampSelectionArea(range, context)
  }

  if (!fallbackToAll) {
    return null
  }

  const fullArea: SelectionArea = {
    startRow: 0,
    endRow: context.grid.rowCount - 1,
    startCol: 0,
    endCol: context.grid.colCount - 1,
  }

  return clampSelectionArea(fullArea, context)
}

function areasOverlap(a: SelectionArea, b: SelectionArea): boolean {
  return (
    a.startRow <= b.endRow &&
    a.endRow >= b.startRow &&
    a.startCol <= b.endCol &&
    a.endCol >= b.startCol
  )
}

function mergePair(a: SelectionArea, b: SelectionArea): SelectionArea {
  return {
    startRow: Math.min(a.startRow, b.startRow),
    endRow: Math.max(a.endRow, b.endRow),
    startCol: Math.min(a.startCol, b.startCol),
    endCol: Math.max(a.endCol, b.endCol),
  }
}

export function mergeRanges(ranges: readonly SelectionArea[]): SelectionArea[] {
  const normalized = ranges.map(normalizeSelectionArea)
  const result: SelectionArea[] = []

  for (const range of normalized) {
    let merged = range
    let keepMerging = true

    while (keepMerging) {
      keepMerging = false
      for (let index = 0; index < result.length; index += 1) {
        const current = result[index]
        if (!current) {
          continue
        }
        if (areasOverlap(current, merged)) {
          merged = mergePair(current, merged)
          result.splice(index, 1)
          keepMerging = true
          break
        }
      }
    }

    result.push(merged)
  }

  return result
}

function subtractArea(base: SelectionArea, removal: SelectionArea): SelectionArea[] {
  const normalizedBase = normalizeSelectionArea(base)
  const normalizedRemoval = normalizeSelectionArea(removal)

  if (!areasOverlap(normalizedBase, normalizedRemoval)) {
    return [normalizedBase]
  }

  const overlapStartRow = Math.max(normalizedBase.startRow, normalizedRemoval.startRow)
  const overlapEndRow = Math.min(normalizedBase.endRow, normalizedRemoval.endRow)
  const overlapStartCol = Math.max(normalizedBase.startCol, normalizedRemoval.startCol)
  const overlapEndCol = Math.min(normalizedBase.endCol, normalizedRemoval.endCol)

  const pieces: SelectionArea[] = []

  if (normalizedBase.startRow <= overlapStartRow - 1) {
    pieces.push({
      startRow: normalizedBase.startRow,
      endRow: overlapStartRow - 1,
      startCol: normalizedBase.startCol,
      endCol: normalizedBase.endCol,
    })
  }

  if (overlapEndRow + 1 <= normalizedBase.endRow) {
    pieces.push({
      startRow: overlapEndRow + 1,
      endRow: normalizedBase.endRow,
      startCol: normalizedBase.startCol,
      endCol: normalizedBase.endCol,
    })
  }

  const middleRowStart = Math.max(normalizedBase.startRow, overlapStartRow)
  const middleRowEnd = Math.min(normalizedBase.endRow, overlapEndRow)

  if (middleRowStart <= middleRowEnd) {
    if (normalizedBase.startCol <= overlapStartCol - 1) {
      pieces.push({
        startRow: middleRowStart,
        endRow: middleRowEnd,
        startCol: normalizedBase.startCol,
        endCol: overlapStartCol - 1,
      })
    }

    if (overlapEndCol + 1 <= normalizedBase.endCol) {
      pieces.push({
        startRow: middleRowStart,
        endRow: middleRowEnd,
        startCol: overlapEndCol + 1,
        endCol: normalizedBase.endCol,
      })
    }
  }

  return pieces
}

export function addRange(ranges: readonly SelectionArea[], next: SelectionArea): SelectionArea[] {
  return mergeRanges([...ranges, next])
}

export function removeRange(ranges: readonly SelectionArea[], target: SelectionArea): SelectionArea[] {
  const normalizedTarget = normalizeSelectionArea(target)
  const result: SelectionArea[] = []

  for (const range of ranges) {
    const pieces = subtractArea(range, normalizedTarget)
    for (const piece of pieces) {
      result.push(piece)
    }
  }

  return mergeRanges(result)
}

export function isCellSelected(ranges: readonly SelectionArea[], rowIndex: number, colIndex: number): boolean {
  for (const range of ranges) {
    if (
      rowIndex >= range.startRow &&
      rowIndex <= range.endRow &&
      colIndex >= range.startCol &&
      colIndex <= range.endCol
    ) {
      return true
    }
  }
  return false
}

export function rangesFromSelection(ranges: readonly Range[]): SelectionArea[] {
  return ranges.map(range => normalizeSelectionArea(range))
}

export function selectionFromAreas(
  areas: readonly SelectionArea[],
  createAnchor: (rowIndex: number, colIndex: number) => Anchor,
): Range[] {
  return areas.map(area => {
    const normalized = normalizeSelectionArea(area)
    return {
      anchor: createAnchor(normalized.startRow, normalized.startCol),
      focus: createAnchor(normalized.endRow, normalized.endCol),
      ...normalized,
    }
  })
}

export function areaContainsCell(area: SelectionArea, rowIndex: number, colIndex: number): boolean {
  const normalized = normalizeSelectionArea(area)
  return (
    rowIndex >= normalized.startRow &&
    rowIndex <= normalized.endRow &&
    colIndex >= normalized.startCol &&
    colIndex <= normalized.endCol
  )
}
