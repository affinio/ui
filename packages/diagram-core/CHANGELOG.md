# @affino/diagram-core

## 0.11.1

### Patch Changes

- Exposed renderer-ready table geometry during active resize previews, including member tables resized through a Core group.

## 0.11.0

### Minor Changes

- Added public groups with stable IDs and child membership, undoable group/ungroup commands, grouped movement and resizing, z-order integration, serialization, and clipboard ID remapping. Nested groups and ports as direct children are rejected by scene validation; deleting a group deletes its members and graph dependencies, while ungrouping preserves member IDs.
- Added first-class text table entities with validated row/column/cell/style commands, cell hit testing, geometry/history/clipboard/serialization integration, and proportional cell-size updates on resize.

## 0.10.2

### Patch Changes

- Shift-constrained endpoint drags now project the vector from the stationary endpoint to the nearest cardinal angle while preserving its length, then retain orthogonal connector routes and cardinal alignment through snapping.

## 0.10.1

### Patch Changes

- Latched the Shift axis for selection and edge endpoint drags after a 4-screen-pixel activation threshold, keeping the axis stable until Shift is released.

## 0.10.0

### Minor Changes

- Added Shift axis locking to edge endpoint drags and aspect-ratio locking to resize gestures, with live modifier updates and constraint-aware snapping.

## 0.9.0

### Minor Changes

- Added Shift axis-lock for selection drags, including previews, commits, and axis-compatible port, alignment, equal-spacing, and grid snapping.

## 0.8.1

### Patch Changes

- Reduced equal-spacing guide selection to a single indexed candidate scan while retaining nearest-neighbor behavior and stable tie-breaking.

## 0.8.0

### Minor Changes

- Added atomic `dispatchBatch()` with document revision guards and structured failure results, plus public node/port creation, ID deletion, and edge endpoint reconnection commands.
- Added versioned `DiagramDocument` serialization while retaining legacy scene serialization and `transact()` history-reset behavior.
- Preserved render and port ordering across delete undo, and incrementally maintain endpoint dependency indexes.
- Kept viewport and selection changes outside the document revision guard and separated render-order cache invalidation from ordinary interaction changes.

## 0.7.0

### Minor Changes

- Made selection dragging resolve port hits to movable owner nodes and added undoable translation for free and attached edge routes.
- Added configurable drag snapping with zoom-scaled tolerance and typed alignment/equal-spacing guide segments in interaction snapshots.

## 0.6.0

### Minor Changes

- Added frame-batched edge endpoint drag previews and one-command undoable commits through `DiagramInteractionController`.
- Preserved edge waypoints and the opposite endpoint across commit, undo, redo, and cancel.

## 0.5.0

### Minor Changes

- Added `updateEntities` for undoable metadata updates across multiple existing entities. Metadata merges by key; unknown IDs and no-op updates do not create history entries.

## 0.4.0

### Minor Changes

- Added `setEntityMetadata` to update or remove entity metadata through the shared undo/redo history.
- Preserved metadata changes in history groups and bounded history alongside other commands.

## 0.3.0

### Minor Changes

- Added bounded undo history through `createDiagramEngine(scene, { history: { maxEntries } })`.
- Replaced full spatial-index rebuilds after mutations with local invalidation updates and stale-entry removal.
- Hardened immutable snapshots, dependency invalidation, query/snap correctness, and mutation-sequence coverage.
- Improved Node 24 consumer, benchmark, and package validation coverage.

### Migration

- Existing callers keep the default unbounded history behavior. Set `history.maxEntries` explicitly when retained history must be bounded.

