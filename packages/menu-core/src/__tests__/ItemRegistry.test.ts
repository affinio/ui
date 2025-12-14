import { describe, expect, it } from "vitest"
import { ItemRegistry } from "../core/ItemRegistry"

describe("ItemRegistry", () => {
  it("registers items with deterministic ordering", () => {
    const registry = new ItemRegistry()
    registry.register("alpha", false)
    registry.register("bravo", true)
    registry.register("charlie", false)

    registry.updateDisabled("bravo", false)

    expect(registry.getEnabledItemIds()).toEqual(["alpha", "bravo", "charlie"])
  })

  it("throws when re-registering an id without allowing updates", () => {
    const registry = new ItemRegistry()
    registry.register("alpha", false)

    expect(() => registry.register("alpha", false)).toThrowError(/already registered/i)
  })

  it("updates disabled status when allowUpdate is true", () => {
    const registry = new ItemRegistry()
    registry.register("alpha", false)
    registry.register("alpha", true, true)

    expect(registry.isDisabled("alpha")).toBe(true)
  })

  it("returns enabled items only", () => {
    const registry = new ItemRegistry()
    registry.register("alpha", false)
    registry.register("bravo", true)
    registry.register("charlie", false)

    expect(registry.getEnabledItemIds()).toEqual(["alpha", "charlie"])
  })

  it("unregisters items and reports the action", () => {
    const registry = new ItemRegistry()
    registry.register("alpha", false)
    const removed = registry.unregister("alpha")

    expect(removed).toBe(true)
    expect(registry.getEnabledItemIds()).toEqual([])
  })
})
