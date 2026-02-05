import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("disclosure-vue index exports", () => {
  it("exposes core and controller helpers", () => {
    expect(typeof api.DisclosureCore).toBe("function")
    expect(typeof api.useDisclosureController).toBe("function")
  })
})
