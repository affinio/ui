import { describe, expect, it } from "vitest"
import { MenuTree } from "../core/MenuTree"

describe("MenuTree", () => {
  it("registers nodes and computes open paths", () => {
    const tree = new MenuTree("root")
    tree.register("child", "root", "root-item")
    tree.updateOpenState("child", true)

    expect(tree.snapshot.openPath).toEqual(["root", "child"])
  })

  it("updates active path when highlighting submenu triggers", () => {
    const tree = new MenuTree("root")
    tree.register("parent", "root", "root-item")
    tree.register("child", "parent", "parent-item")

    tree.updateHighlight("parent", "parent-item")
    expect(tree.snapshot.activePath).toEqual(["root", "parent", "child"])

    tree.updateHighlight("parent", null)
    expect(tree.snapshot.activePath).toEqual(["root", "parent"])
  })

  it("notifies subscribers with the latest snapshot", () => {
    const tree = new MenuTree("root")
    tree.register("child", "root", "root-item")
    const updates: string[][] = []

    tree.subscribe("child", (state) => updates.push(state.openPath))
    tree.updateOpenState("child", true)
    tree.updateOpenState("child", false)

    expect(updates).toContainEqual(["root", "child"])
    expect(updates.at(-1)).toEqual(["root"])
  })
})
