import { describe, expect, it } from "vitest"
import { TreeviewCore } from "../TreeviewCore"
import type { TreeviewNode } from "../types"

const DEFAULT_NODES: TreeviewNode<string>[] = [
  { value: "root", parent: null },
  { value: "alpha", parent: "root" },
  { value: "beta", parent: "root" },
  { value: "gamma", parent: "beta" },
]

describe("TreeviewCore", () => {
  it("tracks selection and expands ancestor path", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })

    core.select("gamma")

    expect(core.getSnapshot().selected).toBe("gamma")
    expect(core.getSnapshot().active).toBe("gamma")
    expect(core.isExpanded("root")).toBe(true)
    expect(core.isExpanded("beta")).toBe(true)
  })

  it("moves focus through visible nodes", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root", "beta"],
      defaultActive: "root",
      loop: true,
    })

    core.focusNext()
    expect(core.getSnapshot().active).toBe("alpha")
    core.focusNext()
    expect(core.getSnapshot().active).toBe("beta")
    core.focusNext()
    expect(core.getSnapshot().active).toBe("gamma")
    core.focusNext()
    expect(core.getSnapshot().active).toBe("root")
  })

  it("collapses focused branches back to parent", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root", "beta"],
      defaultActive: "gamma",
    })

    core.collapse("beta")

    expect(core.getSnapshot().active).toBe("beta")
    expect(core.getVisibleValues()).toEqual(["root", "alpha", "beta"])
  })

  it("ignores disabled nodes for focus and selection", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "disabled", parent: "root", disabled: true },
      ],
      defaultExpanded: ["root"],
      defaultActive: "root",
    })

    core.focus("disabled")
    expect(core.getSnapshot().active).toBe("root")

    core.select("disabled")
    expect(core.getSnapshot().selected).toBe(null)
  })

  it("normalizes state when nodes are re-registered", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root", "beta"],
      defaultActive: "gamma",
      defaultSelected: "gamma",
    })

    core.registerNodes([
      { value: "root", parent: null },
      { value: "alpha", parent: "root" },
    ])

    expect(core.getSnapshot().active).toBe("root")
    expect(core.getSnapshot().selected).toBe(null)
    expect(core.getSnapshot().expanded).toEqual(["root"])
  })

  it("supports partial node updates with register patch mode", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "alpha", parent: "root" },
      ],
      defaultExpanded: ["root"],
      defaultActive: "alpha",
      defaultSelected: "alpha",
    })

    core.registerNodes([{ value: "beta", parent: "root" }], { mode: "patch" })
    expect(core.getChildren("root")).toEqual(["alpha", "beta"])
    expect(core.getVisibleValues()).toEqual(["root", "alpha", "beta"])

    core.registerNodes([{ value: "alpha", parent: "root", disabled: true }], { mode: "patch" })
    expect(core.getSnapshot().active).toBe("root")
    expect(core.getSnapshot().selected).toBe(null)
  })

  it("keeps expanded order canonical across mutation order", () => {
    const nodes: TreeviewNode<string>[] = [
      { value: "root", parent: null },
      { value: "alpha", parent: "root" },
      { value: "alpha-child", parent: "alpha" },
      { value: "beta", parent: "root" },
      { value: "beta-child", parent: "beta" },
    ]
    const core = new TreeviewCore<string>({
      nodes,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })

    core.expand("beta")
    core.expand("alpha")

    expect(core.getSnapshot().expanded).toEqual(["root", "alpha", "beta"])
  })

  it("avoids re-emits when expanded values are semantically the same", () => {
    const nodes: TreeviewNode<string>[] = [
      { value: "root", parent: null },
      { value: "alpha", parent: "root" },
      { value: "alpha-child", parent: "alpha" },
      { value: "beta", parent: "root" },
      { value: "beta-child", parent: "beta" },
    ]
    const core = new TreeviewCore<string>({
      nodes,
      defaultExpanded: ["beta", "root", "alpha"],
      defaultActive: "root",
    })
    const snapshots: string[][] = []
    const subscription = core.subscribe((state) => {
      snapshots.push([...state.expanded])
    })

    core.registerNodes(nodes)

    subscription.unsubscribe()
    expect(snapshots).toEqual([["root", "alpha", "beta"]])
  })

  it("notifies subscribers only for meaningful state updates", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })
    const snapshots: Array<{ active: string | null; selected: string | null; expanded: string[] }> = []
    const subscription = core.subscribe((state) => {
      snapshots.push({
        active: state.active,
        selected: state.selected,
        expanded: [...state.expanded],
      })
    })

    core.focus("root")
    core.select("alpha")
    core.select("alpha")
    core.expand("beta")
    core.expand("beta")

    subscription.unsubscribe()

    expect(snapshots).toEqual([
      { active: "root", selected: null, expanded: ["root"] },
      { active: "alpha", selected: "alpha", expanded: ["root"] },
      { active: "alpha", selected: "alpha", expanded: ["root", "beta"] },
    ])
  })
})
