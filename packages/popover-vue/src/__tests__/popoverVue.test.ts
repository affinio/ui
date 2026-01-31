import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import { usePopoverController } from "../usePopoverController"

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
})
