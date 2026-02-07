# @affino/selection-core

Headless linear selection primitives (1D ranges) that power select, listbox, command menu, and tree adapters.

> Looking for the grid engine? Use [`@affino/grid-selection-core`](../grid-selection-core/README.md). This package now exports that API for backward compatibility while focusing on the new `linear` module.
>
> Need Vue bindings or a listbox state machine? Use [`@affino/selection-vue`](../selection-vue/README.md) on top of
> [`@affino/listbox-core`](../listbox-core/README.md).

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
  selectLinearIndex,
  extendLinearSelectionToIndex,
  toggleLinearIndex,
} from "@affino/selection-core"

let state = selectLinearIndex({ index: 2 })
state = extendLinearSelectionToIndex({ state, index: 6 })
state = toggleLinearIndex({ state, index: 4 })
```

## Package boundaries

- `@affino/selection-core`: 1D linear selection only.
- `@affino/grid-selection-core`: 2D row/column selection (tables, spreadsheets, tree grids).
- `@affino/selection-core` re-exports `@affino/grid-selection-core` for compatibility during migration.

## Migration guide

### Path A: staying on compatibility imports (zero-risk)

If you currently import grid helpers from `@affino/selection-core`, code keeps working.

```ts
// still supported
import { selectSingleCell } from "@affino/selection-core"
```

### Path B: recommended target (explicit package ownership)

Move grid imports to `@affino/grid-selection-core` and keep linear imports in `@affino/selection-core`.

```ts
// recommended split
import { selectSingleCell } from "@affino/grid-selection-core"
import { selectLinearIndex } from "@affino/selection-core"
```

### Path C: replace ad-hoc range mutation with intent operations

Prefer operation helpers over manual `ranges` editing:

- single click -> `selectLinearIndex`
- shift extend -> `extendLinearSelectionToIndex`
- cmd/ctrl toggle -> `toggleLinearIndex`
- clear action -> `clearLinearSelection`

Use `resolveLinearSelectionUpdate` only when hydrating external snapshots.

## Guardrails

- Treat returned states as immutable snapshots and replace the full value in stores.
- Do not rely on invalid inputs being auto-corrected; pass finite integer indexes.
- `resolveLinearSelectionUpdate` throws if `activeRangeIndex` is out of bounds.
- Use one canonical source of truth for selection state in the adapter.

See `/demo-vue` for integration patterns and use `@affino/grid-selection-core` directly for grid/table flows.
