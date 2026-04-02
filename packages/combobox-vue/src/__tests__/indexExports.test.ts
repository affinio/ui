import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("combobox-vue index exports", () => {
  it("exposes the public adapter APIs", () => {
    expect(typeof api.createComboboxStore).toBe("function")
    expect(typeof api.useComboboxStore).toBe("function")
    expect(typeof api.createComboboxState).toBe("function")
    expect(typeof api.setComboboxFilter).toBe("function")
  })
})