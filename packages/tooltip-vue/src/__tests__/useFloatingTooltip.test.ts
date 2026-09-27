import { createApp, defineComponent, h, nextTick } from "vue"
import { describe, expect, it, vi } from "vitest"
import {
  getFloatingRelayoutMetrics,
  resetFloatingRelayoutMetrics,
  setFloatingRelayoutMetricsEnabled,
} from "@affino/overlay-host"
import { useTooltipController } from "../useTooltipController"
import { useFloatingTooltip } from "../useFloatingTooltip"

type MountedFloatingTooltip = {
  controller: ReturnType<typeof useTooltipController>
  floating: ReturnType<typeof useFloatingTooltip>
  cleanup: () => void
}

function mountFloatingTooltip(
  options?: Parameters<typeof useFloatingTooltip>[1],
  controllerOptions: Parameters<typeof useTooltipController>[0] = {},
): MountedFloatingTooltip {
  const host = document.createElement("div")
  document.body.appendChild(host)

  let controller!: ReturnType<typeof useTooltipController>
  let floating!: ReturnType<typeof useFloatingTooltip>

  const app = createApp(
    defineComponent({
      setup() {
        controller = useTooltipController({ id: `floating-tooltip-${Math.random().toString(36).slice(2)}`, ...controllerOptions })
        floating = useFloatingTooltip(controller, options)
        return () => h("div")
      },
    }),
  )

  app.mount(host)

  return {
    controller,
    floating,
    cleanup: () => {
      app.unmount()
      host.remove()
    },
  }
}

function setRect(el: HTMLElement, rect: Partial<DOMRect> & { width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      x: rect.x ?? 24,
      y: rect.y ?? 24,
      top: rect.top ?? rect.y ?? 24,
      left: rect.left ?? rect.x ?? 24,
      right: rect.right ?? (rect.x ?? 24) + rect.width,
      bottom: rect.bottom ?? (rect.y ?? 24) + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }) as DOMRect
}

