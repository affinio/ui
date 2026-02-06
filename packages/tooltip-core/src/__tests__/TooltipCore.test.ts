import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipCore } from "../core/TooltipCore"
import { createOverlayManager } from "@affino/overlay-kernel"

const noopCallbacks = {
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onPositionChange: vi.fn(),
}

describe("TooltipCore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(noopCallbacks).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const createTooltip = (options = {}) => new TooltipCore({ id: "tooltip", ...options }, { ...noopCallbacks })

  it("schedules pointer-driven open and close with delays", () => {
    const tooltip = createTooltip({ openDelay: 20, closeDelay: 10 })
    const trigger = tooltip.getTriggerProps()

    trigger.onPointerEnter?.({})
    expect(tooltip.getSnapshot().open).toBe(false)
    vi.advanceTimersByTime(20)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onPointerLeave?.({})
    expect(tooltip.getSnapshot().open).toBe(true)
    vi.advanceTimersByTime(10)
    expect(tooltip.getSnapshot().open).toBe(false)
  })

  it("opens on focus and closes on blur immediately", () => {
    const tooltip = createTooltip()
    const trigger = tooltip.getTriggerProps()

    trigger.onFocus?.({} as FocusEvent)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onBlur?.({} as FocusEvent)
    expect(tooltip.getSnapshot().open).toBe(false)
  })

  it("reflects the latest state in tooltip props", () => {
    const tooltip = createTooltip()

    expect(tooltip.getTooltipProps()["data-state"]).toBe("closed")
    tooltip.open("programmatic")
    expect(tooltip.getTooltipProps()["data-state"]).toBe("open")
  })

  it("notifies subscribers whenever the snapshot changes", () => {
    const tooltip = createTooltip()
    const listener = vi.fn()

    tooltip.subscribe(listener)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ open: false }))

    tooltip.open("programmatic")
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }))
  })

  it("merges custom aria-describedby targets", () => {
    const tooltip = createTooltip()
    const trigger = tooltip.getTriggerProps({ describedBy: "tooltip-extra" })
    expect(trigger["aria-describedby"]).toBe("tooltip-content tooltip-extra")
  })

  it("ignores empty describedBy values in arrays", () => {
    const tooltip = createTooltip()
    const trigger = tooltip.getTriggerProps({ describedBy: ["", "external-a", "", "external-b"] })
    expect(trigger["aria-describedby"]).toBe("tooltip-content external-a external-b")
  })

  it("cancels close timers when pointer re-enters", () => {
    const tooltip = createTooltip({ openDelay: 10, closeDelay: 40 })
    const trigger = tooltip.getTriggerProps()

    trigger.onPointerEnter?.({})
    vi.advanceTimersByTime(10)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onPointerLeave?.({})
    vi.advanceTimersByTime(20)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onPointerEnter?.({})
    vi.advanceTimersByTime(40)
    expect(tooltip.getSnapshot().open).toBe(true)
  })

  it("cancels pending close when trigger receives focus", () => {
    const tooltip = createTooltip({ openDelay: 10, closeDelay: 40 })
    const trigger = tooltip.getTriggerProps()

    trigger.onPointerEnter?.({})
    vi.advanceTimersByTime(10)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onPointerLeave?.({})
    vi.advanceTimersByTime(20)
    expect(tooltip.getSnapshot().open).toBe(true)

    trigger.onFocus?.({} as FocusEvent)
    vi.advanceTimersByTime(40)
    expect(tooltip.getSnapshot().open).toBe(true)
  })

  it("returns arrow props for vertical placement", () => {
    const tooltip = createTooltip()
    const arrow = tooltip.getArrowProps({
      anchorRect: { x: 120, y: 200, width: 40, height: 30 },
      tooltipRect: { x: 0, y: 0, width: 160, height: 48 },
      position: { left: 80, top: 120, placement: "top", align: "center" },
      options: { size: 12, inset: 8 },
    })

    expect(arrow["data-placement"]).toBe("top")
    expect(arrow.style.left).toBe("54px")
    expect(arrow.style.bottom).toBe("-6px")
  })

  it("returns arrow props for horizontal placement", () => {
    const tooltip = createTooltip()
    const arrow = tooltip.getArrowProps({
      anchorRect: { x: 320, y: 200, width: 24, height: 24 },
      tooltipRect: { x: 0, y: 0, width: 120, height: 120 },
      position: { left: 360, top: 140, placement: "right", align: "start" },
      options: { size: 10, inset: 6, staticOffset: 12 },
    })

    expect(arrow["data-placement"]).toBe("right")
    expect(arrow.style.top).toBe("67px")
    expect(arrow.style.left).toBe("-12px")
    expect(arrow.style.right).toBeUndefined()
  })

  it("provides description props with ARIA live defaults", () => {
    const tooltip = createTooltip({ defaultOpen: true })
    const props = tooltip.getDescriptionProps({ role: "alert", politeness: "assertive", id: "custom" })

    expect(props.id).toBe("custom")
    expect(props.role).toBe("alert")
    expect(props["aria-live"]).toBe("assertive")
    expect(props["data-state"]).toBe("open")
    expect(props["aria-hidden"]).toBe("false")
  })

  it("registers with the overlay manager and mirrors lifecycle state", () => {
    const manager = createOverlayManager()
    const tooltip = new TooltipCore({ id: "tooltip-overlay", overlayManager: manager })

    tooltip.open("programmatic")
    expect(manager.getEntry("tooltip-overlay")?.state).toBe("open")

    tooltip.requestClose("programmatic")
    expect(manager.getEntry("tooltip-overlay")?.state).toBe("closed")

    tooltip.destroy()
    expect(manager.getEntry("tooltip-overlay")).toBeNull()
  })

  it("routes kernel-managed close reasons through the overlay manager before performing close", () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const tooltip = new TooltipCore({ id: "kernel-tooltip", defaultOpen: true, overlayManager: manager })

    tooltip.requestClose("pointer")
    expect(requestSpy).toHaveBeenCalledWith("kernel-tooltip", "pointer-outside")
    expect(tooltip.getSnapshot().open).toBe(false)

    tooltip.open("programmatic")
    tooltip.requestClose("keyboard")
    expect(requestSpy).toHaveBeenLastCalledWith("kernel-tooltip", "escape-key")
  })

  it("skips overlay close mediation when already closed", () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const tooltip = new TooltipCore({ id: "closed-tooltip", overlayManager: manager })

    tooltip.requestClose("pointer")
    expect(requestSpy).not.toHaveBeenCalled()
    expect(tooltip.getSnapshot().open).toBe(false)
  })
})
