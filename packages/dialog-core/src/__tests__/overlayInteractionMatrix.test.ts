import { describe, expect, it } from "vitest"
import { createOverlayInteractionMatrix } from "../overlay/interactionMatrix.js"
import { OverlayInteractionTelemetryEvent } from "../types.js"

const customRule = {
  source: "sheet" as const,
  target: "dialog" as const,
  allowStack: true,
  closeStrategy: "single" as const,
}

describe("OverlayInteractionMatrix", () => {
  it("applies override rules deterministically", () => {
    const matrix = createOverlayInteractionMatrix({
      rules: [customRule],
    })

    const rules = matrix.getRules()
    const sheetRule = rules.find((rule) => rule.source === "sheet" && rule.target === "dialog")

    expect(sheetRule).toBeDefined()
    expect(sheetRule?.allowStack).toBe(true)
    expect(sheetRule?.closeStrategy).toBe("single")

    expect(matrix.canStack("sheet", "dialog")).toBe(true)
    expect(matrix.closeStrategy("sheet", "dialog")).toBe("single")
    expect(matrix.canStack("dialog", "dialog")).toBe(true)
  })

  it("emits telemetry events for stack and close decisions", () => {
    const events: OverlayInteractionTelemetryEvent[] = []
    const matrix = createOverlayInteractionMatrix({
      telemetry: {
        emit: (event) => events.push(event),
      },
    })

    matrix.canStack("sheet", "dialog")
    matrix.closeStrategy("sheet", "dialog")

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      type: "stack-decision",
      source: "sheet",
      target: "dialog",
      allowed: false,
    })
    expect(events[1]).toMatchObject({
      type: "close-decision",
      source: "sheet",
      target: "dialog",
      strategy: "cascade",
    })
  })
})
