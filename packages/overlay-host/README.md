# @affino/overlay-host

Tiny helpers for creating a shared overlay portal host, toggling scroll lock, and wiring a single global `keydown` listener.

```ts
import {
  ensureOverlayHost,
  createScrollLockController,
  createGlobalKeydownManager,
} from "@affino/overlay-host"

ensureOverlayHost()

const scrollLock = createScrollLockController()
const keydown = createGlobalKeydownManager((event) => {
  if (event.key === "Escape") {
    // close the active surface
  }
})

scrollLock.lock()
keydown.activate()
```

- `ensureOverlayHost()` – creates (or returns) a `<div>` that you can use as a Teleport/Portal root.
- `createScrollLockController()` – body-level scroll lock that survives mobile Safari keyboard shenanigans.
- `createGlobalKeydownManager()` – reference-count-free helper for attaching/detaching one handler.

Each helper runs no-ops when `document`/`window` are unavailable, so you can safely import them in SSR contexts.
