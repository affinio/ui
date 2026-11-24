# @affino/diagram-core

## 0.21.1

### Patch Changes

- Require a 4-screen-pixel selection-drag activation before applying movement snaps or committing geometry, so clicks and sub-threshold motion only affect selection.
- Treat standalone selection changes as transient UI state; they no longer add undo-history entries.
- Apply live Shift cardinal locking to two-point path endpoint drags, resolving grid and object snaps along the locked axis for matching preview and commit geometry.

## 0.21.0

### Minor Changes

- Added the persistent `create-port` interaction tool with typed host-local preview, deterministic topmost host selection, vertex tolerance, and nearest line/path segment projection.
- Port placement preview and `createPort` commit share the same resolved host, anchor, and point; cancel and stale hosts produce no port/history entry.

## 0.20.0

### Minor Changes

- Added typed entity-local ports for nodes, shapes/paths, text, tables, and groups while preserving legacy node-relative `nodeId`/`x`/`y` ports.
- Anchored port geometry follows host transforms and is available to hit testing, snapping, endpoint references, history, documents, and clipboard remapping.
- Added undoable path vertex insertion with stable vertex-port index updates; deleting or replacing an anchored vertex is rejected.
- Ungrouping a group with hosted ports now requires explicit `portRemaps`; successful remaps are atomic and undoable.

## 0.19.0

### Minor Changes

- Applied live Shift cardinal constraints to click-to-place line and path previews relative to each last confirmed vertex, with matching committed geometry.
- Added optional `DiagramTableHeader.verticalAlign` with a backward-compatible `middle` rendering default and undoable serialization support.

## 0.18.0

### Minor Changes

- Added exact circular-arc Path contours, three-point `createArc`, path bounds, serialization, SVG path projection helpers, and hole-aware hit testing.
- Added deterministic line intersection, straight-fragment trim, circle/rectangle arc trim, line Trim & Join, and circle-minus-rectangle geometry helpers with structured failures.
- Added undoable `updateShapePath`; operations can be composed with `dispatchBatch` for atomic trim/join/subtract commits.

## 0.17.0

### Minor Changes

- Added click-to-place free paths and connector routing with transient snapped previews and one undoable commit per completed drawing.
- Added path vertex and edge waypoint preview/commit interactions and editable path vertex handles in the public interaction API.
- Preserved `beginLineCreation()` and `beginEdgeCreation()` drag-to-draw behavior.

## 0.16.0

### Minor Changes

- Added rectangle-only `cornerRadius` with validation, renderer geometry projection, and undoable `updateShape` updates.
- Added optional table headers with explicit world-unit height, independent editing command, extended object bounds/hit testing, and transform/resize/clipboard/document support.

## 0.15.0

### Minor Changes

- Added indexed, screen-tolerance snap candidates, deterministic tie-breaking, origin-based angle constraints, grid/orthogonal constraints, and richer interaction diagnostics.
- Added `previewBatch()`, in-memory batch operation ID idempotency, structured scene validation, transient numeric input, undoable line-shape creation, orthogonal connector routing helpers, and opt-in endpoint reattachment.
- Added frame-batched transient row/column resize previews through `DiagramInteractionController`; pointer-up reuses the existing undoable table resize commands.

## 0.14.0

### Minor Changes

- Added world-space viewport constraints and `clampViewportToBounds()`. Pan previews and commits use the same clamped camera, and oversized viewports center the constrained page bounds.

## 0.13.0

### Minor Changes

- Extended `canRotate()` and `rotateEntities` to rotate selected groups around their shared bounds center. Group rotation preserves member IDs and relative layout, updates member orientations and edge routes, and participates in undo/redo and serialization. Added rotation support for tables, one of the existing groupable entity kinds.

## 0.12.0

### Minor Changes

- Added the undoable `flipEntities` command for horizontal and vertical reflection of selected entities or explicit IDs. Flip state is typed and serialized for nodes, shapes, text, and tables; edge free endpoints and route waypoints reflect around the shared bounds center while node/port endpoint references remain intact.

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

