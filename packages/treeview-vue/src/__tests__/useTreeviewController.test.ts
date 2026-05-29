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

  it("exposes windowed visible reads and node metadata", () => {
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
        defaultActive: "beta",
        defaultSelected: "gamma",
      })
    })

    expect(controller.getVisibleCount()).toBe(4)
    expect(controller.getVisibleAt(1)).toBe("alpha")
    expect(controller.getVisibleIndex("gamma")).toBe(3)
    expect(controller.getVisibleWindow(1, 3)).toEqual(["alpha", "beta"])
    expect(controller.getNodeMeta("beta")).toEqual({
      value: "beta",
      parent: "root",
      depth: 1,
      childCount: 1,
      disabled: false,
      expanded: true,
      selected: false,
      active: true,
      matched: false,
    })

    scope.stop()
  })

  it("exposes search projection helpers", () => {
    const scope = effectScope()
    let controller!: TreeviewController<string>
    scope.run(() => {
      controller = useTreeviewController<string>({
        nodes: [
          { value: "root", parent: null, text: "Workspace" },
          { value: "alpha", parent: "root", text: "Billing" },
          { value: "beta", parent: "root", text: "Security" },
        ],
        defaultExpanded: ["root"],
        defaultActive: "alpha",
      })
    })

    controller.setSearchQuery("security")

    expect(controller.getVisibleValues()).toEqual(["root", "beta"])
    expect(controller.getSearchMatchCount()).toBe(1)
    expect(controller.getNodeMeta("beta")).toMatchObject({ matched: true })

    controller.clearSearchQuery()
    expect(controller.getVisibleValues()).toEqual(["root", "alpha", "beta"])

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
