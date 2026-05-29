/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { createApp, defineComponent, effectScope, h, nextTick } from "vue"
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
  it("renders positioned virtual rows without blanking the viewport", async () => {
    vi.useFakeTimers()
    let controller!: VirtualTreeviewController<string>
    const host = document.createElement("div")
    document.body.appendChild(host)
    const app = createApp(
      defineComponent({
        setup() {
          controller = useVirtualTreeviewController<string>({
            nodes: NODES,
            defaultExpanded: ["root", "beta"],
            rowHeight: 10,
            viewportHeight: 20,
            overscan: 0,
          })
          return () => h(
            "div",
            {
              "data-testid": "viewport",
              style: {
                height: `${controller.viewportHeight.value}px`,
                overflow: "auto",
                position: "relative",
              },
            },
            [
              h("div", {
                "data-testid": "spacer",
                style: {
                  height: `${controller.totalHeight.value}px`,
                  position: "relative",
                },
              }, controller.visibleRows.value.map((row) => h("div", {
                key: row.value,
                "data-testid": "row",
                "data-value": row.value,
                style: {
                  position: "absolute",
                  top: `${row.top}px`,
                  height: `${row.height}px`,
                },
              }, row.value))),
            ],
          )
        },
      }),
    )

    app.mount(host)
    await nextTick()

    expect(Array.from(host.querySelectorAll('[data-testid="row"]')).map((row) => row.getAttribute("data-value"))).toEqual(["root", "alpha"])
    expect(host.querySelector('[data-testid="spacer"]')?.getAttribute("style")).toContain("height: 60px")

    controller.setScrollTop(30)
    vi.runOnlyPendingTimers()
    await nextTick()

    const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="row"]'))
    expect(rows.map((row) => row.getAttribute("data-value"))).toEqual(["gamma", "delta"])
    expect(rows.map((row) => row.style.top)).toEqual(["30px", "40px"])
    expect(rows.length).toBeGreaterThan(0)

    app.unmount()
    host.remove()
    vi.useRealTimers()
  })

})
