import { clamp } from "../utils/clamp"

function normalizeNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

export interface VerticalScrollLimitInput {
  estimatedItemSize: number
  totalCount: number
  viewportSize: number
  overscanTrailing: number
  visibleCount: number
  nativeScrollLimit?: number | null
  trailingPadding?: number
  edgePadding?: number
}

export function computeVerticalScrollLimit(input: VerticalScrollLimitInput): number {
  const itemSize = Math.max(0, normalizeNumber(input.estimatedItemSize, 0))
  const count = Math.max(0, Math.floor(normalizeNumber(input.totalCount, 0)))
  const viewport = Math.max(0, normalizeNumber(input.viewportSize, 0))
  const overscanTrailing = Math.max(0, Math.floor(normalizeNumber(input.overscanTrailing, 0)))
  const visibleCount = Math.max(1, Math.floor(normalizeNumber(input.visibleCount, 1)))
  const trailingPadding = Math.max(0, normalizeNumber(input.trailingPadding ?? 0, 0))
  const edgePadding = Math.max(0, normalizeNumber(input.edgePadding ?? 0, 0))
  const baseMax = Math.max(0, count * itemSize - viewport)
  const overscanPx = overscanTrailing * itemSize
  const trailingGap = Math.max(0, viewport - visibleCount * itemSize)
  const extendedMax = Math.max(baseMax, baseMax + overscanPx + trailingGap + trailingPadding + edgePadding)
  const nativeLimit = Math.max(0, normalizeNumber(input.nativeScrollLimit ?? 0, 0))
  if (!Number.isFinite(nativeLimit) || nativeLimit <= 0) {
    return extendedMax
  }
  return Math.max(baseMax, Math.min(extendedMax, nativeLimit))
}

export interface HorizontalScrollLimitInput {
  totalScrollableWidth: number
  viewportWidth: number
  pinnedLeftWidth: number
  pinnedRightWidth: number
  bufferPx: number
  trailingGap?: number
  nativeScrollLimit?: number | null
  tolerancePx?: number
}

export function computeHorizontalScrollLimit(input: HorizontalScrollLimitInput): number {
  const totalWidth = Math.max(0, normalizeNumber(input.totalScrollableWidth, 0))
  const viewportWidth = Math.max(0, normalizeNumber(input.viewportWidth, 0))
  const pinnedLeft = Math.max(0, normalizeNumber(input.pinnedLeftWidth, 0))
  const pinnedRight = Math.max(0, normalizeNumber(input.pinnedRightWidth, 0))
  const bufferPx = Math.max(0, normalizeNumber(input.bufferPx, 0))
  const trailingGap = Math.max(0, normalizeNumber(input.trailingGap ?? 0, 0))
  const tolerance = Math.max(0, normalizeNumber(input.tolerancePx ?? 0, 0))
  const effectiveViewport = Math.max(0, viewportWidth - pinnedLeft - pinnedRight)
  const baseMax = Math.max(0, totalWidth - effectiveViewport)
  const extendedMax = Math.max(0, baseMax + bufferPx + trailingGap + 1)
  const virtualizationLimit = Math.max(baseMax, extendedMax)
  const nativeLimit = input.nativeScrollLimit
  if (nativeLimit == null || !Number.isFinite(nativeLimit) || nativeLimit <= 0) {
    return virtualizationLimit
  }
  if (Math.abs(nativeLimit - virtualizationLimit) > tolerance) {
    return nativeLimit
  }
  return Math.max(nativeLimit, virtualizationLimit)
}

export interface ClampScrollInput {
  offset: number
  limit: number
}

export function clampScrollOffset({ offset, limit }: ClampScrollInput): number {
  if (!Number.isFinite(offset)) {
    return 0
  }
  if (!Number.isFinite(limit) || limit <= 0) {
    return clamp(offset, 0, 0)
  }
  return clamp(offset, 0, limit)
}
