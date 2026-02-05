import { describe, expect, it } from "vitest"
import { effectScope, type ShallowRef } from "vue"
import {
  applySelectionAreas,
  clearSelection,
  extendSelectionToPoint,
  selectSingleCell,
  toggleCellSelection,
  type HeadlessSelectionState,
  type GridSelectionContext,
} from "@affino/grid-selection-core"
import { createGridSelectionStore } from "../store"
import { useGridSelectionStore } from "../useGridSelection"

function createMockState(): HeadlessSelectionState<string> {
  return {
    ranges: [
      {
        anchor: { rowIndex: 0, colIndex: 0, rowId: "row-0" },
        focus: { rowIndex: 1, colIndex: 1, rowId: "row-1" },
        startRow: 0,
        endRow: 1,
        startCol: 0,
        endCol: 1,
        startRowId: "row-0",
        endRowId: "row-1",
      },
    ],
    areas: [{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }],
    activeRangeIndex: 0,
    selectedPoint: { rowIndex: 1, colIndex: 1, rowId: "row-1" },
    anchorPoint: { rowIndex: 0, colIndex: 0, rowId: "row-0" },
    dragAnchorPoint: { rowIndex: 0, colIndex: 0, rowId: "row-0" },
  }
}

describe("createGridSelectionStore", () => {
  it("notifies listeners when result changes", () => {
    const store = createGridSelectionStore<string>()
    const snapshots: HeadlessSelectionState<string>[] = []
    const unsubscribe = store.subscribe((snapshot) => {
      snapshots.push(snapshot)
    })

    store.applyResult(createMockState())
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].activeRangeIndex).toBe(0)

    unsubscribe()
  })

  it("does not leak listeners across repeated subscribe/unsubscribe cycles", () => {
    const store = createGridSelectionStore<string>()
    const unsubs = Array.from({ length: 60 }, (_, index) => {
      const listener = (_snapshot: HeadlessSelectionState<string>) => index
      return store.subscribe(listener)
    })

    unsubs.forEach((unsubscribe) => unsubscribe())
    // idempotent unsubscribe should remain safe
    unsubs.forEach((unsubscribe) => unsubscribe())

    store.applyResult(createMockState())
    expect(store.peekState().activeRangeIndex).toBe(0)
  })

  it("handles high-frequency snapshot churn without losing state consistency", () => {
    const store = createGridSelectionStore<string>()

    for (let index = 0; index < 500; index += 1) {
      const row = index % 12
      store.applyResult({
        ...createMockState(),
        activeRangeIndex: index % 3,
        selectedPoint: { rowIndex: row, colIndex: row % 4, rowId: `row-${row}` },
      })
    }

    const snapshot = store.peekState()
    expect(snapshot.activeRangeIndex).toBe(1)
    expect(snapshot.selectedPoint?.rowIndex).toBe(7)
    expect(snapshot.selectedPoint?.colIndex).toBe(3)
  })
})

describe("useGridSelectionStore", () => {
  it("streams store updates into a Vue ref and detaches with the scope", () => {
    const store = createGridSelectionStore<string>()
    const mockState = createMockState()

    let selection!: ShallowRef<HeadlessSelectionState<string>>
    const scope = effectScope()
    scope.run(() => {
      const result = useGridSelectionStore(store)
      selection = result.state
    })

    expect(selection).toBeDefined()

    expect(selection.value.activeRangeIndex).toBe(-1)
    store.applyResult(mockState)
    expect(selection.value).toEqual(mockState)

    scope.stop()
    store.applyResult({ ...mockState, activeRangeIndex: -1 })
    expect(selection.value).toEqual(mockState)
  })

  it("supports explicit stop outside an effect scope", () => {
    const store = createGridSelectionStore<string>()
    const result = useGridSelectionStore(store)
    const state = createMockState()

    store.applyResult(state)
    expect(result.state.value).toEqual(state)

    result.stop()
    store.applyResult({ ...state, activeRangeIndex: -1 })
    expect(result.state.value).toEqual(state)
  })
})

describe("grid-selection-vue integration matrix", () => {
  const context: GridSelectionContext<string> = {
    grid: { rowCount: 8, colCount: 6 },
    getRowIdByIndex: (index) => `row-${index}`,
  }

  it("supports range growth and anchor movement parity with core operations", () => {
    const store = createGridSelectionStore<string>()

    const single = selectSingleCell({ context, point: { rowIndex: 2, colIndex: 3 } })
    store.applyResult(single)
    expect(store.peekState().selectedPoint).toMatchObject({ rowIndex: 2, colIndex: 3 })

    const extended = extendSelectionToPoint({
      state: store.peekState(),
      context,
      activeRangeIndex: 0,
      point: { rowIndex: 6, colIndex: 1 },
    })
    store.applyResult(extended)

    const range = store.peekState().ranges[0]
    expect(range?.startRow).toBe(2)
    expect(range?.endRow).toBe(6)
    expect(range?.startCol).toBe(1)
    expect(range?.endCol).toBe(3)
    expect(store.peekState().anchorPoint).toMatchObject({ rowIndex: 2, colIndex: 3 })
  })

  it("normalizes sparse/overlapping areas from core area application", () => {
    const store = createGridSelectionStore<string>()
    const sparse = applySelectionAreas({
      context,
      areas: [
        { startRow: -4, endRow: -1, startCol: -2, endCol: -1 }, // fully out of bounds => dropped
        { startRow: 1, endRow: 2, startCol: 1, endCol: 2 },
        { startRow: 2, endRow: 4, startCol: 2, endCol: 4 }, // overlaps and should merge in geometry path
        { startRow: 100, endRow: 120, startCol: 0, endCol: 2 }, // clamped to max row
      ],
      activePoint: { rowIndex: 4, colIndex: 3 },
    })
    store.applyResult(sparse)

    expect(store.peekState().ranges.length).toBeGreaterThan(0)
    expect(store.peekState().areas.length).toBeGreaterThan(0)
    expect(store.peekState().selectedPoint).toMatchObject({ rowIndex: 4, colIndex: 3 })
  })

  it("toggles selection and clears cleanly on edge coordinates", () => {
    const store = createGridSelectionStore<string>()
    store.applyResult(selectSingleCell({ context, point: { rowIndex: 0, colIndex: 0 } }))

    const toggled = toggleCellSelection({
      state: store.peekState(),
      context,
      point: { rowIndex: 0, colIndex: 0 },
    })
    store.applyResult(toggled)
    expect(store.peekState().ranges.length).toBeGreaterThanOrEqual(1)

    store.applyResult(clearSelection({ context }))
    expect(store.peekState().ranges).toHaveLength(0)
    expect(store.peekState().activeRangeIndex).toBe(-1)
  })
})
