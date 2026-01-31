# @affino/selection-core

Headless linear selection primitives (1D ranges) that power select, listbox, command menu, and tree adapters.

> Looking for the grid engine? Use [`@affino/grid-selection-core`](../grid-selection-core/README.md). This package now exports that API for backward compatibility while focusing on the new `linear` module.
>
> Need Vue bindings for linear selections? Reach for [`@affino/selection-vue`](../selection-vue/README.md).

## Features

- Normalized 1D ranges (`start`, `end`) with anchor/focus semantics
- Immutable merge/toggle/extend helpers
- Deterministic `resolveLinearSelectionUpdate()` snapshots for stores/renderers
- Zero DOM dependencies so adapters stay thin
- Re-exports of `@affino/grid-selection-core` while consumers migrate

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
import {
  addLinearRange,
  resolveLinearSelectionUpdate,
  toggleLinearRange,
} from "@affino/selection-core"

let state = resolveLinearSelectionUpdate({ ranges: [{ start: 2, end: 2 }], activeRangeIndex: 0 })
state = {
  ...state,
  ranges: toggleLinearRange(state.ranges, { start: 5, end: 7 }),
}

const merged = addLinearRange(state.ranges, { start: 3, end: 4 })
```

See `/demo-vue` (listbox WIP) for an interactive example, and use `@affino/grid-selection-core` for existing spreadsheet demos.
