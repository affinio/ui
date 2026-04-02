import { effectScope } from "vue"
import { describe, expect, it } from "vitest"
import { createComboboxStore } from "../store"
import { useComboboxStore } from "../useComboboxStore"

function createContext(optionCount = 5) {
  return {
    optionCount,
    mode: "single" as const,
    loop: true,
    disabled: false,
    isDisabled: () => false,
  }
}

describe("createComboboxStore", () => {
  it("tracks open/filter state and listbox navigation", () => {
    const store = createComboboxStore({
      context: createContext(),
    })

    store.setOpen(true)
    store.setFilter("alp")
    store.activate(1)
    store.move(1)

    const snapshot = store.getState()
    expect(snapshot.open).toBe(true)
    expect(snapshot.filter).toBe("alp")
    expect(snapshot.listbox.activeIndex).toBe(2)
  })

  it("keeps open state while clearing filter and selection", () => {
    const store = createComboboxStore({
      context: createContext(),
    })

    store.setOpen(true)
    store.setFilter("search")
    store.activate(2)

    const cleared = store.clearSelection()

    expect(cleared.open).toBe(true)
    expect(cleared.filter).toBe("")
    expect(cleared.listbox.activeIndex).toBe(-1)
    expect(cleared.listbox.selection.ranges).toEqual([])
  })

  it("respects updated context values", () => {
    const store = createComboboxStore({
      context: createContext(3),
    })

    store.activate(2)
    store.setContext({
      optionCount: 3,
      mode: "single",
      loop: false,
      disabled: true,
      isDisabled: () => false,
    })

    const snapshot = store.move(-1)
    expect(snapshot.listbox.activeIndex).toBe(2)
  })
})

describe("useComboboxStore", () => {
  it("keeps the ref in sync until the scope is disposed", () => {
    const store = createComboboxStore({
      context: createContext(),
    })

    const scope = effectScope()
    const binding = scope.run(() => useComboboxStore(store))
    if (!binding) {
      throw new Error("effect scope should return a binding")
    }

    store.setFilter("first")
    expect(binding.state.value.filter).toBe("first")

    scope.stop()
    store.setFilter("second")
    expect(binding.state.value.filter).toBe("first")
  })
})