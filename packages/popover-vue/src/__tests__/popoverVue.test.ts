import { describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { usePopoverController } from "../usePopoverController"
import { useFloatingPopover } from "../useFloatingPopover"

describe("usePopoverController", () => {
  it("streams open state and stops with the scope", () => {
    const scope = effectScope()
    let controller!: ReturnType<typeof usePopoverController>

    scope.run(() => {
      controller = usePopoverController({ id: "test-popover" })
    })

    expect(controller.state.value.open).toBe(false)
    controller.open()
    expect(controller.state.value.open).toBe(true)

    scope.stop()
    controller.close()
    expect(controller.state.value.open).toBe(true)
  })

  it("registers with the document overlay manager by default", () => {
    const manager = getDocumentOverlayManager(document)
    const controller = usePopoverController({ id: "popover-kernel-test" })

    controller.open()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(true)

    controller.close()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(false)

    controller.dispose()
  })

  it("is safe in SSR-like environments without document", () => {
    vi.stubGlobal("document", undefined)
    try {
      const scope = effectScope()
      let controller!: ReturnType<typeof usePopoverController>
      let floating!: ReturnType<typeof useFloatingPopover>
      scope.run(() => {
        controller = usePopoverController({ id: "ssr-popover" })
        floating = useFloatingPopover(controller, { teleportTo: false })
      })
      controller.open("programmatic")
      controller.close("programmatic")
      expect(controller.state.value.open).toBe(false)
      expect(floating.teleportTarget.value).toBeNull()
      scope.stop()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
