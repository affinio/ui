import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MenuTimers } from "../core/Timers"

describe("MenuTimers", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("schedules open callbacks with debouncing", () => {
    const timers = new MenuTimers({ openDelay: 50, closeDelay: 100 })
    const callback = vi.fn()

    timers.scheduleOpen(callback)
    timers.scheduleOpen(callback)
    vi.advanceTimersByTime(49)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("cancels pending open timers", () => {
    const timers = new MenuTimers({ openDelay: 50, closeDelay: 100 })
    const callback = vi.fn()

    timers.scheduleOpen(callback)
    timers.cancelOpen()
    vi.advanceTimersByTime(100)

    expect(callback).not.toHaveBeenCalled()
  })

  it("handles close timers independently", () => {
    const timers = new MenuTimers({ openDelay: 50, closeDelay: 30 })
    const callback = vi.fn()

    timers.scheduleClose(callback)
    vi.advanceTimersByTime(29)
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
