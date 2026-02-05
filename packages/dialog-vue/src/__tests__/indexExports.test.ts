import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("dialog-vue index exports", () => {
  it("exposes public adapter APIs", () => {
    expect(typeof api.useDialogController).toBe("function")
    expect(typeof api.createDialogFocusOrchestrator).toBe("function")
    expect(typeof api.createDialogOverlayRegistrar).toBe("function")
    expect(typeof api.provideDialogOverlayRegistrar).toBe("function")
    expect(typeof api.useDialogOverlayRegistrar).toBe("function")
  })
})
