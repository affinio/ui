import { describe, expect, it } from "vitest"
import {
  createAxisVirtualizer,
  type AxisVirtualizerContext,
  type AxisVirtualizerStrategy,
} from ".."

type Meta = { scrollDirection?: number }
type Payload = { window: [number, number] }

const strategy: AxisVirtualizerStrategy<Meta, Payload> = {
  computeVisibleCount(context) {
    const itemSize = Math.max(1, context.estimatedItemSize)
    const raw = Math.floor(context.viewportSize / itemSize)
    return Math.max(1, Math.min(context.totalCount, raw))
  },
  clampScroll(value, context) {
    if (!Number.isFinite(value)) return 0
    const totalPx = context.totalCount * Math.max(1, context.estimatedItemSize)
    const limit = Math.max(0, totalPx - context.viewportSize)
    if (limit <= 0) return 0
    return Math.min(Math.max(0, value), limit)
  },
  computeRange(offset, context, target) {
    const itemSize = Math.max(1, context.estimatedItemSize)
    const firstIndex = Math.floor(offset / itemSize)
    const start = firstIndex - context.overscanLeading
    target.start = start
    target.end = start + context.poolSize
    target.payload = { window: [target.start, target.end] }
    return target
  },
  getOffsetForIndex(index, context) {
    if (context.totalCount <= 0) return 0
    const bounded = Math.max(0, Math.min(index, context.totalCount - 1))
    return bounded * Math.max(1, context.estimatedItemSize)
  },
}

function createContext(partial: Partial<AxisVirtualizerContext<Meta>> = {}): AxisVirtualizerContext<Meta> {
  return {
    axis: "vertical",
    viewportSize: 120,
    scrollOffset: 0,
    virtualizationEnabled: true,
    estimatedItemSize: 20,
    totalCount: 50,
    overscan: 6,
    meta: {},
    ...partial,
  }
}

describe("axis virtualizer", () => {
  it("returns full range when virtualization disabled", () => {
    const virtualizer = createAxisVirtualizer("vertical", strategy, { window: [0, 0] })
    const context = createContext({ virtualizationEnabled: false, totalCount: 4, viewportSize: 200 })
    const state = virtualizer.update(context)

    expect(state.startIndex).toBe(0)
    expect(state.endIndex).toBe(4)
    expect(state.visibleCount).toBe(4)
    expect(state.poolSize).toBe(4)
    expect(state.overscanLeading).toBe(0)
    expect(state.overscanTrailing).toBe(0)
    expect(virtualizer.isIndexVisible(3)).toBe(true)
  })

  it("applies overscan buckets based on scroll direction", () => {
    const virtualizer = createAxisVirtualizer("vertical", strategy, { window: [0, 0] })
    const context = createContext({
      scrollOffset: 60,
      meta: { scrollDirection: 1 },
    })

    const state = virtualizer.update(context)

    expect(state.visibleCount).toBeGreaterThan(0)
    expect(state.poolSize).toBe(state.endIndex - state.startIndex)
    expect(state.startIndex).toBeGreaterThanOrEqual(0)
    expect(state.endIndex).toBeLessThanOrEqual(context.totalCount)
    expect(state.overscanTrailing).toBeGreaterThanOrEqual(state.overscanLeading)
  })

  it("clamps offsets when asked for distant positions", () => {
    const virtualizer = createAxisVirtualizer("vertical", strategy, { window: [0, 0] })
    const context = createContext({ scrollOffset: 10_000 })
    const state = virtualizer.update(context)

    expect(state.endIndex).toBe(context.totalCount)
    expect(state.startIndex).toBeGreaterThanOrEqual(0)

    const internalContext = {
      axis: "vertical" as const,
      viewportSize: context.viewportSize,
      scrollOffset: state.offset,
      virtualizationEnabled: context.virtualizationEnabled,
      estimatedItemSize: context.estimatedItemSize,
      totalCount: context.totalCount,
      overscan: context.overscan,
      meta: context.meta,
      visibleCount: state.visibleCount,
      poolSize: state.poolSize,
      overscanLeading: state.overscanLeading,
      overscanTrailing: state.overscanTrailing,
    }

    expect(virtualizer.getOffsetForIndex(10, internalContext)).toBe(10 * context.estimatedItemSize)
  })
})
