import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("tabs-vue index exports", () => {
  it("exposes core and controller helpers", () => {
    expect(typeof api.TabsCore).toBe("function")
    expect(typeof api.useTabsController).toBe("function")
  })
})
