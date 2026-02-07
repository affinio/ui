import { describe, expect, it, vi } from "vitest"
import { createMenuTree } from "../createMenuTree"
import { SubmenuCore } from "../core/SubmenuCore"

const triggerRect = { x: 0, y: 0, width: 100, height: 20 }
const panelRect = { x: 200, y: 0, width: 240, height: 300 }

describe("createMenuTree", () => {
  it("creates a root branch with the standard menu API", () => {
    const tree = createMenuTree()

    expect(tree.root.kind).toBe("root")
    expect(tree.root.getSnapshot().open).toBe(false)

    const triggerProps = tree.root.getTriggerProps()
    expect(triggerProps.role).toBe("button")

    tree.destroy()
  })

  it("exposes geometry and pointer adapters for submenus", () => {
    const tree = createMenuTree()
    tree.root.registerItem("parent")

    const submenu = tree.createSubmenu({ parent: tree.root, parentItemId: "parent" })
    expect(submenu.kind).toBe("submenu")
    expect(submenu.geometry).not.toBeNull()
    expect(submenu.pointer).not.toBeNull()

    if (!(submenu.core instanceof SubmenuCore)) {
      throw new Error("Expected submenu core instance")
    }

    const triggerSpy = vi.spyOn(submenu.core, "setTriggerRect")
    const panelSpy = vi.spyOn(submenu.core, "setPanelRect")
    const pointerSpy = vi.spyOn(submenu.core, "recordPointer")

    submenu.geometry?.setTriggerRect(triggerRect)
    submenu.geometry?.setPanelRect(panelRect)
    submenu.geometry?.sync({ trigger: null, panel: null })
    submenu.pointer?.record({ x: 20, y: 40 })

    expect(triggerSpy).toHaveBeenCalledWith(triggerRect)
    expect(panelSpy).toHaveBeenCalledWith(panelRect)
    expect(triggerSpy).toHaveBeenCalledWith(null)
    expect(panelSpy).toHaveBeenCalledWith(null)
    expect(pointerSpy).toHaveBeenCalledWith({ x: 20, y: 40 })

    tree.destroy()
  })

  it("destroys all branches exactly once", () => {
    const tree = createMenuTree()
    tree.root.registerItem("parent")
    const submenu = tree.createSubmenu({ parent: tree.root, parentItemId: "parent" })

    const rootDestroy = vi.spyOn(tree.root.core, "destroy")
    const submenuDestroy = vi.spyOn(submenu.core, "destroy")

    tree.destroy()
    tree.destroy()

    expect(rootDestroy).toHaveBeenCalledTimes(1)
    expect(submenuDestroy).toHaveBeenCalledTimes(1)
  })

  it("accepts parent cores outside of branch wrappers", () => {
    const tree = createMenuTree()
    tree.root.registerItem("parent")

    const submenu = tree.createSubmenu({ parent: tree.root.core, parentItemId: "parent" })
    expect(submenu.kind).toBe("submenu")

    tree.destroy()
  })

  it("throws when creating submenu for unregistered parent item", () => {
    const tree = createMenuTree()

    expect(() =>
      tree.createSubmenu({
        parent: tree.root,
        parentItemId: "missing-item",
      }),
    ).toThrow(
      'Cannot create submenu for unregistered parent item "missing-item". Register the parent item before calling createSubmenu().',
    )

    tree.destroy()
  })
})
