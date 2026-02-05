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

  it("respects overlay priorities across independent roots", async () => {
    const manager = getDocumentOverlayManager(document)
    const lowPriority = useMenuController({
      kind: "root",
      options: { overlayEntryTraits: { priority: 20 } },
    })
    const highPriority = useMenuController({
      kind: "root",
      options: { overlayEntryTraits: { priority: 90 } },
    })

    lowPriority.open("programmatic")
    highPriority.open("programmatic")
    await nextTick()

    expect(manager.isTopMost(highPriority.id)).toBe(true)
    expect(manager.isTopMost(lowPriority.id)).toBe(false)

    highPriority.close("programmatic")
    await nextTick()
    expect(manager.isTopMost(lowPriority.id)).toBe(true)

    lowPriority.dispose()
    highPriority.dispose()
  })

  it("removes nested owner overlay entries when the parent root closes", async () => {
    const manager = getDocumentOverlayManager(document)
    const parentRoot = useMenuController({
      kind: "root",
      options: { overlayEntryTraits: { priority: 40 } },
    })
    const childRoot = useMenuController({
      kind: "root",
      options: {
        overlayEntryTraits: {
          ownerId: parentRoot.id,
          priority: 95,
        },
      },
    })

    parentRoot.open("programmatic")
    childRoot.open("programmatic")
    await nextTick()

    expect(manager.getStack().some((entry) => entry.id === parentRoot.id)).toBe(true)
    expect(manager.getStack().some((entry) => entry.id === childRoot.id)).toBe(true)
    expect(manager.isTopMost(childRoot.id)).toBe(true)

    parentRoot.close("programmatic")
    await nextTick()

    expect(manager.getStack().some((entry) => entry.id === parentRoot.id)).toBe(false)
    expect(manager.getStack().some((entry) => entry.id === childRoot.id)).toBe(false)

    parentRoot.dispose()
    childRoot.dispose()
  })
})
