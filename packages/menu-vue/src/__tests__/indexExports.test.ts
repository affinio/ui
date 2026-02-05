import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("menu-vue index exports", () => {
  it("exposes public Vue menu APIs", () => {
    expect(api.UiMenu).toBeTruthy()
    expect(api.UiMenuTrigger).toBeTruthy()
    expect(api.UiMenuContent).toBeTruthy()
    expect(api.UiMenuItem).toBeTruthy()
    expect(typeof api.useMenu).toBe("function")
    expect(typeof api.useMenuShortcuts).toBe("function")
  })
})
