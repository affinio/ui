# @affino/treeview-vue

Vue composable wrappers for `@affino/treeview-core`.

## Scripts

```bash
pnpm --filter @affino/treeview-vue build
pnpm --filter @affino/treeview-vue test
```

## Search

`useTreeviewController()` and `useVirtualTreeviewController()` expose `setSearchQuery(query)`, `clearSearchQuery()`, and `getSearchMatchCount()` from `@affino/treeview-core`. Virtual rows include `matched` metadata for direct search hits.
