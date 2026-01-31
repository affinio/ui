# @affino/aria-utils

Opinionated helpers for wiring ARIA attributes on overlay surfaces.

```ts
import { ensureDialogAria } from "@affino/aria-utils"

ensureDialogAria({
  surface: dialogEl,
  labelId: "settings-title",
  fallbackLabel: "Settings dialog",
  warn: import.meta.env.DEV,
})
```

- Ensures `role="dialog"`/`aria-modal="true"`.
- Applies `aria-labelledby` (or `aria-label` fallback).
- Finds descriptions via `[data-dialog-description]` or `.dialog-description` and wires `aria-describedby`.
- Emits a dev warning when no description is available.

You can customize selectors, id prefixes, and even provide your own `console` implementation.
