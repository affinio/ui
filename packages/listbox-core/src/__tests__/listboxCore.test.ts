import { describe, expect, it } from "vitest"
import {
  activateListboxIndex,
  clearListboxSelection,
  createListboxState,
  moveListboxFocus,
  selectAllListboxOptions,
  toggleActiveListboxOption,
  type ListboxContext,
} from ".."

function createContext(optionCount: number, disabled: number[] = []): ListboxContext {
  const disabledSet = new Set(disabled)
  return {
    optionCount,
    isDisabled: (index) => disabledSet.has(index),
  }
}

describe("listbox-core", () => {
  it("activates a specific index", () => {
    const context = createContext(5)
    const base = createListboxState()
    const next = activateListboxIndex({ state: base, context, index: 2 })
    expect(next.activeIndex).toBe(2)
    expect(next.selection.ranges).toEqual([{ start: 2, end: 2 }])
  })

  it("extends selection while moving focus", () => {
    const context = createContext(6)
    let state = createListboxState()
    state = activateListboxIndex({ state, context, index: 1 })
    state = moveListboxFocus({ state, context, delta: 3, extend: true })
    expect(state.activeIndex).toBe(4)
    expect(state.selection.ranges).toEqual([{ start: 1, end: 4 }])
  })

  it("skips disabled options when navigating", () => {
    const context = createContext(5, [2])
    let state = createListboxState()
    state = activateListboxIndex({ state, context, index: 1 })
    state = moveListboxFocus({ state, context, delta: 1 })
    expect(state.activeIndex).toBe(3)
  })

  it("keeps disabled checks bounded for large loop navigation", () => {
    const optionCount = 1_000
    let checks = 0
    const context: ListboxContext = {
      optionCount,
      isDisabled: (index) => {
        checks += 1
        return index !== 0 && index !== 500
      },
    }

    let state = createListboxState()
    state = activateListboxIndex({ state, context, index: 0 })
    state = moveListboxFocus({ state, context, delta: 99, loop: true })

    expect(state.activeIndex).toBe(500)
    expect(checks).toBeLessThan(5_000)
  })

  it("toggles the active option", () => {
    const context = createContext(3)
    let state = createListboxState()
    state = activateListboxIndex({ state, context, index: 0 })
    state = toggleActiveListboxOption({ state })
    expect(state.selection.ranges).toEqual([])
  })

  it("selects all available options", () => {
    const context = createContext(4)
    const state = selectAllListboxOptions({ context })
    expect(state.selection.ranges).toEqual([{ start: 0, end: 3 }])
    expect(state.activeIndex).toBe(3)
  })

  it("clears selection while preserving active index", () => {
    const context = createContext(2)
    let state = activateListboxIndex({ state: createListboxState(), context, index: 1 })
    state = clearListboxSelection({ preserveActiveIndex: true, state })
    expect(state.selection.ranges).toEqual([])
    expect(state.activeIndex).toBe(1)
  })

  it("treats non-finite option counts as empty contexts", () => {
    const infinityContext: ListboxContext = {
      optionCount: Number.POSITIVE_INFINITY,
      isDisabled: () => false,
    }
    const nanContext: ListboxContext = {
      optionCount: Number.NaN,
      isDisabled: () => false,
    }

    const base = createListboxState({ activeIndex: 0 })
    const moved = moveListboxFocus({ state: base, context: infinityContext, delta: 1 })
    const selected = selectAllListboxOptions({ context: nanContext })

    expect(moved).toBe(base)
    expect(selected.selection.ranges).toEqual([])
    expect(selected.activeIndex).toBe(-1)
  })

  it("falls back to enabled behavior when isDisabled throws", () => {
    const context: ListboxContext = {
      optionCount: 3,
      isDisabled: () => {
        throw new Error("isDisabled failure")
      },
    }

    expect(() => activateListboxIndex({ state: createListboxState(), context, index: 1 })).not.toThrow()
    const state = activateListboxIndex({ state: createListboxState(), context, index: 1 })

    expect(state.activeIndex).toBe(1)
    expect(state.selection.ranges).toEqual([{ start: 1, end: 1 }])
  })
})
