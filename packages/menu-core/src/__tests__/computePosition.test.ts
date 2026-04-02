import { describe, expect, it } from "vitest"
import { computePosition } from "@affino/surface-core"
import type { Rect } from "../types"

describe("computePosition", () => {
  const anchor: Rect = { x: 100, y: 100, width: 40, height: 24 }
  const panel: Rect = { x: 0, y: 0, width: 80, height: 60 }

  it("places the panel on the requested side", () => {
    const result = computePosition(anchor, panel, { placement: "right", gutter: 0 })

    expect(result.left).toBe(140)
    expect(result.top).toBe(100)
    expect(result.placement).toBe("right")
    expect(result.align).toBe("start")
  })

  it("falls back to the opposite side when overflowing", () => {
    const nearEdge: Rect = { x: 360, y: 100, width: 40, height: 24 }
    const result = computePosition(nearEdge, panel, {
      placement: "auto",
      viewportWidth: 400,
      viewportHeight: 400,
      gutter: 0,
    })

    expect(result.placement).toBe("left")
    expect(result.left).toBeLessThan(nearEdge.x)
  })

  it("aligns the panel relative to the anchor", () => {
    const result = computePosition(anchor, panel, { placement: "bottom", align: "center", gutter: 0 })

    expect(result.top).toBe(124)
    expect(result.left).toBeCloseTo(80)
    expect(result.align).toBe("center")
  })

  it("pins oversized panels to viewport padding instead of letting them escape upward", () => {
    const smallViewportAnchor: Rect = { x: 40, y: 260, width: 44, height: 28 }
    const tallPanel: Rect = { x: 0, y: 0, width: 180, height: 520 }

    const result = computePosition(smallViewportAnchor, tallPanel, {
      placement: "top",
      viewportWidth: 320,
      viewportHeight: 480,
      viewportPadding: 8,
      gutter: 6,
    })

    expect(result.top).toBe(8)
  })
})
