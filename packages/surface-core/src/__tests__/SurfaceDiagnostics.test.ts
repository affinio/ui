import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SurfaceDiagnostics } from "../core/SurfaceDiagnostics"
import type { PositionOptions, Rect } from "../types"

describe("SurfaceDiagnostics", () => {
  const rect: Rect = { x: 10, y: 20, width: 40, height: 50 }
  let logs: Array<{ message: string; details?: Record<string, unknown> }>

  beforeEach(() => {
    logs = []
    SurfaceDiagnostics.configure((message, details) => {
      logs.push({ message, details })
    })
  })

  afterEach(() => {
    SurfaceDiagnostics.configure()
  })

  it("reports missing rectangles", () => {
    const result = SurfaceDiagnostics.validateRect(null, "anchor")
    expect(result).toBe(false)
    expect(logs[0]?.message).toContain("anchor rect is missing")
  })

  it("reports invalid numeric inputs in options", () => {
    const options: PositionOptions = { viewportWidth: -1, gutter: Number.NaN }
    const result = SurfaceDiagnostics.validatePositionOptions(options)
    expect(result).toBe(false)
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const viewportWarning = logs.find((entry) => entry.message.includes("viewportWidth"))
    expect(viewportWarning).toBeDefined()
  })

  it("warns about zero-sized surfaces when validating args", () => {
    const zeroSurface: Rect = { x: 0, y: 0, width: 0, height: 10 }
    SurfaceDiagnostics.validatePositionArgs(rect, zeroSurface)
    const zeroMsg = logs.find((entry) => entry.message.includes("zero width/height"))
    expect(zeroMsg).toBeDefined()
  })
})
