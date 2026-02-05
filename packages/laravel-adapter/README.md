# @affino/laravel-adapter

Production bootstrap runtime for Affino's Laravel (Livewire) adapters. This package wires up every headless component adapter (dialog, menu, popover, tooltip, listbox, combobox, tabs, disclosure) and exposes a single, explicit entry point for frameworks to call.

## Installation

```bash
pnpm add @affino/laravel-adapter
```

## Bootstrap contract

```ts
import { bootstrapAffinoLaravelAdapters } from "@affino/laravel-adapter"

bootstrapAffinoLaravelAdapters({
  registerScrollGuards: true,
  diagnostics: import.meta.env.DEV,
})
```

- `bootstrapAffinoLaravelAdapters` is the **only** supported public API.
- Individual `bootstrapAffinoDialogs()`-style functions remain internal to their respective packages and must not be imported by consumers.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `registerScrollGuards` | `true` | Auto-closes transient overlays (tooltip, popover, combobox, menu) on window scroll unless the surface is pinned/modal/manual. Disable when the host app manages scroll guards. |
| `diagnostics` | `false` | When `true`, exposes a readonly diagnostics snapshot under `window.__affinoLaravelDiagnostics`. Safe to enable only in development builds. |

Diagnostics snapshots include:

- `hydratedCounts`: number of roots with active handles per component.
- `skippedCounts`: number of roots missing a handle per component.
- `manualInvocations`: manual event invocations routed through the shared bridge.

## Manual control protocol

Dispatch custom events when you need imperative control. TypeScript helpers are exported from the package for strict typing. Each event must include an `id`, `action`, and optional `reason`.

| Component | Event name | Actions | Extra fields |
| --- | --- | --- | --- |
| Dialog | `affino-dialog:manual` | `open`, `close`, `toggle` | `options?: CloseRequestOptions` for `close` |
| Tooltip | `affino-tooltip:manual` | `open`, `close`, `toggle` | – |
| Popover | `affino-popover:manual` | `open`, `close`, `toggle` | – |
| Menu | `affino-menu:manual` | `open`, `close`, `toggle` | – |
| Listbox | `affino-listbox:manual` | `open`, `close`, `toggle`, `select` | `index?: number`, `value?: string`, `extend?: boolean`, `toggle?: boolean` |
| Combobox | `affino-combobox:manual` | `open`, `close`, `toggle`, `select`, `clear` | same as listbox, plus `clear` |
| Tabs | `affino-tabs:manual` | `select`, `clear` | `value?: string` (required for `select`) |
| Disclosure | `affino-disclosure:manual` | `open`, `close`, `toggle` | `reason?: string` |

Example manual dialog close:

```ts
document.dispatchEvent(
  new CustomEvent("affino-dialog:manual", {
    detail: { id: "settings-dialog", action: "close", reason: "programmatic" },
  }),
)
```

## Diagnostics access

When diagnostics are enabled, read-only data is available at runtime:

```ts
const diagnostics = (window as any).__affinoLaravelDiagnostics
console.table(diagnostics?.snapshot)
```

No global state is required for correctness; diagnostics simply mirror the current DOM state for local debugging.
