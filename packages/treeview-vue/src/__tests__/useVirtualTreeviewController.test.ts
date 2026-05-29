import { describe, expect, it, vi } from "vitest"
import { effectScope, nextTick } from "vue"
import {
  useVirtualTreeviewController,
  type VirtualTreeviewController,
} from "../useVirtualTreeviewController"

const NODES = [
  { value: "root", parent: null },
  { value: "alpha", parent: "root" },
  { value: "beta", parent: "root" },
  { value: "gamma", parent: "beta" },
  { value: "delta", parent: "beta" },
  { value: "omega", parent: "root" },
] as const

describe("useVirtualTreeviewController", () => {
  it("builds a window from core visible rows and metadata", () => {
    const scope = effectScope()
    let controller!: VirtualTreeviewController<string>
    scope.run(() => {
      controller = useVirtualTreeviewController<string>({
        nodes: NODES,
        defaultExpanded: ["root", "beta"],
        defaultActive: "beta",
        rowHeight: 10,
        viewportHeight: 20,
        overscan: 1,
      })
    })

    expect(controller.totalHeight.value).toBe(60)
    expect(controller.visibleWindow.value.map((row) => row.value)).toEqual(["root", "alpha", "beta"])
    expect(controller.visibleWindow.value[2]).toMatchObject({
      value: "beta",
      depth: 1,
      childCount: 2,
      expanded: true,
      active: true,
    })
    expect(controller.visibleRows.value.map((row) => ({ value: row.value, index: row.index, top: row.top, height: row.height }))).toEqual([
      { value: "root", index: 0, top: 0, height: 10 },
      { value: "alpha", index: 1, top: 10, height: 10 },
      { value: "beta", index: 2, top: 20, height: 10 },
    ])
    expect(Object.isFrozen(controller.visibleRows.value)).toBe(true)
    expect(Object.isFrozen(controller.visibleRows.value[0])).toBe(true)

    scope.stop()
  })

  it("batches scroll updates through animation frames", async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    let controller!: VirtualTreeviewController<string>
    scope.run(() => {
      controller = useVirtualTreeviewController<string>({
        nodes: NODES,
        defaultExpanded: ["root", "beta"],
        rowHeight: 10,
        viewportHeight: 20,
        overscan: 0,
      })
    })

    controller.setScrollTop(20)
    expect(controller.visibleWindow.value.map((row) => row.value)).toEqual(["root", "alpha"])

    vi.runOnlyPendingTimers()
    await nextTick()

    expect(controller.visibleWindow.value.map((row) => row.value)).toEqual(["beta", "gamma"])
    expect(controller.visibleRows.value.map((row) => row.top)).toEqual([20, 30])
    expect(controller.scrollTop.value).toBe(20)

    scope.stop()
    vi.useRealTimers()
  })

  it("refreshes window rows after tree mutations and scrollToValue", async () => {
    vi.useFakeTimers()
    const scope = effectScope()
    let controller!: VirtualTreeviewController<string>
    scope.run(() => {
      controller = useVirtualTreeviewController<string>({
        nodes: NODES,
        defaultExpanded: ["root", "beta"],
        rowHeight: 10,
        viewportHeight: 20,
        overscan: 0,
      })
    })

    controller.scrollToValue("delta")
    vi.runOnlyPendingTimers()
    await nextTick()
    expect(controller.scrollTop.value).toBe(40)
    expect(controller.visibleWindow.value.map((row) => row.value)).toEqual(["delta", "omega"])

    controller.collapse("beta")
    expect(controller.totalHeight.value).toBe(40)
    expect(controller.scrollTop.value).toBe(20)
    expect(controller.visibleWindow.value.map((row) => row.value)).toEqual(["beta", "omega"])

    scope.stop()
    vi.useRealTimers()
  })
})
