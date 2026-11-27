# @affino/diagram-core

## 0.35.0

### Minor Changes

- Added retained group translation, rotation, reflection, nested membership, local-coordinate grouping, and affine-preserving ungrouping with legacy flat-group compatibility.
- Added Core parent/world transform and local/world point-conversion queries; geometry snapshots carry ancestor transforms for flat renderers.
- Preserved text `keep-readable` and `keep-horizontal` orientation through retained parent transforms.
- Added relative and absolute transform origins, origin-preserving edits, origin-aware geometry and port transforms, and Core queries for configured/local/document pivots.
- Added deterministic simple route-family selection for interactive orthogonal connectors while preserving the explicitly selectable obstacle-aware router.
- Added orthogonal route normalization and validation plus the undoable `setEdgeRoute` command for manual route ownership.
- Fixed alignment snapping across separated objects by querying indexed viewport-wide axis bands; exact movement alignment now commits exact resolved port coordinates.
- Added host-local geometric port directions, boundary-only `auto` inference, retained-transform world-direction resolution, and undoable direction changes; automatic simple and obstacle-aware routes now honor directional port terminals.
- Added opaque application-owned metadata to Port creation and Table cells, with validation, cloning, history, serialization, and copy/paste preservation.
- Completed graphical Table topology, active logical-cell resolution, structural row/column editing, cell appearance, text layout, and fixed/flexible track sizing through headless commands.
- Added cached immutable Table layout, merged-cell-aware binary-search hit testing, resolved border/text geometry, and a pluggable headless text-measurement provider.
- Kept directionally attached endpoint hosts as routing obstacles for simple connectors, preventing routes from crossing the objects they leave or enter.
- Rejected drags of terminal connector segment runs attached to endpoints while keeping interior segment runs editable.
- Kept internal offset lanes movable when both attached terminals leave no safe interval between their coordinates.

### Compatibility notes

- `DiagramGroup.x` and `DiagramGroup.y` are new optional fields relative to the prior public contract, which had no group coordinates. They remain optional because unsupported legacy groups with attached descendant routes must keep the baked-geometry path. Current retained group commands set finite coordinates; consumers that accept both old and retained group records should narrow or default the new fields. See `docs/diagram-hierarchy-deprecations.md`.

## 0.34.0

### Minor Changes

- Added `inherit`, `keep-readable`, and `keep-horizontal` text orientation policies with undoable updates and shared resolved geometry.

## 0.33.0

### Minor Changes

- Stabilized connector creation with screen-space port capture hysteresis, gesture-locked route axes, and a soft persisted route-turn hint; canonical route previews now match committed auto geometry.

## 0.32.0

### Minor Changes

- Allowed DiagramEdge routes as explicit or automatic geometric boundaries for shape sweep Trim without changing connector endpoints or connectivity.
- Added `extent: "crossing-side-to-endpoint"` and exact removed-contour results for stroke Trim previews; this removes the stroke-selected endpoint arm up to its nearest boundary while leaving DiagramEdge connectivity untouched.

## 0.31.0

### Minor Changes

- Added typed entity `visualStyle` resolution, cross-kind render ordering, and typed style updates.
- Added fixed-point connector junction anchors and atomic validation when host routes change; added canonical port ownership and explicit port remaps for path vertex edits.
- Added explicit `expectedDocumentRevision` guards for batch preview and commit.
- Added `altKey` to pointer events and center-based entity resizing; Shift and Alt/Option can be combined for centered aspect-ratio resizing.
- Automatic connector segment drags now preview and commit the same constrained route, including moved free endpoints; impossible routes report `no-route` and are not committed.

## 0.30.0

### Minor Changes

- Added `maxRouteBends` for route-wide bend limits and `extent: "beyond-boundary"` for trimming ray tails beyond resolved boundaries.
- Applied orthogonal constraints to existing edge endpoints and click-to-place path points after snapping.
- Simplified connector segment previews and retained auto-route drags as editable waypoint constraints instead of freezing generated bends.
- Removed duplicate terminal clicks from click-to-place connector waypoints and canonicalized preview and committed routes.
- Bézier creation now treats an anchor drag as the forward contour tangent and mirrors the incoming handle across the anchor.

## 0.29.0

### Minor Changes

- Added stable connector junction entities and route-anchored ports. Connector endpoints can attach to junctions, branches create junctions and edges atomically, and host deletion cascades to dependent branches.
- Added connector attachment snapping and hard maxBends route limits with a typed bend-limit diagnostic. Accepted port and connector attachments retain their exact coordinates while orthogonal routing handles the lead geometry.
- Added route-fraction anchors for ports hosted by edges and included junctions in scene/document serialization, clipboard remapping, dependency invalidation, and undo/redo.
- Preserved local port anchors when strict-grid movement snaps their host, so existing attachment identity and host-relative position are not silently rewritten.

