import { describe, expect, it } from "vitest"
import { MenuStateMachine } from "../core/StateMachine"

describe("MenuStateMachine", () => {
  const createMachine = (overrides: { loopFocus?: boolean; closeOnSelect?: boolean } = {}) =>
    new MenuStateMachine({
      loopFocus: overrides.loopFocus ?? true,
      closeOnSelect: overrides.closeOnSelect ?? true,
    })

  it("opens and closes while reporting state changes", () => {
    const machine = createMachine()

    const opened = machine.open()
    expect(opened.changed).toBe(true)
    expect(machine.snapshot.open).toBe(true)

    const closed = machine.close()
    expect(closed.changed).toBe(true)
    expect(machine.snapshot.open).toBe(false)
  })

  it("ignores highlight requests for unknown ids", () => {
    const machine = createMachine()
    machine.open()

    const change = machine.highlight("missing", ["alpha", "bravo"])
    expect(change.changed).toBe(false)
    expect(machine.snapshot.activeItemId).toBeNull()
  })

  it("moves focus with looping when enabled", () => {
    const machine = createMachine({ loopFocus: true })
    machine.open()
    machine.ensureInitialHighlight(["alpha", "bravo", "charlie"])

    const wrap = machine.moveFocus(1, ["alpha", "bravo", "charlie"])
    expect(wrap.changed).toBe(true)
    expect(machine.snapshot.activeItemId).toBe("bravo")

    machine.moveFocus(1, ["alpha", "bravo", "charlie"])
    const looped = machine.moveFocus(1, ["alpha", "bravo", "charlie"])
    expect(looped.changed).toBe(true)
    expect(machine.snapshot.activeItemId).toBe("alpha")
  })

  it("stops at the edges when looping is disabled", () => {
    const machine = createMachine({ loopFocus: false })
    machine.open()
    machine.ensureInitialHighlight(["alpha", "bravo"])

    machine.moveFocus(1, ["alpha", "bravo"])
    const result = machine.moveFocus(1, ["alpha", "bravo"])
    expect(result.changed).toBe(false)
    expect(machine.snapshot.activeItemId).toBe("bravo")
  })

  it("defers initial highlight when no enabled items exist", () => {
    const machine = createMachine()
    machine.open()

    const pending = machine.ensureInitialHighlight([])
    expect(pending.changed).toBe(false)

    const resolved = machine.handleItemsChanged(["alpha"])
    expect(resolved.changed).toBe(true)
    expect(machine.snapshot.activeItemId).toBe("alpha")
  })

  it("clears highlight when active item disappears", () => {
    const machine = createMachine()
    machine.open()
    machine.ensureInitialHighlight(["alpha", "bravo"])
    machine.moveFocus(1, ["alpha", "bravo"])

    const change = machine.handleItemsChanged(["alpha"])
    expect(change.changed).toBe(true)
    expect(machine.snapshot.activeItemId).toBeNull()
  })

  it("respects closeOnSelect option", () => {
    const autoClose = createMachine({ closeOnSelect: true })
    autoClose.open()
    expect(autoClose.handleSelection()).toEqual({ accepted: true, shouldClose: true })

    const persistent = createMachine({ closeOnSelect: false })
    persistent.open()
    expect(persistent.handleSelection()).toEqual({ accepted: true, shouldClose: false })
  })
})
