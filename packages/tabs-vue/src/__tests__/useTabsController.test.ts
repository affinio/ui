import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import { useTabsController, type TabsController } from "../useTabsController"

describe("useTabsController", () => {
  it("syncs reactive state with core", () => {
    const scope = effectScope()
    let controller!: TabsController<string>
    scope.run(() => {
      controller = useTabsController<string>(null)
    })
    controller.select("profile")
    expect(controller.state.value.value).toBe("profile")
    expect(controller.isSelected("profile")).toBe(true)
    controller.clear()
    expect(controller.state.value.value).toBe(null)
    scope.stop()
  })
})
