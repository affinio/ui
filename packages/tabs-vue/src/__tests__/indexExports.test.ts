import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("tabs-vue index exports", () => {
  it("exposes core, controller, and workspace UI helpers", () => {
    expect(typeof api.TabsCore).toBe("function")
    expect(typeof api.useTabsController).toBe("function")
    expect(typeof api.UiWorkspaceTabs).toBe("object")
  })
})
