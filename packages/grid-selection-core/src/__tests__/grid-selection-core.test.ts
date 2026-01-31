import { describe, expect, it } from "vitest"
import {
  addRange,
  applySelectionAreas,
  clampGridSelectionPoint,
  clampSelectionArea,
  clearSelection,
  createGridSelectionRange,
  extendSelectionToPoint,
  isCellSelected,
  mergeRanges,
  normalizeGridSelectionRange,
  normalizeSelectionArea,
  removeRange,
  selectSingleCell,
  toggleCellSelection,
  type GridSelectionContext,
  type SelectionArea,
} from ".."

function createContext(rowCount: number, colCount: number): GridSelectionContext<string> {
  return {
    grid: { rowCount, colCount },
    getRowIdByIndex: index => `row-${index}`,
  }
}

describe("grid-selection-core geometry", () => {
  it("normalizes and clamps selection areas", () => {
    const context = createContext(5, 5)
    const area: SelectionArea = { startRow: 4, endRow: 1, startCol: 5, endCol: -2 }
    const normalized = normalizeSelectionArea(area)
    expect(normalized).toEqual({ startRow: 1, endRow: 4, startCol: -2, endCol: 5 })

    const clamped = clampSelectionArea(area, context)
    expect(clamped).toEqual({ startRow: 1, endRow: 4, startCol: 0, endCol: 4 })

    const emptyContext = createContext(0, 0)
    expect(clampSelectionArea(area, emptyContext)).toBeNull()
  })

  it("merges overlapping ranges", () => {
    const merged = mergeRanges([
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 1, endRow: 2, startCol: 1, endCol: 2 },
    ])
    expect(merged).toEqual([
      { startRow: 0, endRow: 2, startCol: 0, endCol: 2 },
    ])
  })

  it("removes overlapping segments from a range", () => {
    const result = removeRange(
      [{ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }],
      { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
    )
    expect(result).toHaveLength(4)
    expect(result).toEqual(
      expect.arrayContaining([
        { startRow: 0, endRow: 0, startCol: 0, endCol: 2 },
        { startRow: 2, endRow: 2, startCol: 0, endCol: 2 },
        { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
        { startRow: 1, endRow: 1, startCol: 2, endCol: 2 },
      ]),
    )
  })
})

describe("grid-selection-core range", () => {
  it("creates ranges from arbitrary anchor/focus within bounds", () => {
    const context = createContext(3, 3)
    const range = createGridSelectionRange(
      { rowIndex: -10, colIndex: 5 },
      { rowIndex: 5, colIndex: -10 },
      context,
    )
    expect(range.startRow).toBe(0)
    expect(range.endRow).toBe(2)
    expect(range.startCol).toBe(0)
    expect(range.endCol).toBe(2)
    expect(range.anchor.rowId).toBe("row-0")
    expect(range.focus.rowId).toBe("row-2")
  })

  it("normalizes ranges to null when grid is empty", () => {
    const context = createContext(0, 0)
    const range = createGridSelectionRange({ rowIndex: 1, colIndex: 1 }, { rowIndex: 2, colIndex: 2 }, createContext(3, 3))
    expect(normalizeGridSelectionRange(range, context)).toBeNull()
  })

  it("clamps grid points with NaN values", () => {
    const context = createContext(2, 2)
    const point = clampGridSelectionPoint({ rowIndex: Number.NaN, colIndex: 5 }, context)
    expect(point).toEqual({ rowIndex: 0, colIndex: 1, rowId: "row-0" })
  })
})

describe("grid-selection-core operations", () => {
  it("detects selected cells", () => {
    const areas = [{ startRow: 1, endRow: 2, startCol: 1, endCol: 2 }]
    expect(isCellSelected(areas, 1, 1)).toBe(true)
    expect(isCellSelected(areas, 0, 0)).toBe(false)
  })

  it("toggles individual cells within a multi-range selection", () => {
    const context = createContext(4, 4)
    const base = applySelectionAreas({
      areas: [
        { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
        { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
      ],
      context,
      activePoint: { rowIndex: 0, colIndex: 0 },
    })

    const toggledOff = toggleCellSelection({ state: base, point: { rowIndex: 1, colIndex: 1 }, context })
    expect(isCellSelected(toggledOff.areas, 1, 1)).toBe(false)
    expect(toggledOff.areas).toHaveLength(1)

    const toggledOn = toggleCellSelection({ state: toggledOff, point: { rowIndex: 1, colIndex: 1 }, context })
    expect(isCellSelected(toggledOn.areas, 1, 1)).toBe(true)
    expect(toggledOn.areas).toHaveLength(2)
  })

  it("extends selection while preserving invariants", () => {
    const context = createContext(10, 10)
    const initial = selectSingleCell({ point: { rowIndex: 2, colIndex: 2 }, context })
    const extended = extendSelectionToPoint({
      state: initial,
      activeRangeIndex: 0,
      point: { rowIndex: 20, colIndex: -5 },
      context,
    })

    const range = extended.ranges[0]
    expect(range.startRow).toBeLessThanOrEqual(range.endRow)
    expect(range.startCol).toBeLessThanOrEqual(range.endCol)
    expect(range.startRow).toBeGreaterThanOrEqual(0)
    expect(range.endRow).toBeLessThanOrEqual(9)
    expect(range.startCol).toBeGreaterThanOrEqual(0)
    expect(range.endCol).toBeLessThanOrEqual(9)
  })

  it("clearSelection resets state", () => {
    const context = createContext(3, 3)
    const state = clearSelection({ context })
    expect(state.ranges).toHaveLength(0)
    expect(state.activeRangeIndex).toBe(-1)
    expect(state.selectedPoint).toBeNull()
  })
})
