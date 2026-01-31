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

See `packages/selection-vue` for a concrete adapter that consumes this package.
