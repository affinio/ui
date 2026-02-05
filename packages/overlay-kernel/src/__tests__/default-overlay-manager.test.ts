import { describe, expect, it } from "vitest"

import { DefaultOverlayManager } from "../index"

describe("DefaultOverlayManager", () => {
  it("maintains stack order when entries change state", () => {
    const manager = new DefaultOverlayManager()

    manager.register({
      id: "dialog",
      kind: "dialog",
      state: "open",
    })

    manager.register({
      id: "tooltip",
      kind: "tooltip",
      ownerId: "dialog",
      state: "open",
    })

    expect(manager.getStack().map((entry) => entry.id)).toEqual(["dialog", "tooltip"])

    manager.update("tooltip", { state: "closed" })

    expect(manager.getStack().map((entry) => entry.id)).toEqual(["dialog"])
  })
})
