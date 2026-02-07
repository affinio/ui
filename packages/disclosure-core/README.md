# @affino/disclosure-core

Headless disclosure/collapsible primitive with deterministic boolean state.

## Installation

```bash
pnpm add @affino/disclosure-core
```

## Quick start

```ts
import { DisclosureCore } from "@affino/disclosure-core"

const disclosure = new DisclosureCore(false)

disclosure.open()
disclosure.close()
disclosure.toggle()

const snapshot = disclosure.getSnapshot()
const isOpen = disclosure.isOpen()
```

## API

- `new DisclosureCore(defaultOpen?)`
- `open()`
- `close()`
- `toggle()`
- `isOpen()`
- `getSnapshot()`
- `subscribe(listener)`
- `destroy()`

## Behavioral guarantees

- Duplicate `open()`/`close()` operations are no-ops.
- Subscriber callbacks run only on meaningful state changes.
- `getSnapshot()` returns frozen immutable objects (runtime-enforced).
- Snapshot reference stays stable between no-op operations.

## Adapter guidance

- Keep one disclosure source of truth in adapter state.
- Treat snapshots as immutable outputs.
- Bind UI triggers directly to `open`/`close`/`toggle`.
