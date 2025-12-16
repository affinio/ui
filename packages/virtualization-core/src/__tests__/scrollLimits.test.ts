import { describe, expect, it } from "vitest"
import {
  clampScrollOffset,
  computeHorizontalScrollLimit,
  computeVerticalScrollLimit,
} from ".."

describe("vertical scroll limit", () => {
  it("extends base limit with overscan and padding", () => {
    const limit = computeVerticalScrollLimit({
      estimatedItemSize: 20,
      totalCount: 100,
      viewportSize: 200,
      overscanTrailing: 4,
      visibleCount: 8,
      trailingPadding: 60,
      edgePadding: 20,
    })

    const base = Math.max(0, 100 * 20 - 200)
    expect(limit).toBeGreaterThan(base)
  })

  it("never shrinks below the base max even with native caps", () => {
    const limit = computeVerticalScrollLimit({
      estimatedItemSize: 15,
      totalCount: 50,
      viewportSize: 150,
      overscanTrailing: 2,
      visibleCount: 10,
      nativeScrollLimit: 100,
    })

    const base = Math.max(0, 50 * 15 - 150)
    expect(limit).toBe(base)
  })
})

describe("horizontal scroll limit", () => {
  it("subtracts pinned widths from the viewport and applies buffers", () => {
    const limit = computeHorizontalScrollLimit({
      totalScrollableWidth: 2000,
      viewportWidth: 500,
      pinnedLeftWidth: 100,
      pinnedRightWidth: 50,
      bufferPx: 40,
      trailingGap: 20,
    })

    const effectiveViewport = 500 - 100 - 50
    const base = 2000 - effectiveViewport
    expect(limit).toBeGreaterThan(base)
  })

  it("uses native limit when provided and different enough", () => {
    const limit = computeHorizontalScrollLimit({
      totalScrollableWidth: 1000,
      viewportWidth: 400,
      pinnedLeftWidth: 0,
      pinnedRightWidth: 0,
      bufferPx: 0,
      trailingGap: 0,
      nativeScrollLimit: 120,
      tolerancePx: 10,
    })

    expect(limit).toBe(120)
  })
})

describe("clampScrollOffset", () => {
  it("clamps NaN and out-of-range offsets", () => {
    expect(clampScrollOffset({ offset: Number.NaN, limit: 100 })).toBe(0)
    expect(clampScrollOffset({ offset: 150, limit: 100 })).toBe(100)
    expect(clampScrollOffset({ offset: -20, limit: 100 })).toBe(0)
  })
})
