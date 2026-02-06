import { describe, expect, it } from "vitest"

import {
  activateComboboxIndex,
  clearComboboxSelection,
  cloneListboxState,
  createComboboxState,
  getSelectedIndexCount,
  getSelectedIndexes,
  isIndexSelected,
  mapSelectedIndexes,
  moveComboboxFocus,
} from "../index"

describe("combobox core helpers", () => {
  it("clears filter text and selection without touching open state", () => {
    const initial = createComboboxState({
      open: true,
      filter: "ac",
      listbox: {
        activeIndex: 3,
        selection: {
          ranges: [{ start: 1, end: 2 }],
          activeRangeIndex: 0,
          anchor: 1,
          focus: 2,
        },
      },
    })

    const cleared = clearComboboxSelection(initial)

    expect(cleared.open).toBe(true)
    expect(cleared.filter).toBe("")
    expect(cleared.listbox.selection.ranges).toEqual([])
    expect(cleared.listbox.selection.activeRangeIndex).toBe(-1)
  })

  it("clones listbox state to keep references isolated", () => {
    const original = {
      activeIndex: 1,
      selection: {
        ranges: [{ start: 2, end: 3 }],
        activeRangeIndex: 0,
        anchor: 2,
        focus: 3,
      },
    }

    const cloned = cloneListboxState(original)

    expect(cloned).not.toBe(original)
    expect(cloned.selection).not.toBe(original.selection)
    expect(cloned.selection.ranges).not.toBe(original.selection.ranges)
    expect(cloned.selection.ranges).toEqual(original.selection.ranges)
  })

  it("flattens selection ranges into indexes and checks active items", () => {
    const selection = {
      ranges: [
        { start: 0, end: 1 },
        { start: 3, end: 3 },
      ],
      activeRangeIndex: 0,
      anchor: 0,
      focus: 1,
    }

    expect(getSelectedIndexes(selection)).toEqual([0, 1, 3])
    expect(isIndexSelected(selection, 1)).toBe(true)
    expect(isIndexSelected(selection, 2)).toBe(false)
  })

  it("counts and maps selected indexes efficiently", () => {
    const selection = {
      ranges: [
        { start: 4, end: 6 },
        { start: 9, end: 9 },
      ],
      activeRangeIndex: 0,
      anchor: 4,
      focus: 9,
    }

    expect(getSelectedIndexCount(selection)).toBe(4)
    expect(mapSelectedIndexes(selection, (index) => `v:${index}`)).toEqual([
      "v:4",
      "v:5",
      "v:6",
      "v:9",
    ])
  })

  it("ignores focus/activation updates when combobox context is disabled", () => {
    const context = {
      mode: "multiple" as const,
      loop: false,
      disabled: true,
      optionCount: 6,
      isDisabled: () => false,
    }

    const state = createComboboxState()
    const afterActivate = activateComboboxIndex({ state, context, index: 2, toggle: true, extend: true })
    const afterMove = moveComboboxFocus({ state, context, delta: 1, extend: true })

    expect(afterActivate).toBe(state)
    expect(afterMove).toBe(state)
    expect(state.listbox.activeIndex).toBe(-1)
    expect(state.listbox.selection.ranges).toEqual([])
  })

  it("ignores toggle/extend semantics in single mode", () => {
    const context = {
      mode: "single" as const,
      loop: true,
      disabled: false,
      optionCount: 8,
      isDisabled: () => false,
    }

    let state = createComboboxState()
    state = activateComboboxIndex({ state, context, index: 1 })
    state = activateComboboxIndex({ state, context, index: 4, extend: true, toggle: true })

    expect(state.listbox.activeIndex).toBe(4)
    expect(state.listbox.selection.ranges).toEqual([{ start: 4, end: 4 }])

    state = moveComboboxFocus({ state, context, delta: -1, extend: true })
    expect(state.listbox.activeIndex).toBe(3)
    expect(state.listbox.selection.ranges).toEqual([{ start: 3, end: 3 }])
  })

  it("normalizes reversed ranges and skips invalid bounds", () => {
    const selection = {
      ranges: [
        { start: 3, end: 1 },
        { start: Number.NaN, end: 2 },
        { start: 5.9, end: 6.2 },
      ],
      activeRangeIndex: 0,
      anchor: 3,
      focus: 1,
    }

    expect(getSelectedIndexCount(selection)).toBe(5)
    expect(getSelectedIndexes(selection)).toEqual([1, 2, 3, 5, 6])
    expect(mapSelectedIndexes(selection, (index) => index * 2)).toEqual([2, 4, 6, 10, 12])
    expect(isIndexSelected(selection, 2)).toBe(true)
    expect(isIndexSelected(selection, 4)).toBe(false)
    expect(isIndexSelected(selection, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
