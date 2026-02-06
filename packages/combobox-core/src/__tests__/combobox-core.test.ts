import { describe, expect, it } from "vitest"

import {
  clearComboboxSelection,
  cloneListboxState,
  createComboboxState,
  getSelectedIndexCount,
  getSelectedIndexes,
  isIndexSelected,
  mapSelectedIndexes,
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
})
