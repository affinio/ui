import { describe, expect, it, vi } from "vitest"
import { effectScope } from "vue"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { useTooltipController } from "../useTooltipController"

describe("useTooltipController", () => {
  it("streams open state and stops when the scope is disposed", () => {
    const scope = effectScope()
    let controller!: ReturnType<typeof useTooltipController>

    scope.run(() => {
      controller = useTooltipController({ id: "test-tooltip" })
    })

    expect(controller.state.value.open).toBe(false)
    controller.open()
    expect(controller.state.value.open).toBe(true)

    scope.stop()
    controller.close()
    expect(controller.state.value.open).toBe(true)
  })

  it("registers with the document overlay manager by default", () => {
    const manager = getDocumentOverlayManager(document)
    const controller = useTooltipController({ id: "tooltip-kernel-test" })

    controller.open()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(true)

    controller.close()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(false)

    controller.dispose()
  })

  it("releases overlay registration when disposed while open", () => {
    const manager = getDocumentOverlayManager(document)
    const controller = useTooltipController({ id: "tooltip-dispose-open" })

    controller.open("programmatic")
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(true)

    controller.dispose()
    expect(manager.getStack().some((entry) => entry.id === controller.id)).toBe(false)
  })

  it("closes on window blur and suppresses hover until the trigger is left", () => {
    vi.useFakeTimers()
    const controller = useTooltipController({ id: "tooltip-window-blur", openDelay: 0 })
    const trigger = controller.getTriggerProps()
    const event = {} as PointerEvent

    trigger.onPointerenter?.(event)
    vi.runOnlyPendingTimers()
    expect(controller.state.value.open).toBe(true)

    window.dispatchEvent(new Event("blur"))
    expect(controller.state.value.open).toBe(false)

    window.dispatchEvent(new Event("focus"))
    trigger.onPointerenter?.(event)
    vi.runOnlyPendingTimers()
    expect(controller.state.value.open).toBe(false)

    trigger.onPointerleave?.(event)
    trigger.onPointerenter?.(event)
    vi.runOnlyPendingTimers()
    expect(controller.state.value.open).toBe(true)

    controller.dispose()
    vi.useRealTimers()
  })

  it("cancels pending hover opening on blur and Escape closes the active tooltip", () => {
    vi.useFakeTimers()
    const controller = useTooltipController({ id: "tooltip-pending-blur", openDelay: 100 })
    controller.getTriggerProps().onPointerenter?.({} as PointerEvent)
    window.dispatchEvent(new Event("blur"))
    vi.advanceTimersByTime(120)
    expect(controller.state.value.open).toBe(false)

    const trigger = controller.getTriggerProps()
    trigger.onPointerleave?.({} as PointerEvent)
    trigger.onPointerenter?.({} as PointerEvent)
    const pendingEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    document.dispatchEvent(pendingEscape)
    vi.advanceTimersByTime(120)
    expect(controller.state.value.open).toBe(false)
    expect(pendingEscape.defaultPrevented).toBe(true)

    controller.open("programmatic")
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    expect(controller.state.value.open).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    controller.dispose()
    vi.useRealTimers()
  })

  it("does not bind global listeners for closed controllers and shares active listeners", () => {
    const docAdd = vi.spyOn(document, "addEventListener")
    const winAdd = vi.spyOn(window, "addEventListener")
    const controllers = Array.from({ length: 20 }, (_, index) => useTooltipController({ id: `idle-tooltip-${index}` }))
    expect(docAdd.mock.calls.filter(([type]) => type === "keydown" || type === "visibilitychange")).toHaveLength(0)
    expect(winAdd.mock.calls.filter(([type]) => type === "blur")).toHaveLength(0)
    controllers.forEach((controller) => controller.open())
    expect(docAdd.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1)
    controllers.forEach((controller) => controller.close())
    expect(docAdd.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1)
    controllers.forEach((controller) => controller.dispose())
    docAdd.mockRestore()
    winAdd.mockRestore()
  })

  it("is safe in SSR-like environments without document", () => {
    vi.stubGlobal("document", undefined)
    try {
      const controller = useTooltipController({ id: "ssr-tooltip" })
      controller.open("programmatic")
      controller.close("programmatic")
      expect(controller.state.value.open).toBe(false)
      controller.dispose()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
