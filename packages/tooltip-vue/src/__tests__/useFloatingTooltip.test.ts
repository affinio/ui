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

function mountFloatingTooltip(options?: Parameters<typeof useFloatingTooltip>[1]): MountedFloatingTooltip {
  const host = document.createElement("div")
  document.body.appendChild(host)

  let controller!: ReturnType<typeof useTooltipController>
  let floating!: ReturnType<typeof useFloatingTooltip>

  const app = createApp(
    defineComponent({
      setup() {
        controller = useTooltipController({ id: `floating-tooltip-${Math.random().toString(36).slice(2)}` })
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
