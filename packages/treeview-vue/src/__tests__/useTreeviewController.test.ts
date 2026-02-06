import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import {
  useTreeviewController,
  type TreeviewController,
} from "../useTreeviewController"

describe("useTreeviewController", () => {
  it("syncs reactive state with core", () => {
    const scope = effectScope()
    let controller!: TreeviewController<string>
    scope.run(() => {
      controller = useTreeviewController<string>({
        nodes: [
          { value: "root", parent: null },
          { value: "alpha", parent: "root" },
          { value: "beta", parent: "root" },
        ],
        defaultExpanded: ["root"],
        defaultActive: "root",
      })
    })

    controller.select("beta")
    expect(controller.state.value.selected).toBe("beta")
    expect(controller.state.value.active).toBe("beta")
    expect(controller.isSelected("beta")).toBe(true)

    controller.clearSelection()
    expect(controller.state.value.selected).toBe(null)

    scope.stop()
  })

  it("exposes tree navigation helpers", () => {
    const scope = effectScope()
    let controller!: TreeviewController<string>
    scope.run(() => {
      controller = useTreeviewController<string>({
        nodes: [
          { value: "root", parent: null },
          { value: "alpha", parent: "root" },
          { value: "beta", parent: "root" },
          { value: "gamma", parent: "beta" },
        ],
        defaultExpanded: ["root", "beta"],
        defaultActive: "root",
        loop: true,
      })
    })

    controller.focusNext()
    expect(controller.state.value.active).toBe("alpha")
    controller.focusNext()
    expect(controller.state.value.active).toBe("beta")
    controller.focusNext()
    expect(controller.state.value.active).toBe("gamma")
    controller.focusNext()
    expect(controller.state.value.active).toBe("root")

    controller.collapse("beta")
    expect(controller.getVisibleValues()).toEqual(["root", "alpha", "beta"])

    scope.stop()
  })
})
