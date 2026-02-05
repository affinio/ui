import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("popover-vue index exports", () => {
  it("exposes controller and floating helpers", () => {
    expect(typeof api.usePopoverController).toBe("function")
    expect(typeof api.useFloatingPopover).toBe("function")
    expect(typeof api.PopoverCore).toBe("function")
  })
})
