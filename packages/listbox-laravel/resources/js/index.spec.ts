import { describe, expect, it } from "vitest"
import { bootstrapAffinoListboxes, hydrateListbox } from "./index"

describe("@affino/listbox-laravel public API", () => {
  it("exposes bootstrapAffinoListboxes", () => {
    expect(typeof bootstrapAffinoListboxes).toBe("function")
  })

  it("exposes hydrateListbox", () => {
    expect(typeof hydrateListbox).toBe("function")
  })
})
