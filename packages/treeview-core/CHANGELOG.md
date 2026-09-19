# Changelog

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
