import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("grid-selection-vue index exports", () => {
  it("exposes grid store APIs", () => {
    expect(typeof api.createGridSelectionStore).toBe("function")
    expect(typeof api.useGridSelectionStore).toBe("function")
  })
})
