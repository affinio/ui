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
})
