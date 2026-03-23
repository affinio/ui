# @affino/selection-core

Headless selection primitives for Affino UI: linear selection (1D ranges) and grid selection (2D cells/areas).

Need Vue bindings or a listbox state machine? Use [`@affino/selection-vue`](../selection-vue/README.md) on top of
[`@affino/listbox-core`](../listbox-core/README.md).

## Features

- Normalized 1D ranges (`start`, `end`) with anchor/focus semantics
- Grid/cell selection snapshots with range + area normalization
- Immutable merge/toggle/extend helpers
- Deterministic `resolveLinearSelectionUpdate()` snapshots for stores/renderers
- Deterministic `resolveSelectionUpdate()` snapshots for grid renderers/controllers
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

- `@affino/selection-core`: canonical package for 1D linear selection and 2D grid selection.
- `@affino/selection-vue`: Vue bindings and stores on top of the headless primitives.

## Migration guide

### Preferred imports

Import both linear and grid helpers from `@affino/selection-core`.

```ts
import { selectSingleCell } from "@affino/selection-core"
import { selectLinearIndex } from "@affino/selection-core"
```

### Replace ad-hoc range mutation with intent operations

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

See `/demo-vue` for integration patterns.
