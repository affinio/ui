# @affino/listbox-vue

Vue 3 composables for the @affino/listbox-core package, with store helpers from @affino/selection-vue.

## Install

```bash
pnpm add @affino/listbox-vue
```

## Usage

```ts
import { createListboxStore, useListboxStore } from "@affino/listbox-vue"

const store = createListboxStore({
  context: {
    optionCount: 10,
  },
})

const { state } = useListboxStore(store)
```
