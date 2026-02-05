import { describe, expect, it } from "vitest"
import { TabsCore } from "../TabsCore"

describe("TabsCore", () => {
  it("tracks selected tab value", () => {
    const core = new TabsCore()
    expect(core.getSnapshot().value).toBe(null)
    core.select("profile")
    expect(core.getSnapshot().value).toBe("profile")
    core.clear()
    expect(core.getSnapshot().value).toBe(null)
  })

  it("notifies subscribers only on meaningful changes", () => {
    const core = new TabsCore()
    const states: Array<string | null> = []
    const subscription = core.subscribe((state) => {
      states.push(state.value)
    })
    core.select("general")
    core.select("general")
    core.select("security")
    core.clear()
    core.clear()
    subscription.unsubscribe()
    expect(states).toEqual([null, "general", "security", null])
  })
})
