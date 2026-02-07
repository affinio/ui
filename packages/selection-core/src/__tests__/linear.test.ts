import { describe, expect, it } from "vitest"
import {
  addLinearRange,
  clearLinearSelection,
  emptyLinearSelectionState,
  extendLinearSelectionToIndex,
  mergeLinearRanges,
  removeLinearRange,
  resolveLinearSelectionUpdate,
  selectLinearIndex,
  selectSingleCell,
  toggleLinearIndex,
  toggleLinearRange,
} from ".."

describe("linear selection ranges", () => {
  it("merges overlapping and contiguous ranges", () => {
    const merged = mergeLinearRanges([
      { start: 5, end: 7 },
      { start: 0, end: 2 },
      { start: 3, end: 4 },
      { start: 7, end: 10 },
    ])

    expect(merged).toEqual([{ start: 0, end: 10 }])
  })

  it("adds and removes ranges immutably", () => {
    const added = addLinearRange([], { start: 2, end: 4 })
    expect(added).toEqual([{ start: 2, end: 4 }])

    const removed = removeLinearRange(added, { start: 3, end: 4 })
    expect(removed).toEqual([{ start: 2, end: 2 }])
  })

  it("handles unsorted input when toggling and removing", () => {
    const toggled = toggleLinearRange(
      [
        { start: 10, end: 12 },
        { start: 0, end: 2 },
      ],
      { start: 3, end: 9 },
    )
    expect(toggled).toEqual([{ start: 0, end: 12 }])

    const removed = removeLinearRange(
      [
        { start: 10, end: 12 },
        { start: 0, end: 4 },
      ],
      { start: 3, end: 10 },
    )
    expect(removed).toEqual([
      { start: 0, end: 2 },
      { start: 11, end: 12 },
    ])
  })

  it("toggles coverage and splits ranges when needed", () => {
    const base = mergeLinearRanges([
      { start: 0, end: 2 },
      { start: 5, end: 6 },
    ])

    const toggledOn = toggleLinearRange(base, { start: 3, end: 4 })
    expect(toggledOn).toEqual([
      { start: 0, end: 6 },
    ])

    const toggledOff = toggleLinearRange(toggledOn, { start: 1, end: 4 })
    expect(toggledOff).toEqual([
      { start: 0, end: 0 },
      { start: 5, end: 6 },
    ])
  })
})

describe("linear selection state", () => {
  it("resolves state with default anchor/focus", () => {
    const state = resolveLinearSelectionUpdate({
      ranges: [{ start: 4, end: 1 }],
      activeRangeIndex: 0,
    })

    expect(state.ranges).toEqual([{ start: 1, end: 4 }])
    expect(state.anchor).toBe(1)
    expect(state.focus).toBe(4)
    expect(state.activeRangeIndex).toBe(0)
  })

  it("clamps provided anchor/focus inside the active range", () => {
    const state = resolveLinearSelectionUpdate({
      ranges: [{ start: 10, end: 20 }],
      activeRangeIndex: 0,
      anchor: 30,
      focus: -5,
    })

    expect(state.anchor).toBe(20)
    expect(state.focus).toBe(10)
  })

  it("normalizes fractional activeRangeIndex values", () => {
    const state = resolveLinearSelectionUpdate({
      ranges: [
        { start: 0, end: 2 },
        { start: 10, end: 20 },
      ],
      activeRangeIndex: 1.9,
    })

    expect(state.activeRangeIndex).toBe(1)
    expect(state.anchor).toBe(10)
    expect(state.focus).toBe(20)
  })

  it("returns an empty snapshot when no ranges are provided", () => {
    const state = resolveLinearSelectionUpdate({ ranges: [], activeRangeIndex: 0 })
    expect(state).toEqual(emptyLinearSelectionState())
  })
})

describe("linear selection operations", () => {
  it("selects a single index and seeds anchor/focus", () => {
    const state = selectLinearIndex({ index: 5 })
    expect(state.ranges).toEqual([{ start: 5, end: 5 }])
    expect(state.anchor).toBe(5)
    expect(state.focus).toBe(5)
  })

  it("extends from the current anchor when shift-selecting", () => {
    const base = selectLinearIndex({ index: 2 })
    const extended = extendLinearSelectionToIndex({ state: base, index: 6 })
    expect(extended.ranges).toEqual([{ start: 2, end: 6 }])
    expect(extended.anchor).toBe(2)
    expect(extended.focus).toBe(6)
  })

  it("extends safely when state carries a fractional active index", () => {
    const extended = extendLinearSelectionToIndex({
      state: {
        ranges: [
          { start: 0, end: 1 },
          { start: 4, end: 5 },
        ],
        activeRangeIndex: 1.2,
        anchor: 4,
        focus: 5,
      },
      index: 8,
    })

    expect(extended.ranges).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 8 },
    ])
    expect(extended.activeRangeIndex).toBe(1)
    expect(extended.anchor).toBe(4)
    expect(extended.focus).toBe(8)
  })

  it("toggles individual indices and clears when empty", () => {
    const selected = selectLinearIndex({ index: 3 })
    const toggledOff = toggleLinearIndex({ state: selected, index: 3 })
    expect(toggledOff).toEqual(emptyLinearSelectionState())

    const multi = toggleLinearIndex({ state: selected, index: 7 })
    expect(multi.ranges).toEqual([
      { start: 3, end: 3 },
      { start: 7, end: 7 },
    ])
  })

  it("clears selection snapshots", () => {
    expect(clearLinearSelection()).toEqual(emptyLinearSelectionState())
  })
})

describe("grid compatibility re-exports", () => {
  it("exposes grid-selection-core operations through selection-core", () => {
    const context = {
      grid: { rowCount: 3, colCount: 3 },
    }

    const state = selectSingleCell({
      point: { rowIndex: 1, colIndex: 2 },
      context,
    })

    expect(state.activeRangeIndex).toBe(0)
    expect(state.ranges).toHaveLength(1)
    expect(state.ranges[0]).toEqual(
      expect.objectContaining({ startRow: 1, endRow: 1, startCol: 2, endCol: 2 }),
    )
  })
})
