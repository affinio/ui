import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { useTooltipController } from "../useTooltipController"

describe("useTooltipController", () => {
  it("streams open state and stops when the scope is disposed", () => {
    const scope = effectScope()
    let controller!: ReturnType<typeof useTooltipController>

    scope.run(() => {
      controller = useTooltipController({ id: "test-tooltip" })
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
    const controller = useTooltipController({ id: "tooltip-kernel-test" })

    controller.open()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(true)

    controller.close()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(false)

    controller.dispose()
  })
})
