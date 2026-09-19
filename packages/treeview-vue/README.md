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

`rowHeight` is measured in CSS pixels and must be positive. `overscan` is a row count. The controller exposes single selection/active-node semantics inherited from the core.

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
