# Changelog

## 0.5.2

### Patch Changes

- Fixed repeated toggling of search-projected nodes by honoring temporary collapse overrides.

## 0.5.1

### Patch Changes

- Fixed repeated toggling of matched branches during search and preserved persisted descendant expansion at every depth.

## 0.5.0

### Minor Changes

- Search now shows descendants of matching nodes when those nodes are expanded, with expand/collapse overrides kept temporary for the active query.
- Changing the query resets temporary expansion overrides; clearing search restores the persistent expansion state.

## 0.4.0

### Minor Changes

- Added subtree deletion by stable IDs and nested notification batching.
- Removing a selected or active node falls back to its nearest surviving ancestor.

## 0.3.0

### Minor Changes

- `registerNodes(nodes, options?)` now returns `{ changed, topologyChanged }` for deterministic adapter invalidation.
- Preserved replace semantics while exposing patch-mode results to consumers.
- Continued the Node 24 ESM, topology, search, virtual-window, and performance reliability hardening.

## 0.2.0

- Added first-class search projection with `setSearchQuery`, `clearSearchQuery`, and `getSearchMatchCount`.
- Added node text indexing through `TreeviewNode.text` and `TreeviewOptions.textAccessor`.
- Added matched-node metadata via `TreeviewNodeMeta.matched`.
- Improved large-tree patch registration and benchmark coverage for search and topology updates.

## 0.1.1

- Improved core projection performance for patch registration and visible-window reads.

## 0.1.0

- Initial release of `@affino/treeview-core`.
