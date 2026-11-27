# @affino/select-vue

Accessible, compact, single-value Select for Vue 3. The adapter composes navigation from `@affino/listbox-core` and popup positioning, outside dismissal, Escape handling, and overlay stacking from `@affino/popover-vue`.

```sh
pnpm add @affino/select-vue
```

```vue
<script setup lang="ts">
import { ref } from "vue"
import { AffinoSelect } from "@affino/select-vue"
import type { SelectOption } from "@affino/select-vue"

type PaperSize = "A0" | "A1" | "A2" | "A3" | "A4"
const paperSize = ref<PaperSize>("A3")
const paperSizes: SelectOption<PaperSize>[] = [
  { value: "A0", label: "A0" }, { value: "A1", label: "A1" },
  { value: "A2", label: "A2" }, { value: "A3", label: "A3" },
  { value: "A4", label: "A4" },
]
</script>

<template>
  <AffinoSelect v-model="paperSize" :options="paperSizes" aria-label="Paper size" size="compact" />
</template>
```

`modelValue` accepts an option value or `null`; null displays the placeholder. An unknown external value is preserved and displays the placeholder until the application supplies a matching option; the component does not silently select a fallback. An empty option list shows the placeholder and cannot commit a value. Duplicate values are supported but the first match is displayed. No runtime warning is issued for duplicates because existing Affino packages do not use a duplicate-value warning convention; consumers should provide unique values. Disabled options cannot be navigated to or selected, including a disabled selected value. Option changes and external model updates never emit updates. A model update is emitted once, only when the user commits a different enabled option with pointer click, Enter, or Space.

The trigger has `role="combobox"`, retains DOM focus, and exposes the active popup option through `aria-activedescendant`. Give it an accessible name using `aria-label` or `aria-labelledby`. Arrow keys move among enabled options; Home/End move to the first/last enabled option; Enter/Space opens and commits; Escape closes without changing the value; Tab leaves the control; printable characters perform prefix typeahead. Focus remains on the trigger while navigating and returns there after committing.

## API

| Prop | Type | Default | Behavior |
| --- | --- | --- | --- |
| `modelValue` | `T \| null` | `undefined` | Selected value; `null` is empty. |
| `options` | `SelectOption<T>[]` | required | Values are compared without coercion. |
| `disabled` | `boolean` | `false` | Prevents opening and selection. |
| `placeholder` | `string` | `Select an option` | Shown when the selected value has no matching option. |
| `aria-label` | `string` | — | Accessible name. Use `aria-labelledby` when a visible label exists. |
| `size` | `default \| compact` | `default` | Compact Inspector sizing. |
| `open` | `boolean` | uncontrolled | Optional controlled popup state; pair with `v-model:open`. |

The component emits `update:modelValue` only when the user commits a value different from the current model, and emits `update:open` when popup visibility changes. It does not mutate model state internally.

`size="compact"` selects compact sizing. CSS parts are `.affino-select__trigger`, `.affino-select__value`, `.affino-select__popup`, and `.affino-select__option`. Override `--affino-select-border`, `--affino-select-background`, `--affino-select-foreground`, `--affino-select-focus`, `--affino-select-placeholder`, and `--affino-select-active`. Import `@affino/select-vue/styles.css` in the application entry. The popup is teleported to Affino's shared popover host, positioned against the trigger, collision-aware, and independently scrollable.
