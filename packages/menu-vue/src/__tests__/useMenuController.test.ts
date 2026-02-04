import { describe, expect, it } from "vitest"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { useMenuController } from "../useMenuController"

function nextTick(): Promise<void> {
  return Promise.resolve()
}

describe("useMenuController", () => {
  it("registers overlays with the document manager by default", async () => {
    const manager = getDocumentOverlayManager(document)
    const controller = useMenuController({ kind: "root" })

    controller.open("programmatic")
    await nextTick()

    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(true)

    controller.close("programmatic")
    await nextTick()

    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(false)

    controller.dispose()
  })
})
