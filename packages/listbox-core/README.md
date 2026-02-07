# @affino/listbox-core

Headless listbox state machine built on top of the linear selection primitives provided by `@affino/selection-core`.

## Features

- Maintains focus (active option) alongside linear selection ranges
- Skips disabled options when navigating with the keyboard
- Supports single toggle, range extension, select-all, and clear intents
- Framework agnostic: feed its snapshots into Vue, React, or vanilla renderers

## Usage

```ts
import {
  createListboxState,
  moveListboxFocus,
  activateListboxIndex,
} from "@affino/listbox-core"

const context = {
  optionCount: options.length,
  isDisabled: (index: number) => options[index]?.disabled ?? false,
}

let state = createListboxState()
state = activateListboxIndex({ state, context, index: 0 })
state = moveListboxFocus({ state, context, delta: 1, extend: true })
```

## Adapter contract

`listbox-core` is intentionally DOM-agnostic. Adapters are responsible for mapping UI events to pure operations.

Required context invariants:

- `context.optionCount` must match the rendered option collection length.
- `context.isDisabled(index)` must be stable for the same render tick.
- `context.optionCount` and `isDisabled` must describe the same option ordering used by the DOM.

State ownership rules:

- Keep a single source of truth for `ListboxState` in the adapter.
- Treat returned `ListboxState` as immutable snapshots; always replace, never mutate.
- Recompute `context` from current rendered options before each operation.

Operation mapping (recommended):

- `ArrowDown` -> `moveListboxFocus({ delta: 1 })`
- `ArrowUp` -> `moveListboxFocus({ delta: -1 })`
- `Home` -> `activateListboxIndex({ index: 0 })`
- `End` -> `activateListboxIndex({ index: optionCount - 1 })`
- `Shift + Arrow*` -> `moveListboxFocus({ extend: true, ... })`
- `Space` on active option -> `toggleActiveListboxOption({ state })`
- pointer click on option `i` -> `activateListboxIndex({ index: i, toggle: isMultiSelect })`
- clear action -> `clearListboxSelection({ preserveActiveIndex: true, state })`
- select all action -> `selectAllListboxOptions({ context })`

Behavioral guarantees adapters can rely on:

- Disabled options are skipped during focus navigation.
- Selecting a disabled option index only updates `activeIndex` (selection is unchanged).
- Invalid counts (`NaN`, `Infinity`, `<= 0`) are treated as empty context.
- `isDisabled` exceptions are swallowed and treated as "enabled".

Common wrapper mistakes to avoid:

- Building `context` from global document queries instead of surface-scoped options.
- Mutating `state.selection` ranges in-place.
- Applying both core operation and additional ad-hoc selection mutation in the same event handler.

See `packages/selection-vue` for a concrete adapter integration pattern.
