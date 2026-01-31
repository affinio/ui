import { describe, expect, it } from "vitest"
import { effectScope, type ShallowRef } from "vue"
import type { HeadlessSelectionState } from "@affino/grid-selection-core"
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
})
