# @affino/combobox-core

Headless combobox reducer that layers filtering + disclosure state on top of the listbox primitives from `@affino/listbox-core`.

## Highlights

- Pure data structures: no DOM, frameworks, or side effects
- Compatible with single or multiple selection modes
- Delegates navigation + activation to `@affino/listbox-core` for predictable focus management
- Ships tiny helpers for working with selection snapshots in DOM adapters

## Quick start

```ts
import {
  createComboboxState,
  moveComboboxFocus,
  activateComboboxIndex,
  setComboboxOpen,
  setComboboxFilter,
} from "@affino/combobox-core"

const context = {
  mode: "single" as const,
  loop: true,
  disabled: false,
  optionCount: filteredOptions.length,
  isDisabled: (index: number) => filteredOptions[index]?.disabled ?? false,
}

let state = createComboboxState()
state = setComboboxOpen(state, true)
state = setComboboxFilter(state, "a")
state = moveComboboxFocus({ state, context, delta: 1 })
state = activateComboboxIndex({ state, context, index: state.listbox.activeIndex })
```

## Filter lifecycle (recommended)

Treat the adapter as owner of the option projection and keep this order:

1. User types: call `setComboboxFilter(state, value)`.
2. Adapter recomputes `filteredOptions` from the new `state.filter`.
3. Adapter rebuilds `ComboboxContext` from `filteredOptions`.
4. Keyboard/pointer actions call `moveComboboxFocus` / `activateComboboxIndex` with that context.
5. On clear action, call `clearComboboxSelection(state)` and then decide in adapter whether to close (`setComboboxOpen(..., false)`) or keep open.

Contract details:

- `setComboboxFilter` only updates `state.filter` (no implicit open/close, no selection mutation).
- `setComboboxOpen` only updates disclosure state.
- `clearComboboxSelection` resets `filter` + listbox selection/focus and intentionally keeps `open` unchanged.

## Adapter boundaries

`combobox-core` owns:

- filter string state,
- open/closed flag state,
- focus/selection transitions delegated to `listbox-core`,
- single vs multiple mode guardrails (`toggle`/`extend` ignored in single mode).

Adapter owns:

- how options are filtered and rendered,
- DOM indexing and `aria-activedescendant` wiring,
- side effects (scrolling, focus restore, announcements, async fetch, virtualization),
- policy choices (open on input, close on select, keep-open multi-select flow).

Anti-patterns to avoid:

- Passing full dataset counts to `optionCount` while rendering only filtered rows.
- Mutating `state.listbox.selection` directly after calling core operations.
- Encoding close/open side effects inside filter logic instead of explicit `setComboboxOpen` calls.

Use this module inside renderer-specific adapters (Vue, React, DOM, Livewire, etc.) to keep UI code declarative and focused on attributes + events.
