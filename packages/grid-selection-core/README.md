# @affino/grid-selection-core

Headless grid selection engine that powers spreadsheets, tables, and tree views.

- Multi-range selection with anchor/focus model
- Deterministic merge/toggle/extend helpers
- Immutable state snapshots for easy rendering
- Zero DOM dependencies, works in any framework

> Built on top of the affine selection primitives shared across Affino demos. Use this package when you need row/column math. For 1D lists or listboxes, reach for `@affino/selection-core`.

## Quick start

```ts
import { selectSingleCell, extendSelectionToPoint } from "@affino/grid-selection-core"

const context = {
  grid: { rowCount: rows.length, colCount: columns.length },
}

let state = selectSingleCell({ point: { rowIndex: 0, colIndex: 0 }, context })
state = extendSelectionToPoint({
  state,
  activeRangeIndex: state.activeRangeIndex,
  point: { rowIndex: 3, colIndex: 2 },
  context,
})
```

## Table facade patterns

The package is intentionally low-level. For table UIs, use a tiny adapter facade with explicit handlers.

```ts
import {
  applySelectionAreas,
  clearSelection,
  extendSelectionToPoint,
  selectSingleCell,
  toggleCellSelection,
  type GridSelectionContext,
  type HeadlessSelectionState,
} from "@affino/grid-selection-core"

type CellPoint = { rowIndex: number; colIndex: number }

export function createTableSelectionFacade(
  context: GridSelectionContext,
  getState: () => HeadlessSelectionState,
  setState: (next: HeadlessSelectionState) => void,
) {
  function selectCell(point: CellPoint) {
    setState(selectSingleCell({ point, context }))
  }

  function extendTo(point: CellPoint) {
    const state = getState()
    if (state.activeRangeIndex < 0 || !state.ranges.length) {
      setState(selectSingleCell({ point, context }))
      return
    }
    setState(extendSelectionToPoint({ state, activeRangeIndex: state.activeRangeIndex, point, context }))
  }

  function toggleCell(point: CellPoint) {
    setState(toggleCellSelection({ state: getState(), point, context }))
  }

  function selectRow(rowIndex: number) {
    const colCount = context.grid.colCount
    if (colCount <= 0) {
      setState(clearSelection({ context }))
      return
    }
    setState(applySelectionAreas({
      areas: [{ startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: colCount - 1 }],
      context,
      state: getState(),
      activePoint: { rowIndex, colIndex: 0 },
    }))
  }

  function clear() {
    setState(clearSelection({ context }))
  }

  return { selectCell, extendTo, toggleCell, selectRow, clear }
}
```

Keyboard/mouse mapping (recommended):

- plain click -> `selectCell`
- `Shift + click` -> `extendTo`
- `Cmd/Ctrl + click` -> `toggleCell`
- row checkbox click -> `selectRow`
- escape/clear action -> `clear`

## Guardrails

- Keep one canonical `HeadlessSelectionState` in adapter state.
- Treat returned state as immutable snapshots; replace whole state value.
- Pass `context.grid` values that match the currently rendered table projection.
- Use operation helpers instead of mutating `ranges` / `areas` manually.
