# @affino/focus-utils

Framework-agnostic focus helpers – the same ones we use inside Affino dialogs, menus, and tooltips.

```ts
import {
  FOCUSABLE_SELECTOR,
  getFocusableElements,
  trapFocus,
  focusEdge,
  hasFocusSentinels,
} from "@affino/focus-utils"

const nodes = getFocusableElements(dialogEl)

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Tab" && !hasFocusSentinels(dialogEl)) {
    trapFocus(event, dialogEl)
  }
}
```

- `getFocusableElements()` filters tabbables that are actually visible.
- `trapFocus()` loops focus manually when you can’t rely on sentinels.
- `focusEdge()` jumps to the first/last focusable – wire it to invisible sentinel buttons.
- `hasFocusSentinels()` is a convenience predicate so you can short-circuit `trapFocus`.

All helpers no-op when `window`/`document` are missing, so you can import them in SSR environments.
