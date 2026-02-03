import { describe, expect, it } from "vitest"
import { bootstrapAffinoPopovers, hydratePopover } from "./index"

describe("@affino/popover-laravel public API", () => {
  it("exposes bootstrapAffinoPopovers", () => {
    expect(typeof bootstrapAffinoPopovers).toBe("function")
  })

  it("exposes hydratePopover", () => {
    expect(typeof hydratePopover).toBe("function")
  })
})