## 0.28.0

### Minor Changes

- Added opt-in `snap.strictGrid` resolution. Grid coordinates override conflicting geometric snap candidates; resize edges and dimensions, port anchors, path points, connector endpoints and user waypoints share the same world-grid policy. Added grid-aligned rotation-center options to `rotateEntities` while preserving port attachments.

## Unreleased

### Fixed

- Made strict-grid persistence cover every group member, resized line/path vertices and Bézier controls, hosted-port world positions, and automatic orthogonal route bends. Group offsets can change as members align independently.
- Scoped interaction `snap.ortho` to drawing gestures and orthogonal edge/path endpoint edits; selection movement remains free while grid and object snapping stay active.

## 0.27.1

### Patch Changes

- Allow selected paths to serve as trim boundaries for other selected targets while excluding each target from its own boundary set. Added an explicit partial/unchanged/rejected Trim status so per-target findings do not mask successful updates.

## 0.27.0

### Minor Changes

- Added deterministic orthogonal connector routing through a coordinate-compressed visibility graph with obstacle clearance, ordered waypoints, cardinal terminal leads, route diagnostics, and stable tie-breaking.
- Added opt-in serialized automatic routing with derived geometry invalidation after host/obstacle edits. Legacy edges without routing remain fixed; route and segment previews commit their exact displayed geometry, and dragged auto-route segments become undoable waypoint constraints.

## 0.26.0

### Minor Changes

- Extended `trimSelectionByStroke()` to remove only the target interval between a sweep crossing and the nearest eligible external boundary in the stroke-selected direction. Added deterministic `boundaryIds`, sweep/boundary diagnostics, typed no-boundary and ambiguity findings, and exact line/arc boundary intersections. Boundaries default to eligible non-target shapes in stable ID order; boundary geometry is never modified.

## 0.25.0

### Minor Changes

- Added `getConnectorRenderGeometry()` and renderer-neutral move, line, quadratic, and cubic commands for world-unit corner rounding and deterministic crossing bridges on the higher-render-order edge. Render options remain transient and do not affect scene serialization or history.

## 0.24.0

### Minor Changes

- Added the `draw-bezier` interaction tool, exact cubic contour draft previews, click-drag anchor tangents, cardinal Shift constraints, close/finish/cancel behavior, and one-step undoable creation.
- Added `beginBezierHandle()` for transient anchor and tangent editing of cubic path segments; commits use the existing `updateShapePath` command and preserve the path ID.
- Added north/east/south/west resize handles for one-axis resizing, anchored opposite sides, with rotation/flip-aware previews and commits.
- Enabled direct undoable rotation of free point-to-point edge routes, including waypoints, and exposed oriented selection corners for straight edges.
- Extended `trimSelectionByStroke()` to exact cubic intersections and splits, closed contour outlines, and native rectangular figures; ambiguous topology and self-intersecting strokes return typed findings without changing affected targets.

## 0.23.0

### Minor Changes

- Added frame-batched orthogonal edge-segment dragging through `beginEdgeSegmentHandle()`, with axis-constrained snapping, transient full-route preview, attached endpoint preservation, and one atomic undoable commit.
- Applied Shift cardinal constraints to click-to-place connector previews relative to the latest confirmed bend and to connector waypoint drags.
- Clipboard offsets now translate free edge point endpoints together with waypoints while preserving node/port references.
- Added `DiagramInteractionSnapOptions.portTolerancePx` for independent screen-space connector port capture, with legacy fallback to `tolerancePx`.

## 0.22.0

### Minor Changes

- Added exact cubic Bézier path segments, SVG-like `M/L/C/Z` parsing, native path command generation, exact cubic bounds, transforms, and deterministic bounded hit-testing support. Operations without exact cubic support, including sweep Trim, return typed findings.
- Added `setEditingLocked()` to suspend user commands and cancel transient interaction gestures while leaving `transact()` available for authoritative scene replacement.

## 0.21.3

### Patch Changes

- Added pure `trimSelectionByStroke()` geometry results for deterministic multi-target trimming of open line/path shapes, including exact line/arc intersections, transformed geometry, typed findings, and batch-ready undoable updates.

## 0.21.2

### Patch Changes

- Keep viewport updates, pan, zoom, and fit operations outside undo/redo history; these changes preserve the redo branch and document-edit grouping.

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