describe("useFloatingTooltip", () => {
  it("resolves teleport target fallback to an overlay host", () => {
    const { floating, cleanup } = mountFloatingTooltip()

    try {
      const target = floating.teleportTarget.value
      expect(target instanceof HTMLElement).toBe(true)
      expect((target as HTMLElement).id).toBe("affino-tooltip-host")
      expect((target as HTMLElement).getAttribute("data-affino-tooltip-host")).toBe("true")
    } finally {
      cleanup()
    }
  })

  it("observes trigger and surface size only while initially open", async () => {
    const observed: Element[] = []
    const disconnect = vi.fn()
    vi.stubGlobal("ResizeObserver", class {
      observe(element: Element) { observed.push(element) }
      disconnect = disconnect
    })
    const trigger = document.createElement("button")
    const tooltip = document.createElement("div")
    document.body.append(trigger, tooltip)
    const { controller, floating, cleanup } = mountFloatingTooltip()
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = tooltip
    controller.open()
    await nextTick()
    expect(observed).toContain(trigger)
    expect(observed).toContain(tooltip)
    controller.close()
    await nextTick()
    expect(disconnect).toHaveBeenCalled()
    cleanup()
    trigger.remove()
    tooltip.remove()
    vi.unstubAllGlobals()
  })

  it("activates relayout listeners for defaultOpen", async () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    const { controller, floating, cleanup } = mountFloatingTooltip(undefined, { defaultOpen: true })
    const trigger = document.createElement("button")
    const tooltip = document.createElement("div")
    document.body.append(trigger, tooltip)
    setRect(trigger, { x: 100, y: 80, width: 64, height: 24 })
    setRect(tooltip, { width: 140, height: 56 })
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = tooltip
    await nextTick()
    expect(addSpy.mock.calls.some(([type]) => type === "resize")).toBe(true)
    expect(addSpy.mock.calls.some(([type]) => type === "scroll")).toBe(true)
    controller.close()
    cleanup()
    trigger.remove()
    tooltip.remove()
    addSpy.mockRestore()
  })

  it("drops measurements when refs change or the scope is disposed", async () => {
    const { controller, floating, cleanup } = mountFloatingTooltip()
    const trigger = document.createElement("button")
    const originalTooltip = document.createElement("div")
    const replacementTooltip = document.createElement("div")
    document.body.append(trigger, originalTooltip, replacementTooltip)
    setRect(trigger, { width: 64, height: 24 })
    setRect(originalTooltip, { width: 140, height: 56 })
    setRect(replacementTooltip, { width: 180, height: 64 })
    const originalMeasure = vi.spyOn(originalTooltip, "getBoundingClientRect")
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = originalTooltip
    controller.open("programmatic")

    try {
      const staleUpdate = floating.updatePosition()
      floating.tooltipRef.value = replacementTooltip
      await staleUpdate
      expect(originalMeasure).not.toHaveBeenCalled()

      const replacementMeasure = vi.spyOn(replacementTooltip, "getBoundingClientRect")
      const replacementCallsBeforeDispose = replacementMeasure.mock.calls.length
      const disposedUpdate = floating.updatePosition()
      cleanup()
      await disposedUpdate
      expect(replacementMeasure).toHaveBeenCalledTimes(replacementCallsBeforeDispose)
    } finally {
      controller.close("programmatic")
      trigger.remove()
      originalTooltip.remove()
      replacementTooltip.remove()
      cleanup()
    }
  })

  it("handles relayout storms while open without losing position state", async () => {
    const { controller, floating, cleanup } = mountFloatingTooltip({ zIndex: 88 })
    const trigger = document.createElement("button")
    const tooltip = document.createElement("div")
    document.body.appendChild(trigger)
    document.body.appendChild(tooltip)
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = tooltip
    setRect(trigger, { x: 100, y: 80, width: 64, height: 24 })
    setRect(tooltip, { x: 0, y: 0, width: 140, height: 56 })

    try {
      resetFloatingRelayoutMetrics(window)
      setFloatingRelayoutMetricsEnabled(true, window)
      controller.open("programmatic")
      await nextTick()
      await nextTick()

      for (let i = 0; i < 30; i += 1) {
        window.dispatchEvent(new Event("resize"))
        window.dispatchEvent(new Event("scroll"))
      }

      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(floating.tooltipStyle.value.left).not.toBe("-9999px")
      expect(floating.tooltipStyle.value.top).not.toBe("-9999px")
      expect(floating.tooltipStyle.value.zIndex).toBe("88")
      const metrics = getFloatingRelayoutMetrics(window)
      expect(metrics.enabled).toBe(true)
      expect(metrics.sources["tooltip-vue"]?.activations).toBeGreaterThan(0)
      expect(metrics.sources["tooltip-vue"]?.relayouts).toBeGreaterThan(0)
    } finally {
      setFloatingRelayoutMetricsEnabled(false, window)
      controller.close("programmatic")
      trigger.remove()
      tooltip.remove()
      cleanup()
    }
  })

  it.each(["absolute", "fixed"] as const)("converts viewport coordinates into the %s containing block", async (strategy) => {
    const parent = document.createElement("div")
    const trigger = document.createElement("button")
    const tooltip = document.createElement("div")
    document.body.append(parent, trigger, tooltip)
    setRect(parent, { x: 100, y: 60, width: 400, height: 300 })
    setRect(trigger, { x: 150, y: 80, width: 64, height: 24 })
    setRect(tooltip, { x: 0, y: 0, width: 140, height: 56 })
    Object.defineProperty(tooltip, "offsetParent", { configurable: true, value: parent })
    Object.defineProperty(parent, "clientLeft", { configurable: true, value: 2 })
    Object.defineProperty(parent, "clientTop", { configurable: true, value: 3 })
    Object.defineProperty(parent, "scrollLeft", { configurable: true, value: 4 })
    Object.defineProperty(parent, "scrollTop", { configurable: true, value: 5 })
    const { controller, floating, cleanup } = mountFloatingTooltip({ strategy, teleportTo: false, placement: "right", align: "center" })
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = tooltip
    controller.open()
    await nextTick()
    await nextTick()
    expect(floating.tooltipStyle.value.left).toBe("122px")
    expect(floating.tooltipStyle.value.top).toBe("6px")
    cleanup()
    parent.remove()
    trigger.remove()
    tooltip.remove()
  })

  it("remains stable across rapid pointer-like open/close transitions", async () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    const removeSpy = vi.spyOn(window, "removeEventListener")
    const { controller, floating, cleanup } = mountFloatingTooltip({ teleportTo: false })
    const trigger = document.createElement("button")
    const tooltip = document.createElement("div")
    document.body.appendChild(trigger)
    document.body.appendChild(tooltip)
    floating.triggerRef.value = trigger
    floating.tooltipRef.value = tooltip
    setRect(trigger, { x: 56, y: 56, width: 80, height: 28 })
    setRect(tooltip, { x: 0, y: 0, width: 120, height: 48 })

    try {
      controller.open("pointer")
      controller.close("pointer")
      controller.open("pointer")
      await nextTick()
      await nextTick()

      expect(floating.tooltipStyle.value.left).not.toBe("-9999px")
      expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function))
      expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), expect.objectContaining({ capture: true, passive: true }))

      controller.close("pointer")
      await nextTick()

      expect(floating.tooltipStyle.value.left).toBe("-9999px")
      expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function))
      expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), expect.objectContaining({ capture: true, passive: true }))
    } finally {
      addSpy.mockRestore()
      removeSpy.mockRestore()
      trigger.remove()
      tooltip.remove()
      cleanup()
    }
  })
})
