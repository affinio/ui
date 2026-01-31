import { clampIndex, clampScalar } from "./utils"
export interface LinearRange {
  start: number
  end: number
}

export interface LinearSelectionState {
  readonly ranges: readonly LinearRange[]
  readonly activeRangeIndex: number
  readonly anchor: number | null
  readonly focus: number | null
}

export interface ResolveLinearSelectionInput {
  readonly ranges: readonly LinearRange[]
  readonly activeRangeIndex: number
  readonly anchor?: number | null
  readonly focus?: number | null
}

export type ResolveLinearSelectionResult = LinearSelectionState

export function normalizeLinearRange(range: LinearRange): LinearRange {
  const start = sanitizeIndex(range.start)
  const end = sanitizeIndex(range.end)
  if (start <= end) {
    return { start, end }
  }
  return { start: end, end: start }
}

export function mergeLinearRanges(ranges: readonly LinearRange[]): LinearRange[] {
  if (!ranges.length) {
    return []
  }
  const normalized = ranges.map(normalizeLinearRange).sort((a, b) => a.start - b.start)
  const merged: LinearRange[] = []
  for (const range of normalized) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push({ ...range })
      continue
    }
    if (range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function addLinearRange(ranges: readonly LinearRange[], next: LinearRange): LinearRange[] {
  return mergeLinearRanges([...ranges, normalizeLinearRange(next)])
}

export function removeLinearRange(ranges: readonly LinearRange[], target: LinearRange): LinearRange[] {
  const normalizedTarget = normalizeLinearRange(target)
  const result: LinearRange[] = []
  for (const range of mergeLinearRanges(ranges)) {
    const pieces = subtractLinearRange(range, normalizedTarget)
    for (const piece of pieces) {
      result.push(piece)
    }
  }
  return mergeLinearRanges(result)
}

export function toggleLinearRange(ranges: readonly LinearRange[], target: LinearRange): LinearRange[] {
  const normalizedTarget = normalizeLinearRange(target)
  const merged = mergeLinearRanges(ranges)
  const fullyCovered = merged.some(range => range.start <= normalizedTarget.start && range.end >= normalizedTarget.end)
  if (fullyCovered) {
    return removeLinearRange(merged, normalizedTarget)
  }
  return addLinearRange(merged, normalizedTarget)
}

export function resolveLinearSelectionUpdate(input: ResolveLinearSelectionInput): ResolveLinearSelectionResult {
  const normalizedRanges = mergeLinearRanges(input.ranges)
  if (!normalizedRanges.length) {
    return emptyLinearSelectionState()
  }
  if (input.activeRangeIndex < 0 || input.activeRangeIndex >= normalizedRanges.length) {
    throw new Error(
      `Linear selection invariant violated: activeRangeIndex ${input.activeRangeIndex} is invalid for ${normalizedRanges.length} range(s)`,
    )
  }
  const activeRangeIndex = clampIndex(input.activeRangeIndex, 0, normalizedRanges.length - 1)
  const activeRange = normalizedRanges[activeRangeIndex]!

  const anchor = resolvePoint(input.anchor, activeRange.start, activeRange)
  const focus = resolvePoint(input.focus, activeRange.end, activeRange)

  return {
    ranges: normalizedRanges,
    activeRangeIndex,
    anchor,
    focus,
  }
}

export function emptyLinearSelectionState(): LinearSelectionState {
  return {
    ranges: [],
    activeRangeIndex: -1,
    anchor: null,
    focus: null,
  }
}

function sanitizeIndex(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.trunc(value)
}

function subtractLinearRange(base: LinearRange, removal: LinearRange): LinearRange[] {
  if (!rangesOverlap(base, removal)) {
    return [{ ...base }]
  }
  const pieces: LinearRange[] = []
  if (removal.start > base.start) {
    pieces.push({ start: base.start, end: Math.min(removal.start - 1, base.end) })
  }
  if (removal.end < base.end) {
    pieces.push({ start: Math.max(removal.end + 1, base.start), end: base.end })
  }
  return pieces.filter(piece => piece.start <= piece.end)
}

function resolvePoint(value: number | null | undefined, fallback: number, bounds: LinearRange): number | null {
  if (value === undefined) {
    return fallback
  }
  if (value === null) {
    return null
  }
  return Math.trunc(clampScalar(value, bounds.start, bounds.end))
}

function rangesOverlap(a: LinearRange, b: LinearRange): boolean {
  const normalizedA = normalizeLinearRange(a)
  const normalizedB = normalizeLinearRange(b)
  return normalizedA.start <= normalizedB.end && normalizedA.end >= normalizedB.start
}
