import { describe, expect, it } from "vitest"
import {
  computeOverscan,
  splitLeadTrail,
  createVerticalOverscanController,
  createHorizontalOverscanController,
} from ".."

describe("overscan statics", () => {
  it("eases overscan between min and max", () => {
    const low = computeOverscan(0, 2, 10)
    const mid = computeOverscan(0.5, 2, 10)
    const high = computeOverscan(1, 2, 10)

    expect(low).toBeCloseTo(2)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeCloseTo(10)
  })

  it("splits lead and trail according to direction", () => {
    const neutral = splitLeadTrail(10, 0)
    const forward = splitLeadTrail(10, 1)
    const backward = splitLeadTrail(10, -1)

    expect(neutral.lead).toBeCloseTo(neutral.trail)
    expect(forward.lead).toBeLessThan(forward.trail)
    expect(backward.lead).toBeGreaterThan(backward.trail)
  })
})

describe("dynamic overscan controllers", () => {
  it("resets vertical overscan when virtualization is disabled", () => {
    const controller = createVerticalOverscanController({ minOverscan: 2 })

    const disabled = controller.update({
      timestamp: 0,
      delta: 0,
      viewportSize: 100,
      itemSize: 10,
      virtualizationEnabled: false,
    })

    expect(disabled.overscan).toBe(0)

    const enabled = controller.update({
      timestamp: 16,
      delta: 120,
      viewportSize: 100,
      itemSize: 10,
      virtualizationEnabled: true,
    })

    expect(enabled.overscan).toBeGreaterThanOrEqual(2)
  })

  it("caps horizontal overscan to total items and handles disabled virtualization", () => {
    const controller = createHorizontalOverscanController({ minOverscan: 3 })

    const disabled = controller.update({
      timestamp: 0,
      delta: 0,
      viewportSize: 80,
      itemSize: 10,
      totalItems: 40,
      virtualizationEnabled: false,
    })
    expect(disabled.overscan).toBe(40)

    const enabled = controller.update({
      timestamp: 16,
      delta: 160,
      viewportSize: 80,
      itemSize: 10,
      totalItems: 5,
      virtualizationEnabled: true,
    })

    expect(enabled.overscan).toBeLessThanOrEqual(5)
    expect(enabled.overscan).toBeGreaterThanOrEqual(3)
  })
})
