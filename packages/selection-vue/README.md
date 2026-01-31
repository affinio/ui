# @affino/selection-vue

Headless Vue 3 bindings for the linear selection primitives that ship with `@affino/selection-core`.

## Features

- Tiny store wrapper with immutable snapshots
- `useLinearSelectionStore()` composable for auto-cleanup inside components
- Works with the range helpers exported by `@affino/selection-core`

## Usage

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

## API

- `createLinearSelectionStore(options?)`
- `useLinearSelectionStore(store)`

Each store exposes `getState()`, `peekState()`, `setState()`, `applyResult()`, `subscribe()`, and `dispose()`.
