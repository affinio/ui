import { describe, expect, it } from "vitest"
import { DisclosureCore } from "../DisclosureCore"

describe("DisclosureCore", () => {
  it("tracks open/close state", () => {
    const core = new DisclosureCore()
    expect(core.getSnapshot().open).toBe(false)
    core.open()
    expect(core.getSnapshot().open).toBe(true)
    core.close()
    expect(core.getSnapshot().open).toBe(false)
  })

  it("notifies subscribers", () => {
    const core = new DisclosureCore()
    const states: boolean[] = []
    const subscription = core.subscribe((state) => {
      states.push(state.open)
    })
    core.toggle()
    core.toggle()
    subscription.unsubscribe()
    expect(states).toEqual([false, true, false])
  })

  it("exposes isOpen and returns immutable snapshots", () => {
    const core = new DisclosureCore()
    expect(core.isOpen()).toBe(false)

    const first = core.getSnapshot() as { open: boolean }
    core.open()
    expect(core.isOpen()).toBe(true)
    const second = core.getSnapshot() as { open: boolean }

    expect(first).not.toBe(second)
    expect(first.open).toBe(false)
    expect(second.open).toBe(true)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(second)).toBe(true)
    expect(() => {
      first.open = true
    }).toThrow(TypeError)
  })

  it("keeps snapshot reference stable for no-op operations", () => {
    const core = new DisclosureCore()
    const first = core.getSnapshot()

    core.close()
    expect(core.getSnapshot()).toBe(first)

    core.open()
    const second = core.getSnapshot()
    expect(second).not.toBe(first)

    core.open()
    expect(core.getSnapshot()).toBe(second)
  })

  it("does not notify subscribers for duplicate open/close operations", () => {
    const core = new DisclosureCore()
    const states: boolean[] = []
    const subscription = core.subscribe((state) => {
      states.push(state.open)
    })

    core.close()
    core.open()
    core.open()
    core.close()
    core.close()

    subscription.unsubscribe()
    expect(states).toEqual([false, true, false])
  })
})
