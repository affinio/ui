import { describe, expect, it, vi } from "vitest"
import { SurfaceCore } from "../core/SurfaceCore"

class TestSurfaceCore extends SurfaceCore {
  pointerLeave(): void {
    this.handlePointerLeave()
  }

  pointerEnter(): void {
    this.handlePointerEnter()
  }

  scheduleOpen(): void {
    this.timers.scheduleOpen(() => this.open("pointer"))
  }
}

describe("SurfaceCore", () => {
  it("opens/closes/toggles immediately regardless of configured delays", () => {
    const core = new SurfaceCore({ openDelay: 500, closeDelay: 500 })

    core.open("programmatic")
    expect(core.getSnapshot().open).toBe(true)

    core.close("programmatic")
    expect(core.getSnapshot().open).toBe(false)

    core.toggle()
    expect(core.getSnapshot().open).toBe(true)
  })

  it("stops state transitions and callback emissions after destroy", () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const onPositionChange = vi.fn()
    const core = new SurfaceCore(
      { id: "surface-guardrails" },
      {
        onOpen,
        onClose,
        onPositionChange,
      },
    )

    core.open("programmatic")
    expect(core.getSnapshot().open).toBe(true)
    expect(onOpen).toHaveBeenCalledTimes(1)

    core.destroy()
    const snapshotBefore = core.getSnapshot()
    core.close("programmatic")
    core.toggle()
    core.open("pointer")
    core.computePosition(
      { x: 0, y: 0, width: 40, height: 20 },
      { x: 0, y: 0, width: 80, height: 60 },
    )

    expect(core.getSnapshot()).toEqual(snapshotBefore)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onPositionChange).not.toHaveBeenCalled()
  })

  it("ignores new subscriptions after destroy", () => {
    const core = new SurfaceCore()
    core.destroy()

    const listener = vi.fn()
    const subscription = core.subscribe(listener)
    core.open()
    subscription.unsubscribe()

    expect(listener).not.toHaveBeenCalled()
  })

  it("cancels pending delayed close callbacks on destroy", () => {
    vi.useFakeTimers()
    try {
      const onClose = vi.fn()
      const core = new TestSurfaceCore(
        { id: "surface-destroy-timers", closeDelay: 25 },
        {
          onClose,
        },
      )

      core.open("programmatic")
      core.pointerLeave()
      core.destroy()
      vi.advanceTimersByTime(50)

      expect(core.getSnapshot().open).toBe(true)
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("schedules pointer-leave close using closeDelay and cancels on pointer-enter", () => {
    vi.useFakeTimers()
    try {
      const core = new TestSurfaceCore({ closeDelay: 40 })
      core.open("programmatic")
      expect(core.getSnapshot().open).toBe(true)

      core.pointerLeave()
      vi.advanceTimersByTime(39)
      expect(core.getSnapshot().open).toBe(true)

      core.pointerEnter()
      vi.advanceTimersByTime(2)
      expect(core.getSnapshot().open).toBe(true)

      core.pointerLeave()
      vi.advanceTimersByTime(40)
      expect(core.getSnapshot().open).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("supports delayed open only when adapter/controller explicitly schedules it", () => {
    vi.useFakeTimers()
    try {
      const core = new TestSurfaceCore({ openDelay: 30 })
      expect(core.getSnapshot().open).toBe(false)

      core.scheduleOpen()
      vi.advanceTimersByTime(29)
      expect(core.getSnapshot().open).toBe(false)

      vi.advanceTimersByTime(1)
      expect(core.getSnapshot().open).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns frozen snapshots and keeps reference stable for no-op transitions", () => {
    const core = new SurfaceCore()
    const first = core.getSnapshot() as { open: boolean }

    expect(Object.isFrozen(first)).toBe(true)
    expect(() => {
      first.open = true
    }).toThrow(TypeError)

    core.close("programmatic")
    expect(core.getSnapshot()).toBe(first)

    core.open("programmatic")
    const second = core.getSnapshot()
    expect(second).not.toBe(first)

    core.open("programmatic")
    expect(core.getSnapshot()).toBe(second)
  })
})
