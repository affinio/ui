import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("tooltip-vue index exports", () => {
  it("exposes controller and floating helpers", () => {
    expect(typeof api.useTooltipController).toBe("function")
    expect(typeof api.useFloatingTooltip).toBe("function")
    expect(typeof api.TooltipCore).toBe("function")
  })
})
