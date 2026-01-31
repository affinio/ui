# @affino/selection-vue

Headless Vue 3 bindings for the linear selection primitives that ship with `@affino/selection-core` plus the
listbox state machine from `@affino/listbox-core`.

## Features

- Immutable linear selection store + `useLinearSelectionStore()` composable
- Listbox store with activation, range extension, toggle, select-all helpers + `useListboxStore()`
- Each store ships snapshots only, so Vue components stay serializable and easy to debug

## Usage (Linear)

```ts
import {
  clearLinearSelection,
  extendLinearSelectionToIndex,
  selectLinearIndex,
  toggleLinearIndex,
} from "@affino/selection-core"
import {
  createLinearSelectionStore,
  useLinearSelectionStore,
} from "@affino/selection-vue"

const store = createLinearSelectionStore()
const { state } = useLinearSelectionStore(store)

function handleClick(index: number, event: MouseEvent) {
  const snapshot = store.peekState()
  if (event.shiftKey && snapshot.ranges.length) {
    store.applyResult(extendLinearSelectionToIndex({ state: snapshot, index }))
  } else if (event.metaKey || event.ctrlKey) {
    store.applyResult(toggleLinearIndex({ state: snapshot, index }))
  } else {
    store.applyResult(selectLinearIndex({ index }))
  }
}

function clearAll() {
  store.applyResult(clearLinearSelection())
}
```

## Usage (Listbox)

```ts
import { createListboxStore, useListboxStore } from "@affino/selection-vue"

const context = {
  optionCount: options.length,
  isDisabled: (index: number) => options[index]?.disabled ?? false,
}

const listboxStore = createListboxStore({ context })
const { state } = useListboxStore(listboxStore)

function handleArrow(delta: number, extend: boolean) {
  listboxStore.move(delta, { extend })
}

function handleClick(index: number, event: MouseEvent) {
  listboxStore.activate(index, { extend: event.shiftKey, toggle: event.metaKey || event.ctrlKey })
}

function selectEverything() {
  listboxStore.selectAll()
}
```

## API

- `createLinearSelectionStore(options?)`
- `useLinearSelectionStore(store)`
- `createListboxStore({ context, initialState? })`
- `useListboxStore(store)`

Every store exposes `getState()`, `peekState()`, `setState()`, `applyResult()`, `subscribe()`, `dispose()`, plus listbox helpers for
`activate()`, `move()`, `toggleActiveOption()`, `clearSelection()`, and `selectAll()`.
