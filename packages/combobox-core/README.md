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
  optionCount: options.length,
  isDisabled: (index: number) => options[index]?.disabled ?? false,
}

let state = createComboboxState()
state = setComboboxOpen(state, true)
state = setComboboxFilter(state, "a")
state = moveComboboxFocus({ state, context, delta: 1 })
state = activateComboboxIndex({ state, context, index: state.listbox.activeIndex })
```

Use this module inside renderer-specific adapters (Vue, React, DOM, Livewire, etc.) to keep UI code declarative and focused on attributes + events.
