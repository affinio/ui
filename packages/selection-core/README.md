# @affino/selection-core

A framework-agnostic core for deterministic grid and range selection logic.

> Powered by deterministic range math shared across our Vue/React demos.

## Features

- Grid-aware range creation and normalization
- Immutable selection operations (focus, extend, toggle, clear)
- Pure selection store to observe changes without framework bindings
- Zero DOM dependencies so adapters stay thin

## Non-goals

- No DOM manipulation
- No event handling
- No rendering concerns
- No framework bindings

## Mental model

1. A selection is expressed as ranges + anchor + focus.
2. Operations consume intent and emit new `HeadlessSelectionState` snapshots.
3. Framework adapters translate user input into those operations.

## Usage

```ts
import { createGridSelectionRange, selectSingleCell } from "@affino/selection-core"
import { createSelectionStore } from "@affino/selection-core/store"

const context = { grid: { rowCount: 100, colCount: 26 } }
const store = createSelectionStore()

const result = selectSingleCell({
  point: { rowIndex: 2, colIndex: 4 },
  context,
})

store.applyResult(result)
```

See the `/demo-vue` selection page `https://www.affino.dev` for an interactive example of clicking,
shift-extending, meta toggling, and drag selection powered by `@affino/selection-core`.

Adapters for Vue/React live alongside the demo code and translate pointer/keyboard
input into pure selection operations.
