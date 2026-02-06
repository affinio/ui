import type {
  Anchor,
  GridSelectionContext,
  GridSelectionRange,
  Range,
  SelectionArea,
} from "./types"
import { clampScalar } from "./utils"

const ROW_BUCKET_SIZE = 32

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
  if (!ranges.length) {
    return []
  }
  const normalized = ranges.map(normalizeSelectionArea)
  const mergedAreas: Array<SelectionArea | null> = []
  const rowBuckets = new Map<number, Set<number>>()

  for (const range of normalized) {
    let merged = range
    let changed = true

    while (changed) {
      changed = false
      const candidates = collectCandidateIndexes(merged, rowBuckets)
      for (const index of candidates) {
        const current = mergedAreas[index]
        if (!current) {
          continue
        }
        if (!areasOverlap(current, merged)) {
          continue
        }
        merged = mergePair(current, merged)
        mergedAreas[index] = null
        removeAreaFromBuckets(current, index, rowBuckets)
        changed = true
      }
    }

    const mergedIndex = mergedAreas.length
    mergedAreas.push(merged)
    addAreaToBuckets(merged, mergedIndex, rowBuckets)
  }

  return mergedAreas.filter((area): area is SelectionArea => area !== null)
}

function subtractAreaNormalized(base: SelectionArea, normalizedRemoval: SelectionArea): SelectionArea[] {
  if (!areasOverlap(base, normalizedRemoval)) {
    return [base]
  }

  const overlapStartRow = Math.max(base.startRow, normalizedRemoval.startRow)
  const overlapEndRow = Math.min(base.endRow, normalizedRemoval.endRow)
  const overlapStartCol = Math.max(base.startCol, normalizedRemoval.startCol)
  const overlapEndCol = Math.min(base.endCol, normalizedRemoval.endCol)

  const pieces: SelectionArea[] = []

  if (base.startRow <= overlapStartRow - 1) {
    pieces.push({
      startRow: base.startRow,
      endRow: overlapStartRow - 1,
      startCol: base.startCol,
      endCol: base.endCol,
    })
  }

  if (overlapEndRow + 1 <= base.endRow) {
    pieces.push({
      startRow: overlapEndRow + 1,
      endRow: base.endRow,
      startCol: base.startCol,
      endCol: base.endCol,
    })
  }

  const middleRowStart = Math.max(base.startRow, overlapStartRow)
  const middleRowEnd = Math.min(base.endRow, overlapEndRow)

  if (middleRowStart <= middleRowEnd) {
    if (base.startCol <= overlapStartCol - 1) {
      pieces.push({
        startRow: middleRowStart,
        endRow: middleRowEnd,
        startCol: base.startCol,
        endCol: overlapStartCol - 1,
      })
    }

    if (overlapEndCol + 1 <= base.endCol) {
      pieces.push({
        startRow: middleRowStart,
        endRow: middleRowEnd,
        startCol: overlapEndCol + 1,
        endCol: base.endCol,
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
    const pieces = subtractAreaNormalized(normalizeSelectionArea(range), normalizedTarget)
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

function areaRowBucketRange(area: SelectionArea): { start: number; end: number } {
  return {
    start: Math.floor(area.startRow / ROW_BUCKET_SIZE),
    end: Math.floor(area.endRow / ROW_BUCKET_SIZE),
  }
}

function addAreaToBuckets(area: SelectionArea, index: number, buckets: Map<number, Set<number>>): void {
  const { start, end } = areaRowBucketRange(area)
  for (let bucket = start; bucket <= end; bucket += 1) {
    const entries = buckets.get(bucket) ?? new Set<number>()
    entries.add(index)
    buckets.set(bucket, entries)
  }
}

function removeAreaFromBuckets(area: SelectionArea, index: number, buckets: Map<number, Set<number>>): void {
  const { start, end } = areaRowBucketRange(area)
  for (let bucket = start; bucket <= end; bucket += 1) {
    const entries = buckets.get(bucket)
    if (!entries) {
      continue
    }
    entries.delete(index)
    if (!entries.size) {
      buckets.delete(bucket)
    }
  }
}

function collectCandidateIndexes(area: SelectionArea, buckets: Map<number, Set<number>>): number[] {
  const { start, end } = areaRowBucketRange(area)
  const indexes = new Set<number>()
  for (let bucket = start; bucket <= end; bucket += 1) {
    const entries = buckets.get(bucket)
    if (!entries) {
      continue
    }
    entries.forEach((index) => indexes.add(index))
  }
  return Array.from(indexes)
}
