# @affino/tabs-core

Headless tabs primitive for single-value selection.

The package is published as native ESM. Relative imports in the generated entrypoints use `.js` specifiers so Node can load `@affino/tabs-core` without experimental resolution flags.

## Installation

```bash
pnpm add @affino/tabs-core
```

## Quick start

```ts
import { TabsCore } from "@affino/tabs-core"

const tabs = new TabsCore<string>("overview")

tabs.select("settings")
tabs.clear()
const snapshot = tabs.getSnapshot()
```

## API

- `new TabsCore(defaultValue?)`
- `select(value)`
- `clear()`
- `getSnapshot()`
- `subscribe(listener)`
- `destroy()`

## Behavioral guarantees

- Selecting the same value is a no-op.
- Clearing when already empty is a no-op.
- Subscribers are notified only on meaningful state changes.
- `getSnapshot()` returns a frozen immutable object (runtime-enforced, not type-only).

## Adapter guidance

- Keep one canonical tabs state source in adapter state.
- Treat snapshots as immutable values.
- Wire framework events (`click`, keyboard shortcuts) to `select` / `clear` only.
