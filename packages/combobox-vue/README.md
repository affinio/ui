# @affino/combobox-vue

Vue 3 store helpers for the @affino/combobox-core package.

## Install

```bash
pnpm add @affino/combobox-vue
```

## Usage

```ts
import { createComboboxStore, useComboboxStore } from "@affino/combobox-vue"

const store = createComboboxStore({
  context: {
    optionCount: 10,
    mode: "single",
    loop: true,
    disabled: false,
    isDisabled: () => false,
  },
})

const { state } = useComboboxStore(store)
store.setFilter("alpha")
```