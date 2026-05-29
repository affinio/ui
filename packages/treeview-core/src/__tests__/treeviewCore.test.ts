import { describe, expect, it, vi } from "vitest"
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

  it("uses visible navigation indexes for focus movement", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "disabled-a", parent: "root", disabled: true },
        { value: "alpha", parent: "root" },
        { value: "disabled-b", parent: "root", disabled: true },
        { value: "beta", parent: "root" },
      ],
      defaultExpanded: ["root"],
      defaultActive: "alpha",
    })
    const visible = core.getVisibleValues()
    const findIndex = vi.spyOn(visible, "findIndex")
    const find = vi.spyOn(visible, "find")
    const internals = core as unknown as {
      visibleCache: string[] | null
      visibleIndexByValue: Map<string, number>
      enabledVisibleValues: string[]
      enabledVisibleIndexes: number[]
    }
    internals.visibleCache = visible

    core.focusNext()

    expect(core.getSnapshot().active).toBe("beta")
    expect(findIndex).not.toHaveBeenCalled()
    expect(find).not.toHaveBeenCalled()
    expect(internals.visibleIndexByValue.get("beta")).toBe(4)
    expect(internals.enabledVisibleValues).toEqual(["root", "alpha", "beta"])
    expect(internals.enabledVisibleIndexes).toEqual([0, 2, 4])
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

  it("normalizes missing parents and parent cycles into stable roots", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "alpha", parent: "beta" },
        { value: "beta", parent: "alpha" },
        { value: "orphan", parent: "missing" },
        { value: "root", parent: null },
        { value: "child", parent: "root" },
      ],
      defaultExpanded: ["root", "alpha", "beta", "orphan"],
    })

    expect(core.getParent("alpha")).toBe(null)
    expect(core.getParent("beta")).toBe(null)
    expect(core.getParent("orphan")).toBe(null)
    expect(core.getVisibleValues()).toEqual(["alpha", "beta", "orphan", "root", "child"])
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

  it("builds source-owned preorder and depth indexes", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "alpha", parent: "root" },
        { value: "alpha-child", parent: "alpha" },
        { value: "beta", parent: "root" },
      ],
      defaultExpanded: ["root", "alpha"],
    })
    const internals = core as unknown as {
      preorderValues: string[]
      preorderIndexByValue: Map<string, number>
      depthByValue: Map<string, number>
      subtreeEndIndexByValue: Map<string, number>
    }

    expect(internals.preorderValues).toEqual(["root", "alpha", "alpha-child", "beta"])
    expect(internals.preorderIndexByValue.get("beta")).toBe(3)
    expect(internals.depthByValue.get("alpha-child")).toBe(2)
    expect(internals.subtreeEndIndexByValue.get("root")).toBe(4)
    expect(internals.subtreeEndIndexByValue.get("alpha")).toBe(3)
    expect(internals.subtreeEndIndexByValue.get("beta")).toBe(4)
  })

  it("handles deep expanded chains without recursive stack overflow", () => {
    const nodes: TreeviewNode<string>[] = Array.from({ length: 10000 }, (_entry, index) => ({
      value: `node-${index}`,
      parent: index === 0 ? null : `node-${index - 1}`,
    }))
    const expanded = nodes.slice(0, -1).map((node) => node.value)
    const core = new TreeviewCore<string>({
      nodes,
      defaultExpanded: expanded,
      defaultActive: "node-9999",
    })

    expect(core.getSnapshot().active).toBe("node-9999")
    expect(core.getSnapshot().expanded).toHaveLength(9999)
    expect(core.getVisibleValues()).toHaveLength(10000)
  })

  it("normalizes expanded values by source preorder without traversal reads", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "alpha", parent: "root" },
        { value: "alpha-child", parent: "alpha" },
        { value: "beta", parent: "root" },
        { value: "beta-child", parent: "beta" },
      ],
      defaultExpanded: ["root"],
    })
    const traversal = vi.spyOn(
      core as unknown as { getNodeTraversalOrder: () => string[] },
      "getNodeTraversalOrder",
    )

    core.expand("beta")
    core.expand("alpha")

    expect(core.getSnapshot().expanded).toEqual(["root", "alpha", "beta"])
    expect(traversal).not.toHaveBeenCalled()
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

  it("provides deterministic request* results with failure reasons", () => {
    const core = new TreeviewCore<string>({
      nodes: [
        { value: "root", parent: null },
        { value: "alpha", parent: "root" },
        { value: "disabled", parent: "root", disabled: true },
      ],
      defaultExpanded: ["root"],
      defaultActive: "root",
    })

    expect(core.requestFocus("missing")).toEqual({ ok: false, changed: false, reason: "missing-node" })
    expect(core.requestSelect("disabled")).toEqual({ ok: false, changed: false, reason: "disabled-node" })
    expect(core.requestExpand("alpha")).toEqual({ ok: false, changed: false, reason: "leaf-node" })

    const focused = core.requestFocus("alpha")
    expect(focused.ok).toBe(true)
    expect(core.getSnapshot().active).toBe("alpha")

    const selected = core.requestSelect("alpha")
    expect(selected.ok).toBe(true)
    expect(core.getSnapshot().selected).toBe("alpha")
  })

  it("returns frozen snapshots (including expanded collection)", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })
    const snapshot = core.getSnapshot() as {
      active: string | null
      selected: string | null
      expanded: string[]
    }

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.expanded)).toBe(true)
    expect(() => {
      snapshot.active = "alpha"
    }).toThrow(TypeError)
    expect(() => {
      snapshot.expanded.push("beta")
    }).toThrow(TypeError)
  })

  it("reuses frozen expanded snapshots for active and selected only updates", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })
    const initialExpanded = core.getSnapshot().expanded

    core.focus("alpha")
    const focusedExpanded = core.getSnapshot().expanded
    core.select("beta")
    const selectedExpanded = core.getSnapshot().expanded
    core.clearSelection()

    expect(focusedExpanded).toBe(initialExpanded)
    expect(selectedExpanded).toBe(initialExpanded)
    expect(core.getSnapshot().expanded).toBe(initialExpanded)
  })

  it("does not normalize expanded order for active-only focus changes", () => {
    const nodes: TreeviewNode<string>[] = [
      { value: "root", parent: null },
      { value: "alpha", parent: "root" },
      { value: "beta", parent: "root" },
    ]
    const core = new TreeviewCore<string>({
      nodes,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })
    const normalizeExpandedValues = vi.spyOn(
      core as unknown as { normalizeExpandedValues: (values: Iterable<string>) => string[] },
      "normalizeExpandedValues",
    )

    core.focus("alpha")
    core.focus("beta")

    expect(normalizeExpandedValues).not.toHaveBeenCalled()
    expect(core.getSnapshot().expanded).toEqual(["root"])
  })

  it("uses expanded membership without scanning arrays", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root", "beta"],
      defaultActive: "root",
    })
    const includes = vi.spyOn(Array.prototype, "includes")
    includes.mockClear()

    const result = core.isExpanded("beta")
    const includeCallCount = includes.mock.calls.length
    includes.mockRestore()

    expect(result).toBe(true)
    expect(includeCallCount).toBe(0)
  })

  it("keeps snapshot reference stable for no-op/failure requests", () => {
    const core = new TreeviewCore<string>({
      nodes: DEFAULT_NODES,
      defaultExpanded: ["root"],
      defaultActive: "root",
    })
    const before = core.getSnapshot()

    expect(core.requestFocus("root")).toEqual({ ok: true, changed: false })
    expect(core.getSnapshot()).toBe(before)

    expect(core.requestFocus("missing")).toEqual({ ok: false, changed: false, reason: "missing-node" })
    expect(core.getSnapshot()).toBe(before)
  })
})
