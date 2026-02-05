# @affino/vue-adapter

Production integration runtime for Affino Vue adapters. This package provides one explicit app-level entry point and a Vue plugin wrapper.

## Installation

```bash
pnpm add @affino/vue-adapter
```

## Bootstrap contract

```ts
import { bootstrapAffinoVueAdapters } from "@affino/vue-adapter"

const runtime = bootstrapAffinoVueAdapters({
  diagnostics: import.meta.env.DEV,
})
```

- `bootstrapAffinoVueAdapters` is the preferred public API for host apps.
- `createAffinoVuePlugin` is provided for plugin-style Vue integration.
- `createAffinoVueAdapter` remains available for advanced/manual runtime wiring.

### Scope Note

`@affino/vue-adapter` is intentionally an overlay runtime facade (overlay host + stack manager integration).
Non-overlay primitives such as `tabs` and `disclosure` are consumed directly via their Vue packages (`@affino/tabs-vue`, `@affino/disclosure-vue`) and do not require adapter bootstrap wiring.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `bootstrapOnce` | `true` | Reuse a single runtime per `Document` (idempotent bootstrap). |
| `document` | global `document` | Target document. Useful for tests/embedded contexts. |
| `hostTargets` | internal defaults | Overlay host elements to ensure before manager usage. |
| `exposeManagerOnWindow` | `false` | Exposes manager at `windowDebugKey` for dev debugging. |
| `windowDebugKey` | `__AFFINO_OVERLAY_MANAGER__` | Global key for manager exposure. |
| `diagnostics` | `false` | Enables readonly diagnostics snapshot exposure. |
| `diagnosticsWindowKey` | `__affinoVueDiagnostics` | Global key for diagnostics snapshot. |

## Diagnostics

When diagnostics are enabled, snapshot data is exposed as readonly runtime state:

```ts
const diagnostics = (window as any).__affinoVueDiagnostics
console.table(diagnostics?.snapshot)
```

Snapshot fields:
- `hasManager`
- `stackSize`
- `stackUpdates`
- `activeSubscriptions`
- `hostStatus`

## Vue plugin usage

```ts
import { createApp } from "vue"
import { createAffinoVuePlugin } from "@affino/vue-adapter"

createApp(App).use(createAffinoVuePlugin({ diagnostics: import.meta.env.DEV })).mount("#app")
```
