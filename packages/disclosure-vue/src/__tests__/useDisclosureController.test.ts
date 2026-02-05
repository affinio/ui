import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import { useDisclosureController } from "../useDisclosureController"

describe("useDisclosureController", () => {
  it("syncs reactive state with core", () => {
    const scope = effectScope()
    let controller!: ReturnType<typeof useDisclosureController>
    scope.run(() => {
      controller = useDisclosureController(false)
    })
    controller.open()
    expect(controller.state.value.open).toBe(true)
    scope.stop()
  })
})
