import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipCore } from "../core/TooltipCore"

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
})
