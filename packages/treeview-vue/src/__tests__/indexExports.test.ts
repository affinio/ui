import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("treeview-vue index exports", () => {
  it("exposes core and controller helpers", () => {
    expect(typeof api.TreeviewCore).toBe("function")
    expect(typeof api.useTreeviewController).toBe("function")
  })
})
