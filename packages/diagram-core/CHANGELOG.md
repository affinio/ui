# @affino/diagram-core

## 0.3.0

### Minor Changes

- Added bounded undo history through `createDiagramEngine(scene, { history: { maxEntries } })`.
- Replaced full spatial-index rebuilds after mutations with local invalidation updates and stale-entry removal.
- Hardened immutable snapshots, dependency invalidation, query/snap correctness, and mutation-sequence coverage.
- Improved Node 24 consumer, benchmark, and package validation coverage.

### Migration

- Existing callers keep the default unbounded history behavior. Set `history.maxEntries` explicitly when retained history must be bounded.

