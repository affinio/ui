# @affino/treeview-vue

Vue composable wrappers for `@affino/treeview-core`.

The virtual adapter assumes a fixed row height and a fixed-height viewport. It keeps the visible window bounded and refreshes from core subscriptions; consumers remain responsible for rendering tree semantics and ARIA attributes.

## Scripts

```bash
pnpm --filter @affino/treeview-vue build
pnpm --filter @affino/treeview-vue test
```

## Search

`useTreeviewController()` and `useVirtualTreeviewController()` expose `setSearchQuery(query)`, `clearSearchQuery()`, and `getSearchMatchCount()` from `@affino/treeview-core`. Virtual rows include `matched` metadata for direct search hits.

`rowHeight` is measured in CSS pixels and must be positive. `overscan` is a row count. Controllers preserve single selection by default and forward opt-in `selectionMode: "multiple"`, including modifier selection, range extension, anchor/focused values, drag/drop intent events, and clipboard intents. They do not render DOM or mutate application data.

In multiple mode, pass click modifiers to `requestSelect(value, modifiers)` and call `requestFocusNext({ extendSelection: true })` / `requestFocusPrevious({ extendSelection: true })` from Shift+Arrow handlers. Ranges use enabled currently visible nodes; collapsed descendants are excluded and disabled nodes are skipped. Keyboard listener ownership stays with the renderer, which can avoid intercepting shortcuts from editable descendants.

Subscribe to `subscribeInteractions()` for drag/drop and clipboard intents. The consumer computes drop position from rendered geometry, validates the intent, and applies/persists domain changes; `requestResolveDrop(accepted)` reports the result through the interaction subscription. Clipboard intent methods do not access the browser clipboard.

## Core result parity

The Vue controllers preserve the core result contracts. Patch registration can be used without reaching into the underlying core:

```ts
const registration = controller.registerNodes(nodes, { mode: "patch" })
if (registration.changed) {
  // Recompute only the projections affected by this registration.
}

const focus = controller.requestFocus(value)
if (!focus.ok) {
  // Handle missing, disabled, or boundary intents explicitly.
}
```

`registerNodes()` returns `{ changed, topologyChanged }`. The `request*` methods return the same `TreeviewActionResult` as `@affino/treeview-core`; legacy imperative methods remain available for compatibility. The virtual controller refreshes its visible window after these operations while returning the original result.

Both controllers expose `removeNodes(ids)` (including subtree deletion) and `batch(callback)`. Batches publish one final state notification, including when a nested callback throws; applied changes are not rolled back. Virtual row state updates synchronously after core notifications. Scroll-driven updates remain coalesced through animation frames.
