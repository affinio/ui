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
