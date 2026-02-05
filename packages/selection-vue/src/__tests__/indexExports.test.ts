import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("selection-vue index exports", () => {
  it("exposes linear and listbox store APIs", () => {
    expect(typeof api.createLinearSelectionStore).toBe("function")
    expect(typeof api.useLinearSelectionStore).toBe("function")
    expect(typeof api.createListboxStore).toBe("function")
    expect(typeof api.useListboxStore).toBe("function")
  })
})
