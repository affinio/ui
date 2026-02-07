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

  it("returns frozen snapshots", () => {
    const core = new TabsCore("overview")
    const snapshot = core.getSnapshot() as { value: string | null }

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(() => {
      snapshot.value = "mutated"
    }).toThrow(TypeError)
    expect(core.getSnapshot().value).toBe("overview")
  })

  it("ignores external snapshot mutation attempts for future updates", () => {
    const core = new TabsCore("overview")
    const states: Array<string | null> = []
    const subscription = core.subscribe((state) => states.push(state.value))
    const snapshot = core.getSnapshot() as { value: string | null }

    try {
      snapshot.value = "mutated"
    } catch {
      // expected in strict mode
    }

    core.select("settings")
    subscription.unsubscribe()
    expect(states).toEqual(["overview", "settings"])
  })
})
