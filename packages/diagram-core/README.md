# @affino/diagram-core

Framework-neutral diagram state, geometry, command, history, selection, viewport, and serialization engine. Vue, React, or canvas adapters should call core commands instead of reimplementing movement, hit testing, undo/redo, clipboard, or viewport math.


## Internal Architecture

The public package entry stays `createDiagramEngine()`. Internally the facade delegates focused responsibilities to services under `src/internal`: `DiagramHistory` owns undo/redo stacks and history merging, `DiagramGeometryService` owns geometry caching and read diagnostics, `DiagramSceneStore` owns mutable scene state, immutable snapshots, subscribers, and last-change publication; `DiagramSpatialIndex` owns visible/hit/port indexes, `DiagramViewportService` owns fit math, and `DiagramClipboardService` owns selected subgraph export/import id remapping. Command patch creation remains package-internal and should be split behind `DiagramCommandEngine` in a follow-up slice without changing the public API.

## Basic usage

```ts
import { createDiagramEngine } from "@affino/diagram-core"

const engine = createDiagramEngine({
  nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 120, height: 64, portIds: ["p1"] }],
  ports: [{ id: "p1", kind: "port", nodeId: "n1", x: 120, y: 32 }],
  edges: [],
  texts: [{ id: "t1", kind: "text", x: 12, y: 18, text: "Bay 1", width: 80, height: 18 }],
  shapes: [],
  viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 },
})

engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
engine.dispatch({ type: "moveEntities", ids: ["n1"], delta: { x: 24, y: 0 } })
engine.dispatch({ type: "undo" })

// Bound retained undo memory for a long-lived editor session.
const boundedEngine = createDiagramEngine({}, { history: { maxEntries: 200 } })
```

`history.maxEntries` evicts the oldest undo entries first. It accepts a non-negative integer; `0` disables undo retention, while the default `Infinity` preserves the legacy unbounded behavior. An accepted edit clears redo, and `transact()` replaces the scene and resets history.

`updateEntities` applies metadata updates to existing entities in one undoable command. Metadata is merged by key, so omitted keys remain unchanged. The command does not remove metadata keys; assigning `undefined` stores an `undefined` value. Unknown IDs are ignored, and updates with no effective changes create no history entry. Use `setEntityMetadata` to replace the complete metadata object.

### Text orientation policies

`DiagramText.orientationPolicy` controls glyph orientation while the text's stored position continues to follow normal object and group transformations. Omitted policy is `inherit`, preserving legacy rendering. Set or change it through `updateEntities`; this is undoable, batchable, and serialized with the text:

```ts
engine.dispatch({ type: "updateEntities", updates: [{ id: "t1", orientationPolicy: "keep-readable" }] })
```

`inherit` preserves rotation and both reflections. `keep-readable` removes glyph reflection, follows the transformed local baseline, then normalizes it into `(-90°, 90°]`; exact `-90°` maps to `+90°`. `keep-horizontal` removes glyph rotation and reflection in document coordinates. The policy is applied centrally in Core geometry, so bounds, hit testing, selection, and Vue rendering share the resolved orientation. The current engine stores object transforms as rotation and axis flips (group operations update child geometry); it does not represent non-uniform glyph scaling or shear. No PDF export adapter exists in this repository.

### Non-mutating content presentation

Pass generic display strings to headless resolvers without dispatching commands:

```ts
const contentOverrides = {
  textByEntityId: new Map([["label", "Example data"]]),
  textByTableCellId: new Map([["schedule", new Map([["schedule:cell:0:0", "Resolved cell"]])]]),
}
const textGeometry = engine.getPresentedGeometrySnapshot("label", contentOverrides)
const tableLayout = engine.getPresentedTableLayout("schedule", { contentOverrides })
```

`DiagramContentOverrides` is presentation input only. A present map entry overrides even when its value is `""`; missing entries use authoritative content. Cell IDs are scoped within a table by the outer map. Layout enumerates only active logical cells, so covered-cell overrides are inactive while merged and become eligible only if that stable ID later becomes an active anchor; Core never transfers an override between identities. Unknown, deleted, or covered IDs are ignored. Tables without explicit/stored stable Cell IDs cannot be addressed by an override.

The normal `getGeometrySnapshot()` and table layout remain authoritative. Presented Text geometry uses the alternative string for fallback width calculation; explicit width/height and all transforms/orientation remain authoritative. `getPresentedGeometrySnapshot()` is the derived presentation geometry. Table presentation uses the same `resolveDiagramTableLayout()` pipeline and text measurement provider as normal layout; tracks, topology, borders, and dimensions do not change. Text override changes do not update document revision, serialization, history, or subscribers. Table layout cache keys include the current resolved override values for that table plus provider identity/revision; Map mutation is detected by value fingerprinting on the next read. The cache is bounded by the existing provider limit. Equal resolved strings can share a cached immutable layout.

Core does not currently define line wrapping or clipping for graphical Text entities; its existing Text model has fixed/estimated bounds and renderers choose glyph layout. Presented Text uses that same geometry path. Table Cell wrapping, clipping, multiline layout, alignment, and measurement are resolved headlessly. Consumers should not assume browser/PDF typography equivalence without supplying equivalent metrics and verifying the target renderer.

### Transform origins

Nodes, shapes, text, tables, and groups accept an optional `transformOrigin`. Omission keeps the existing center pivot. `relative` resolves against the untransformed object bounds; `absolute` is an offset in the object's local coordinate plane from its local bounds origin. Both accept finite coordinates outside the bounds. Read the configured origin with `getTransformOrigin(id)`, the local offset with `resolveLocalTransformOrigin(id)`, and its document-space pivot with `resolveWorldTransformOrigin(id)`. The returned geometry also includes `transformOrigin` when a non-default pivot is needed by a renderer.

Use `setTransformOrigin` to change or clear a pivot. It preserves existing world geometry by default; set `preserveWorldGeometry: false` to retain object placement and allow the geometry to move around the new pivot. The origin edit and placement correction are one undoable patch. Relative pivots follow resized bounds; absolute offsets remain fixed in the object's local frame. Temporary resize and multi-selection pivots remain independent.

```ts
engine.dispatch({ type: "setTransformOrigin", id: "housing", transformOrigin: { mode: "relative", x: 0, y: 0.5 } })
engine.dispatch({ type: "setTransformOrigin", id: "housing", transformOrigin: null }) // reset to centre
```

Ports, junctions, and connection endpoints do not have independent transform origins. The Core does not provide non-uniform affine scaling or shear. SVG and DOM render helpers consume Core-resolved transforms; the repository has no PDF export adapter.

### Directional ports

`DiagramPort.direction` is an optional host-local outward direction: `north`, `east`, `south`, `west`, `auto`, or `any`. Omitted values preserve legacy unrestricted routing. `auto` infers a direction only when a local rectangular boundary anchor identifies exactly one side; corners, interior anchors, vertex anchors, and route anchors are unrestricted. `resolvePortWorldDirection(port, entities)` applies the host and retained parent linear transforms. If an explicitly directional port resolves to a non-cardinal world vector, it returns `null`; orthogonal automatic edge resolution reports no geometry rather than quantizing that vector.

Automatic routes combine connector-level direction options (which take precedence) with resolved port directions. Port directions point outward from their hosts. The existing connector `sourceDirection` is also an outward direction; `targetDirection` retains its established meaning as the final travel direction, so Core converts a target port's outward direction to the opposite travel direction before routing. Directional routes use a minimum 12 document-unit terminal lead; a larger configured lead is preserved. Direction editing is undoable through `setPortDirection`; omit `direction` to restore legacy unrestricted behavior or set `auto` to enable boundary inference. Direction is stored independently of metadata and survives scene/document serialization and clipboard duplication.

### Rectangle corner radius

`DiagramShape.cornerRadius` is an optional world-unit radius for `shape: "rect"`; omission is equivalent to `0`. A radius must be finite and in `0..min(width,height)/2`. Non-rectangular shapes accept only `0` (or an omitted radius). Update it through one undoable command:

```ts
engine.dispatch({ type: "updateShape", id: "housing", cornerRadius: 8 })
```

The field is part of normal scene/document serialization and clipboard copies. A direct resize command that would make the stored radius exceed half the new smaller side is rejected; pointer-handle resizing clamps its minimum size to preserve the radius. Set a smaller radius first to permit tighter resizing. Geometry snapshots expose `cornerRadius` for renderers. Core hit testing continues to use the rectangle bounds, so rounded visual corners do not remove the rectangular hit area.

### Connector rendering

`resolveDiagramStyle(entity)` is the renderer-neutral style resolver. Typed `visualStyle` fields override legacy top-level or nested `metadata.style` values; `updateEntityStyle` changes them as one undoable command; supported fields are fill, stroke, stroke width/dash, fill rule, color, and text font properties. Path contours emit an implicit close segment for `closed`; hole contours require a closed outer contour and resolve to `evenodd`, even if a `nonzero` style was requested. Other paths use their explicit fill rule or `evenodd` by default. `getRenderOrder()` is the cross-kind order source; `metadata.zIndex` permits text to sit between shapes and is preserved by serialization. The Vue projection exposes this sequence as `ordered`. This repository has no PDF export adapter.

`engine.getConnectorRenderGeometry(options)` returns renderer-neutral path commands for each edge in render order. `cornerRadius` and `crossingBridge.radius` are world-unit display options; they are not written to edges, serialization, revision, or undo history. Rounded corners use quadratic commands and clamp their radius to adjacent segment lengths. A bridge is placed only at a strict interior crossing of two non-collinear edge segments, on the higher-render-order edge; endpoint touches, parallel/collinear overlaps, and shared endpoint coordinates are ignored. Bridges indicate visual crossings only and never alter port or endpoint connectivity. A zero or omitted corner radius keeps the existing straight route.

```ts
const renderPaths = engine.getConnectorRenderGeometry({
  cornerRadius: 8,
  crossingBridge: { radius: 6 },
})
// Each item contains { id, commands, bridges }; commands are typed M/L/Q/C-like values.
```

The API recomputes from current edge geometry and render order on each call. It rejects negative or non-finite radii with `RangeError`. A route with only two endpoints has no corner to round.

### Selection sweep Trim

`trimSelectionByStroke(scene, input)` is a pure geometry query. For every stroke crossing on an open line/path target, `cross(strokeDirection, targetTangent) > 0` selects forward traversal in contour order; a negative result selects backward traversal. Core removes only the interval between that crossing and the nearest transverse intersection with another eligible boundary. The remaining portions on both sides retain the target ID, metadata, and style. Pass its `updates` to `dispatchBatch()` once to commit all changed targets in one undo step; use the returned preview for the interaction overlay.

```ts
import { trimSelectionByStroke } from "@affino/diagram-core"

const result = trimSelectionByStroke(engine.serialize(), {
  targetIds: ["wire-1"],
  stroke: [{ x: 30, y: 40 }, { x: 30, y: 0 }],
  tolerance: 0.25, // world units
  // boundaryIds: ["bus-1"], // optional; without it Core uses all eligible non-target shapes
})
if (result.updates.length) engine.dispatchBatch(result.updates)
```

By default, boundaries are eligible non-target `DiagramShape` objects and `DiagramEdge` routes, sorted by stable ID, never by render order. Native lines, rectangle outlines, `pathContours`, and edge routes provide boundary segments; native ellipse bounds do not. Pass `boundaryIds` to make the candidate set explicit. Missing or unsupported explicit IDs return `unsupported-boundary`. A missing boundary returns `no-boundary`; ties between distinct boundary IDs at the same nearest location return `ambiguous-boundary`. Collinear overlap, tangency, or unsupported segment pairs are rejected without changing that target. Edges can provide geometry boundaries but are never trim targets, so their endpoint and port connectivity is unchanged. The result reports `sweepCrossings`, resolved `boundaryIntersections`, retained world geometry, and compatibility alias `cutPoints` (same as sweep crossings).

Line-line, line-arc, arc-arc, and line-cubic intersections are supported where the pair is transverse. Cubic-cubic and cubic-arc boundary pairs are reported as unsupported when their bounds overlap. Native rectangle primitives can act as boundaries but are not sweep targets; open line/path geometry is required. Connected `DiagramEdge` objects are rejected as targets, and no geometric intersection changes electrical connectivity.

Shapes can also be created through an undoable command. A `line` shape stores its endpoints as `(x, y)` and `(x + width, y + height)`; negative direction is represented by `flipX`/`flipY` while width and height remain non-negative.

```ts
engine.dispatch({ type: "createShape", shape: { id: "guide", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 40 } })
```

### Groups

Groups are structural scene entities with stable IDs, ordered `childIds`, and retained parent-local transforms. New groups are created by `groupEntities`; they start with at least two unique members. Nested groups are supported, each graphical entity has at most one parent, and cycles or unknown members are rejected. Ports remain host-owned entities rather than direct group members.

```ts
engine.dispatch({ type: "groupEntities", id: "g1", ids: ["n1", "n2"] })
engine.dispatch({ type: "moveEntities", ids: ["g1"], delta: { x: 24, y: 0 } })
engine.dispatch({ type: "rotateEntities", entries: [{ id: "g1", rotation: 90 }] })
engine.dispatch({ type: "reparentEntity", id: "n1", parentId: "g1" })
engine.dispatch({ type: "reparentEntity", id: "n1", parentId: null })
engine.dispatch({ type: "ungroupEntities", ids: ["g1"] })
```

Group creation, reparenting, ungrouping, and deletion participate in undo/redo and atomic batches. Reparenting preserves world geometry while retaining intrinsic geometry; Core records any required parent-local placement offset. Reparenting rejects cycles, singular/non-orthogonal transforms, attached connectors, and automatic connectors whose route is endpoint/world-resolved. Free routes can be reparented only when their required local linear transform is identity, preserving document-space orthogonality. Child-owned ports remain attached through host identity. Group-owned ports retain their identity on ungroup only when every one has an explicit valid `portRemaps` entry; otherwise the ungroup is rejected atomically.

Deleting a group deletes its descendant hierarchy and dependent attachments. Deleting a child removes only that membership and preserves the surviving group's transform, metadata, and world geometry. Single-child and empty groups are valid scene states; empty groups have no geometry until members are added or the group is deleted. New group creation still requires at least two members. Copy, paste, and duplicate remap nested group/member IDs and attached references.

`engine.canRotate()` returns true for supported groups. Translation, rotation, and reflection update the group transform; descendant authoritative local geometry is not rewritten. Group resize remains unsupported because the model does not yet define retained scaling semantics across stroke width, text size, table tracks, and child geometry. Use geometric resize commands for individual objects.

Legacy serialized groups that omit retained `x`/`y` are normalized on load to retained identity groups when no descendant attached connector would be double-transformed. Their already world-positioned child coordinates, IDs, ports, origins, and metadata remain unchanged. Legacy hierarchies containing attached descendant connectors remain on the deprecated baked compatibility path because connector endpoint coordinates are resolved in document space. New functionality must use retained groups; see [diagram hierarchy deprecations](../../docs/diagram-hierarchy-deprecations.md).

### Visual tables

`DiagramTable` is a plain text table object, not a spreadsheet. It stores a stable ID, world bounds, cells, row/column sizes, per-cell alignment and metadata, table-level grid/border styles, optional merged regions, and an optional title header. Core assigns a distinct stable ID to every logical cell when legacy/input cells omit one; the default cell is a content/style template and has no logical identity. Cell IDs serialize with the table. Missing cell content defaults to empty text; omitted row and column sizes are initialized evenly. Tables are included in scene/document serialization, render order, hit testing, selection, move/resize, z-order, history, batch commands, copy/paste, duplicate, and delete.

```ts
engine.dispatch({ type: "createTable", table: {
  id: "notes", kind: "table", x: 40, y: 40, width: 320, height: 120,
  rowCount: 2, columnCount: 2,
  cells: [[{ text: "Item", horizontalAlign: "center" }, { text: "Value" }], [{ text: "Relay" }, { text: "R1" }]],
} })
engine.dispatch({ type: "insertTableRow", id: "notes", index: 1 }) // zero-based insertion point, including rowCount
engine.dispatch({ type: "updateTableCell", id: "notes", row: 1, column: 0, cell: { text: "Breaker", verticalAlign: "middle" } })
engine.dispatch({ type: "updateTableStyle", id: "notes", style: { grid: { visible: true }, border: { radius: 8 } } })
engine.dispatch({ type: "updateTableHeader", id: "notes", header: { text: "Distribution panel", height: 28, horizontalAlign: "left" } })
engine.dispatch({ type: "updateTableHeader", id: "notes", header: null }) // explicitly remove the title
```

Row/column indexes are zero-based. Insert accepts indexes `0..count`; delete and resize accept `0..count-1`. Deleting the last row or column is rejected as a no-op. Empty text is valid. Tables and row/column dimensions must be finite and positive; row heights and column widths sum to the data-grid body height and width. Alignment is `left|center|right` and `top|middle|bottom`. Line style is `solid|dashed|dotted`; colors must be non-empty strings; stroke widths, cell padding, and corner radius must be finite and non-negative. Invalid constructor/deserialization input throws `TypeError`; invalid commands return `changed: false` and create no history entry. Table cell hit testing is available through `getDiagramTableCellAt(table, worldPoint)`.

`resolveDiagramTableLayout(table, { textMeasurementProvider })` resolves document-unit tracks, active visible cells, merged bounds, padded content bounds, line positions, overflow, and border segments. `visibleCells` contains each active logical cell once; `coveredCellIds` identifies hidden matrix cells, whose metadata remains stored but inactive until unmerge. Table and cell styles inherit as table defaults followed by cell overrides. Cell padding can override each side independently; excessive padding is proportionally clamped to an empty non-negative content rectangle. Borders resolve to one segment per physical boundary: explicit left/top ownership wins, otherwise right/bottom ownership is used; an explicit hidden side suppresses the shared segment, then table grid defaults apply. Explicit outer cell-side borders are also resolved. Merged internal segments are omitted.

See [Diagram Table T5 validation](../../docs/diagram-table-t5-validation.md) for benchmark methodology, current measured results, browser evidence, and deferred capabilities.

Use `engine.getTableLayout(tableId, provider?)` for repeated queries. Core caches immutable local layouts in the existing `DiagramGeometryService`, keyed by table ID and current immutable Table snapshot, plus measurement provider identity/revision. It retains only the current snapshot for each live table ID and at most four provider entries for that snapshot; deleted table IDs are evicted during geometry invalidation. A Table content/style/topology/track update produces a new snapshot and therefore a new layout. Selection, viewport changes, and parent group transforms preserve the local Table snapshot and cache entry. `engine.getTableCellAt(id, worldPoint)` uses that cached layout and binary-searches cumulative track edges; exact internal edges belong to the following track, and the outer maximum edge belongs to the last track. `getTableLayoutReadCount()` is diagnostic. The standalone `getDiagramTableCellAt()` remains a pure query unless passed a resolved layout.

`updateTableCellRange` applies cell content/style fields atomically to active logical cells in the expanded rectangular range. `resizeTableRow` and `resizeTableColumn` support `policy: "flexible"` (the default, preserving unrelated tracks and changing total size) and `policy: "fixed"` (redistributing against the adjacent track, preserving total size). `setTableSize` uses proportional track distribution and preserves exact requested totals by assigning the floating remainder to the last track. All dimensions are document units. These layout edits do not change text size or padding.

Cell overflow supports `clip`, `wrap`, and `visible`; defaults to `clip`. Text layout preserves explicit newlines, wraps words and long tokens, and reports `overflowed`. The generic `DiagramTextMeasurementProvider` supplies `measureText(text, resolvedStyle)` metrics in document units plus a `revision`; increment the revision when font availability or measurement behavior changes. Core owns wrapping, vertical alignment, baseline, and per-line positions. Without a provider, Core uses a deterministic approximate glyph-width fallback (Latin characters 0.56em, other code points 1em; line height 1.2em). This fallback is useful for headless determinism but is not typographically exact. Vue's exported `createCanvasTextMeasurementProvider()` uses browser Canvas metrics and refreshes its revision on font loading events; the renderer consumes Core-resolved lines and positions. Matching browser and PDF typography still requires matching font inputs and measurement metrics. There is no auto-fit or ellipsis behavior.

`setTableCellBorders` atomically applies `all`, `outside`, `inside`, individual side, `none`, or `reset` operations to an inclusive range. `none` writes explicit hidden side overrides; `reset` removes those overrides and inherits table grid defaults. Shared physical boundaries are emitted once; merged interior edges are suppressed. `inside` and `outside` affect the selected range perimeter/interior and preserve other appearance fields. Row and column style defaults are deferred; style precedence is currently table defaults followed by cell overrides.

Merged regions are stored as `{ anchorCellId, rowSpan, columnSpan }` in `DiagramTable.merges`. The cell matrix and tracks remain present; Core resolves covered positions to the anchor, derives merged bounds by summing tracks, and omits internal grid-boundary segments. `mergeTableCells` accepts an inclusive rectangular range and defaults to `reject-non-empty`, which rejects non-empty text or metadata outside the top-left anchor with `reason: "merge-content-conflict"`. `keep-anchor` is an explicit policy for hiding secondary content while merged; covered matrix cells remain stored and become visible again on unmerge. Partial intersections with existing merged regions are rejected with `reason: "invalid-table-range"`. `unmergeTableCell` accepts any grid position in the merged region. Insertion inside a region expands its span; insertion before shifts it; insertion after leaves it unchanged. Deletion inside contracts the span, deleting the anchor track promotes the surviving top-left cell while retaining the anchor ID/content/metadata, and a vanished 1×1 span becomes ordinary. Structural mutations are atomic and undoable.

`DiagramTableCell.id` is stable within a table and is the merge anchor identity. Covered cells retain their own IDs and values while merged; ordinary updates to covered cells are rejected. Text edits or metadata replacement on the anchor preserve other cell fields. Cell metadata is opaque JSON-shaped application data, copied and frozen by Core. `updateTableCell({ metadata })` replaces cell metadata; `setEntityMetadata` replaces entity metadata, while the separate `updateEntities` metadata patch continues to merge keys. Port creation accepts metadata directly in `DiagramPortCreationOptions` and commits it with the Port. Metadata cannot contain functions, cycles, non-finite numbers, or non-plain objects.

`resolveDiagramTableLayout(table).visibleCells` enumerates active logical cells exactly once. Each entry includes the active anchor's optional `metadata`, plus `coveredCellIds` for underlying positions retained while the region is merged. Metadata on those covered positions is inactive: it is not included in the visible-cell entry or treated as active resolved content. Under `keep-anchor`, the original covered cell objects and metadata remain stored, become visible again after `unmergeTableCell`, and are restored by undo. Duplicating a merged table remaps cell IDs and merge anchors while preserving both active and covered metadata. Serialization, history, and copy/duplicate retain the opaque values.

Metadata ownership example (application keys remain opaque to Core):

```ts
const portMetadata = { binding: { key: "signals.input" } }
engine.dispatch({
  type: "createPort",
  port: { id: "input-port", kind: "port", nodeId: "equipment", x: 20, y: 10, metadata: portMetadata },
})

engine.dispatch({
  type: "createTable",
  table: {
    id: "schedule", kind: "table", x: 0, y: 0, width: 80, height: 20,
    rowCount: 1, columnCount: 1,
    cells: [[{ text: "", metadata: { binding: { key: "document.number" } } }]],
  },
})
engine.dispatch({
  type: "updateTableCell",
  id: "schedule", row: 0, column: 0,
  cell: { metadata: { binding: { key: "document.number", source: "drawing" } } },
})

const table = engine.getScene().entities.tablesById.get("schedule")!
for (const cell of resolveDiagramTableLayout(table).visibleCells) {
  consumeActiveCell(cell.anchorCellId, cell.metadata)
}
```

Creation and metadata changes are atomic, undoable replacements; external input objects are copied and frozen when accepted. A failed metadata validation creates no scene mutation or document revision. The default merge policy rejects non-empty secondary text or metadata. Explicit `keep-anchor` hides secondary content and metadata while retaining the covered cell data; it does not concatenate or discard those values. The anchor's metadata remains the active merged-cell metadata until edited or the region is unmerged.

`header` is omitted on legacy tables. When present, its `height` is a positive world-unit band above the data grid. `horizontalAlign` and `verticalAlign` are optional (`left`/`center`/`right` and `top`/`middle`/`bottom`); omitted vertical alignment renders as `middle`. Update these fields through `updateTableHeader`, which is undoable and preserved by serialization. The existing `table.y` and `table.height` continue to describe the grid body, while geometry bounds, hit testing, selection, and outer-border rendering include the header band. Resizing the whole table scales the header band and data rows proportionally; row/column edit commands affect only data cells. `getDiagramTableCellAt()` returns `null` for the header region and maps grid points through the table rotation/reflection. Header text may be empty; clearing the title is explicit with `header: null`. Existing scene/document format version 1 accepts both old tables without headers and new tables with headers.

Cell edits are dispatched as one `updateTableCell` command. The Vue adapter keeps keystrokes in a local active editor and commits once on Enter, blur, or cell navigation; Escape discards the draft.

Vue table row and column boundary gestures use `DiagramInteractionController.beginTableResizeHandle(id, axis, index, pointer)`. The index identifies the row/column on the leading side of a boundary. `getSnapshot().tableResizePreview` exposes transient sizes and outer bounds without changing serialization, revision, or history. Pointer-up applies one existing `resizeTableRow`/`resizeTableColumn` command; cancel drops the preview. Pointer deltas are mapped into table-local axes, including rotated tables. Active-cell position (`DiagramTableCellPosition`) is adapter UI state and is intentionally absent from Core scene/document serialization.

### Atomic graph edits and documents

`dispatchBatch()` applies commands against a draft in order and publishes one change and one undo entry only after every command succeeds. The scene `revision` advances for every actual scene change, including viewport and selection; `documentRevision` advances only for persisted content changes and also advances for content-changing Undo/Redo. A no-op command or batch advances neither. Set `expectedDocumentRevision` to `getDocumentRevision()` to guard preview and commit against stale content. The legacy `expectedRevision` keeps its existing meaning and also compares to `documentRevision`; when both are supplied, both must match. Viewport and selection changes between preview and commit do not invalidate this guard. A rejected result contains `failedCommandIndex`, `reason`, and known `affectedIds`; the scene, subscribers, and undo/redo stacks remain untouched.

`previewBatch()` runs the same command validation on an isolated draft and returns its candidate serialized scene without publishing or changing history. `dispatchBatch()` also accepts a caller-supplied `operationId`: duplicate IDs with the same serialized request return the original result; reuse with different commands is rejected. Receipts are held in memory per engine instance (up to 1,024 IDs), so applications that need durable idempotency should persist their own audit record.

```ts
const result = engine.dispatchBatch([
  { type: "createNode", node: { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 60 } },
  { type: "createPort", port: { id: "p1", kind: "port", nodeId: "n1", x: 100, y: 30 } },
  { type: "createEdge", edge: { id: "e1", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "point", point: { x: 180, y: 30 } } } },
], { expectedRevision: engine.getDocumentRevision() })

if (!result.ok) console.error(result.reason, result.failedCommandIndex, result.affectedIds)
const savedDocument = engine.serializeDocument({ includeView: false })
const sceneInput = deserializeDiagramDocument(savedDocument)
```

Ports retain the legacy node-relative `{ nodeId, x, y }` form and also support entity-local anchors. Use `{ hostId, anchor: { kind: "local", x, y } }` for nodes, shapes, text, tables, or groups, and `{ hostId, anchor: { kind: "vertex", index } }` for line/path vertices. `getGeometrySnapshot(portId)` exposes the stable host/anchor plus transformed world `point`; edge endpoints still reference the stable port ID. Anchors are validated against host bounds or existing path vertices. `insertPathVertex` shifts later vertex-anchor indexes atomically; a referenced vertex cannot be removed or replaced.

Group ports are not automatically assigned to child geometry on ungroup. `ungroupEntities` is rejected if a group hosts ports unless the caller supplies a valid `portRemaps` entry for every such port. Each remap names a direct child and its valid local anchor. The remapping and ungroup are one undoable change. Clipboard paste remaps selected hosts, ports, and attached edge references together.

```ts
engine.dispatch({ type: "createPort", port: { id: "contact-tip", kind: "port", hostId: "contact-line", anchor: { kind: "vertex", index: 0 } } })
engine.dispatch({ type: "ungroupEntities", ids: ["assembly"], portRemaps: {
  "assembly-terminal": { hostId: "contact-line", anchor: { kind: "local", x: 20, y: 10 } },
} })
```

## Engineering snaps and connectors

`getSnapCandidates()` is a read-only indexed query. Its `tolerancePx` is screen pixels and is converted with the current viewport zoom. Candidate order is stable: port, endpoint, intersection, midpoint, center, perpendicular, nearest, alignment, equal spacing, grid; ties use screen distance, target ID, then coordinates. `excludeIds` filters self-snaps. Text bounds are not snap geometry. In the current generic model, endpoint/midpoint/nearest/perpendicular/intersection candidates come from edge paths and visible line/rectangle/ellipse outlines; table cell grid lines are not electrical anchors.

```ts
const candidates = engine.getSnapCandidates({ x: 315, y: 142 }, {
  tolerancePx: 8,
  kinds: ["port", "endpoint", "midpoint", "intersection", "perpendicular", "nearest", "grid"],
  gridSize: 8,
  origin: { x: 280, y: 120 },
  excludeIds: new Set(["moving-edge"]),
})
const resolved = engine.snapPoint({ x: 315, y: 142 }, { tolerancePx: 8, kinds: ["port", "nearest"], origin: { x: 280, y: 120 } })
```

Legacy `radius` in `snapPoint()` remains in world units. New callers should use `tolerancePx`. Use `origin` for polar constraints; angular projection preserves vector length from that origin. For `DiagramInteractionSnapOptions`, `ortho: true` constrains newly drawn lines, each click-to-place path segment, Bézier anchors, connector endpoints, and existing edge endpoint edits to 90-degree increments. Click-to-place paths project snap candidates onto the selected axis so grid and nearby geometry cannot introduce diagonal segments. Connector waypoint and segment edits preserve orthogonality and simplify redundant route points. Shift remains the explicit cardinal constraint modifier. Grid, port, alignment, and other object snaps continue to apply to previews and commits.

### Strict interaction grid

`snap.strictGrid: true` is opt-in and requires `snap.enabled !== false` plus a finite positive `gridSize`. In strict mode, persisted straight geometry points (shape corners, line/path vertices and Bézier control points, connector endpoints/waypoints, and port world positions) are normalized to the world grid. Grid wins over conflicting port, alignment, geometry, and angle candidates; previews and commits use the same normalized geometry. With strict mode omitted, the legacy snapping behavior is unchanged.

Group members are normalized independently, so their relative offsets can change when the group's members are not grid-aligned. Resize snaps world bounds and path geometry; strict grid wins over proportional aspect-ratio preservation if both cannot be satisfied. Attached ports keep their host reference and are re-anchored in host-local coordinates to preserve an on-grid world position after host or group movement and resize. Automatic orthogonal routing uses the strict grid for endpoints, waypoints, obstacle envelopes, and every generated bend, including reroutes after obstacle changes. Circular arc geometry remains curve-defined; strict-grid guarantees apply to its straight vertices and do not approximate arcs into grid segments.

`rotateEntities` accepts the same explicit policy through its optional `snap` field. Strict rotation snaps the entity/group world-bounds center (the rotation pivot) to the grid, keeps the requested angle unchanged, and moves the complete host geometry together so attached ports remain bound. Without the option, rotation behavior is unchanged.

```ts
const pointer = createDiagramInteractionController(engine, {
  snap: { enabled: true, gridSize: 10, strictGrid: true },
})

engine.dispatch({
  type: "rotateEntities",
  entries: [{ id: "symbol", rotation: 90 }],
  snap: { gridSize: 10, strictGrid: true },
})
```

`routeOrthogonalConnector(source, target, options)` returns a deterministic orthogonal route and diagnostics. It uses a coordinate-compressed visibility graph over the supplied world-space obstacle bounds (not a raster grid). Obstacles are inflated by `clearance`; `sourceDirection` and `targetDirection` constrain the terminal lead segments, and ordered `waypoints` are hard route constraints. `existingRoutes` are a soft preference: strict crossings are minimized after bend count and total length. The optimization order is collision-free route, endpoint leads and waypoints, fewer bends, shorter length, fewer crossings, then stable coordinate/direction ties. Rotated hosts use their conservative world AABB. An impossible lead/waypoint/obstacle combination returns an empty route with a typed diagnostic; it does not mutate a scene.

For interactive connectors that should be allowed to cross unrelated shapes, select `strategy: "simple"`. It picks from direct, one-bend, two-bend, and direction-constrained route candidates without scanning scene obstacles. When a directionally constrained endpoint is attached to a host, Core still routes around that host so the connector cannot pass through the object it leaves or enters. Existing calls that omit `strategy` keep the legacy obstacle-aware strategy. `beginEdgeCreation()` defaults to simple routing unless the caller explicitly supplies `mode: "auto"`; callers that need full-scene obstacle routing should pass `strategy: "obstacle-aware"` explicitly. The Vue playground's Connector tool opts into simple routing. Simple routes retain exact endpoint coordinates and return an empty path with a diagnostic when hard direction or bend constraints cannot be met.

`routing.mode` describes route ownership. `auto` derives intermediate geometry from the endpoints and options; `manual` stores the route points as user geometry. Dragging a simple automatic segment commits the displayed route as manual geometry in one undoable change. `setEdgeRoute` is the headless command for replacing an orthogonal route: its points are validated and normalized before the command is accepted. `updateEdgeRouting` with `{ mode: "auto", strategy: "simple" }` resets an edge to derived routing. Legacy edges without routing metadata keep their existing point geometry and rendering.

Interactive creation exposes `getSnapshot().edgeCreationPreview`; preview and commit share the same captured endpoint candidates and simple route options. Click-to-place bends remain explicit user geometry; press Enter or call `finishEdgePathCreation()` to finish, and Escape or `cancel()` to discard the transient draft. A direct drag of a simple automatic segment is local geometry editing and does not run obstacle pathfinding. Advanced obstacle-aware routes remain available and keep their existing route invalidation behavior.

```ts
const route = routeOrthogonalConnector(source, target, {
  terminalLead: 12,
  sourceDirection: "east",
  targetDirection: "west",
  clearance: 8,
  waypoints: [{ x: 160, y: 80 }],
  obstacles: [{ id: "device-1", bounds: { x: 100, y: 20, width: 40, height: 80 } }],
})
```

`beginEdgeCreation(id, pointer, routeOptions)` and `beginEdgePathCreation()` use the same route helper for live preview and commit. Their typed preview contains canonical route-order `path` geometry, and committed `DiagramEdge.points` are exactly `path.slice(1, -1)`; terminal leads are only applied at the actual endpoints, never around intermediate waypoints. Existing serialized edges without `routing` remain fixed. Opt a new or existing edge into derived rerouting with `routing: { mode: "auto", clearance, terminalLead, sourceDirection, targetDirection, waypoints, routeHint }`. For auto edges, `routing.waypoints` are the explicit constraints; generated bends in `points` are a serialization fallback and are not fed back as constraints. A host/obstacle edit invalidates and recomputes automatic route geometry. Dragging a segment or route handle promotes the resolved intermediate points to persistent waypoint constraints in one undoable edit. Cancel leaves the scene unchanged.

During a connector creation gesture, the first non-zero endpoint movement fixes the inferred `firstAxis` for that gesture and persists it on an auto-routed edge; pass `firstAxis` explicitly to choose it before moving. The gesture also records one `routing.routeHint` at its first route turn. This is a soft route preference, separate from user `waypoints`: Core routes through it while feasible and retries without it if an obstacle or other constraint makes it impossible. This keeps the chosen side stable without serializing every generated bend as a user constraint. Port capture uses an inner screen-pixel radius (`portTolerancePx`) and holds the captured port until the pointer leaves 1.5 times that radius. When the document changes during a gesture, Core re-resolves the same captured port and route. If that changes the plan, the updated preview exposes `commitBlocked: "document-changed"`; the user must confirm the refreshed plan again. A deleted captured port invalidates the preview instead of silently selecting a neighbor. This hysteresis is gesture state and does not alter ordinary `snapPoint()` selection.

Obstacle candidates are gathered locally for interactive creation through the Core spatial query. The standalone helper accepts the caller's already-filtered obstacle list. Automatic route geometry currently scans scene entity maps when invalidated; it caches the resolved geometry afterward. This first version does not promise collision-free routes around arbitrary non-rectangular geometry: nodes, text, tables, and shapes are treated as conservative AABBs, and a no-route diagnostic preserves the prior committed geometry. Geometric wire crossings only affect the optional route preference and never create electrical connectivity. Connector rounding and crossing-bridge rendering remain separate projection options.

Set `DiagramInteractionSnapOptions.portTolerancePx` to tune connector source/target port capture separately from other snaps. It is measured in screen pixels and converted through the current viewport zoom; when omitted, connector port capture continues to use `tolerancePx` (or its existing default). Alignment, grid, and geometric snap tolerances remain controlled by `tolerancePx`.

Connector endpoints can also attach to an existing connector route. `snapToConnectors` and `connectorTolerancePx` control this independently from port snapping; equal-distance candidates resolve by render order and then stable route iteration order. A successful attachment creates a stable `DiagramJunction`; legacy `{ kind: "route", fraction }` anchors follow normalized route length, while `{ kind: "fixed", point }` anchors pin a world point and become mandatory waypoints on automatic hosts. Fixed anchors on manual hosts must lie on the route; coordinated batch updates may change both. Unreachable fixed anchors reject the scene change atomically. The new edge references the junction as `{ kind: "junction", junctionId }`. This is explicit topology: a geometric crossing alone never creates a junction. The same route-fraction anchor can be used by a `DiagramPort` hosted on an edge (`anchor: { kind: "route", fraction }`). Host route edits resolve these anchors against the updated route. Host deletion cascades through junctions and dependent branches; locked/read-only/non-deletable dependents reject the deletion rather than being detached.

Port ownership is determined by each port's canonical `nodeId` or `hostId`; `node.portIds` is normalized as a compatibility order hint and never changes ownership. `validateDiagramScene()` warns about stale or contradictory node hints while loading retains the port reference. Inserting a path vertex preserves attached vertex ports by shifting their index; moving a vertex keeps the index. Removing an anchored vertex or replacing a path with ambiguous vertex correspondence requires an explicit `portRemaps` entry in the same command. These updates and port positions share one undoable patch.

Use `maxBends` on auto routing to impose a hard cap on generated bends on each routed leg (explicit waypoint corners are excluded). Use `maxRouteBends` for a hard cap on all corners in the complete route, including waypoint turns. If collision-free routing cannot satisfy the cap, Core reports `bend-limit` and connector creation refuses to commit the invalid preview. Port and connector attachments accepted within their screen-space tolerance keep their exact point; ortho and strict-grid settings constrain free endpoints and generated route geometry, not the accepted attachment itself. Strict-grid host movement snaps the host geometry while preserving the existing local port anchor.

```ts
const pointer = createDiagramInteractionController(engine, {
  snap: { snapToConnectors: true, connectorTolerancePx: 10, snapToPorts: true, ortho: true },
})
pointer.beginEdgePathCreation("branch", { id: 1, point: { x: 80, y: 120 } }, {
  mode: "auto", terminalLead: 12, clearance: 8, maxBends: 2,
})
// edgeCreationPreview.source can be a junction endpoint and prospectiveJunctions
// describes the marker. Committing creates the junction and branch in one undo step.
```

For click placement, use `beginPathCreation(id, firstClick, "line")` for a two-click free line or `beginPathCreation(id, firstClick, { closeTolerancePx })` for a free polyline with optional magnetic closure (defaults to snap tolerance or 8px). Read `getSnapshot().pathCreationPreview` while moving; `closing` and `closeTarget` expose a screen-pixel, zoom-aware magnetic close target after two added vertices. The current endpoint snaps to the first vertex, and clicking it commits a closed contour with exact endpoint continuity. Subsequent `pointerDown`/`pointerUp` pairs add vertices; `finishPathCreation()` (Enter) or `clickCount: 2` ends an open path. Holding Shift constrains the live segment to the nearest cardinal direction from the last confirmed vertex; releasing Shift restores free movement. Preview and commit use the same resolved endpoint. `cancel()` (Escape or pointercancel) drops the transient path. The public `createPath` command accepts exactly one non-empty world-space `DiagramPath` representation (`points` or `contours`); Core stores it as a `DiagramShape` with the supplied ID and local-coordinate path data. `contours` support exact line, circular-arc, and cubic segments; adjacent segments must be continuous within 1e-8 world units. `closed` adds the implicit last-to-first segment; `hole` marks a closed interior contour. When loading earlier shapes that contain both `points` and `pathContours`, rendering keeps the existing `pathContours` priority. A path is visual only and never creates electrical connectivity. `beginEdgePathCreation()` similarly starts a connector: clicks add bends and snapping to a port completes the edge; Shift constrains each segment from the latest confirmed bend. `finishEdgePathCreation()` confirms a free target. Its source/target remain `DiagramEdgeEndpoint` references.

### Interactive cubic Bézier drawing

Use `beginBezierCreation(id, firstClick, { closeTolerancePx })` to start a native cubic path draft; the optional close radius is in screen pixels and defaults to the configured snap tolerance (8px by default). Move the pointer to preview the next segment; each later `pointerDown`/`pointerUp` places an anchor, and dragging during that click sets its outgoing tangent in the drag direction, with the incoming tangent mirrored across the anchor. Shift locks that tangent to the nearest cardinal direction. The preview exposes `closing` and `closeTarget` and snaps to the first anchor within the tolerance; click it to close the contour, or call `finishBezierCreation()` (Enter/double-click) to finish an open contour. `getSnapshot().bezierCreationPreview` contains the exact cubic contour, active tangent, and close state; `cancel()` (Escape or pointercancel) discards the whole draft without changing revision or history. Each completed contour is one existing `createPath` history operation, stored as exact `DiagramPathSegment` cubic data and selected after creation.

Selected cubic paths expose anchor and tangent handles through the Vue visible projection. Core `beginBezierHandle(id, contourIndex, segmentIndex, handle, event)` previews an edit and commits the resulting contour with one `updateShapePath` operation on pointerup. Anchors preserve adjacent tangent offsets; incoming/outgoing controls can be moved independently. Existing non-cubic path geometry and serialized documents are unchanged.

For existing orthogonal connectors, `beginEdgeSegmentHandle(edgeId, segmentIndex, pointer)` starts a transient segment drag. The selected segment moves perpendicular to its direction, adjoining bends move with it, and adjacent orthogonal segments stretch. Collinear route sections move as a run. Free endpoints move when included in the run; attached node/port endpoints stay fixed and gain an elbow where required. For simple automatic routes, the local edited polyline becomes manual route geometry on commit; obstacle-aware automatic routes retain the legacy constrained reroute behavior and report `no-route` when the solver cannot satisfy its constraints. `getSnapshot().edgeSegmentPreview` exposes the candidate route. Pointerup commits endpoint and route changes as one atomic undoable operation; cancel leaves scene and history unchanged.

`DiagramPathSegment` also accepts exact cubic Béziers (`start`, `control1`, `control2`, `end`). `parseSvgPathData()` parses the supported SVG-like `M`, `L`, `C`, and `Z` commands into one or more contours. Cubic control points are retained through serialization and transforms; bounds use exact curve extrema and Vue renders native SVG `C` commands. Hit testing uses deterministic adaptive subdivision with a 0.01 world-unit flatness target. Geometry algorithms that do not yet support cubic curves return a typed `unsupported-geometry` result rather than silently converting them to lines.

```ts
const parsed = parseSvgPathData("M 0 0 C 0 100 100 100 100 0 Z")
if (parsed.ok) engine.dispatch({ type: "createPath", path: { id: "contour", kind: "path", contours: parsed.value } })
```

Selected path shapes expose one handle per vertex and selected edges expose handles for intermediate waypoints through the Vue visible projection. Core `beginPathVertexHandle()` and `beginEdgeWaypointHandle()` provide transient previews; pointerup commits one undoable vertex update. For a two-point line endpoint, holding Shift locks the endpoint vector from the stationary opposite end to its nearest cardinal angle. The lock updates when Shift is pressed or released; grid and object snaps are projected along the locked axis, so the preview and commit remain on that angle. Without Shift, the existing free vertex drag remains. `removePathVertex` removes only interior path vertices and refuses to leave fewer than two points. Existing drag creation methods remain unchanged.

Interactive port placement uses the same controller and hit-testing order as other gestures. Call `beginPortCreation(id, pointer, options)` when arming a caller-generated ID; this starts a hover preview without changing the scene. Pointer moves update `getSnapshot().portCreationPreview`. The next pointer down/up commits exactly one `createPort` command, then leaves the `create-port` tool active; arm the next point with another new ID. Escape, `cancel()`, pointercancel, or `setTool()` clears the preview. `hostId` can restrict placement to an already selected host. Otherwise Core picks the topmost node, shape, text, table, or group at the pointer. Line/path vertices are selected within `vertexTolerancePx` screen pixels (defaulting to the controller snap tolerance); farther points project onto the nearest segment and use a local anchor. Other hosts use a clamped host-local point, inverse-transforming rotation and flips. The preview includes the exact world point, host, anchor, and optional `snapResult` used by commit.

```ts
interaction.beginPortCreation("terminal-2", { id: 1, point: cursorWorldPoint }, { hostId: "symbol-1", vertexTolerancePx: 8 })
// On pointer down/up, the active create-port gesture commits one port.
```

### Curved paths and boolean helpers

`createCircularArc(start, through, end)` returns an exact circular `DiagramPathContour`; the through point selects the minor or major sweep. Degenerate or collinear inputs return `{ ok: false, code, message }`. Commit with `dispatch({ type: "createArc", id, start, through, end })`, or create a `DiagramPath` from world-space `contours` with `createPath`. Path contours are stored as optional shape-local data, so old scenes remain valid and move/rotate/flip/clipboard/serialization keep the curve. `pathContourSvg()` and `flattenPathContour()` are exported for renderer use; Core geometry uses exact arc extrema for bounds and flattened curve samples for hit testing.

Geometry tools are deterministic helpers: `intersectLineSegments`, `trimLineByCrossing`, `trimCircleOutsideRect`, `trimAndJoinLines`, `subtractRectFromCircle`, and `trimSelectionByStroke`. First-version Trim/Join accepts strict interior crossings of straight two-point lines; coincident lines, endpoint touches and missing intersections are not split and return a structured failure (or no-op geometry). Circle/rectangle trim returns open exact circular arcs; subtraction returns closed contours and tags an internal rectangle contour with `hole: true`. Subtraction covers non-overlap, full coverage, contained rectangular holes, and partial overlaps. It does not perform general arbitrary polygon boolean operations. Use `updateShapePath` to retain an object's ID/style, and `dispatchBatch` with delete/create commands when joining or removing the cutter; a successful batch is one undo step. No geometric crossing changes `DiagramEdge` connectivity.

### Selection sweep Trim

`trimSelectionByStroke(scene, { targetIds, stroke, tolerance, boundaryIds?, side?, extent? })` is a pure world-geometry helper. It returns one result per explicit target, retained and removed world-space contours, exact cut points, renderer-ready preview shapes, batch-ready `updates`, and typed `findings`. `tolerance` is in world units; convert a screen tolerance with the current zoom before calling. By default, every eligible shape and edge route except the current target can bound it, including other selected targets. `boundaryIds` restricts the candidate set; an ID that is also a target can bound other targets but never itself. DiagramEdges may bound a shape but remain unsupported as trim targets to preserve connectivity. Uncrossed/unchanged targets retain per-target findings without preventing successful targets from being applied. `status` is `applied`, `partial`, `unchanged`, or `rejected`; legacy `ok` continues to indicate input validity, and callers should commit only the returned `updates`. `side` defaults to `"directed"`, preserving the existing behavior that removes toward the left side selected by the stroke segment cross-product. Set `side: "both"` to resolve the nearest eligible transverse boundary in both target traversal directions from every stroke crossing and remove both intervals; both boundaries must resolve unambiguously. `extent` defaults to `"crossing-to-boundary"`; set it to `"beyond-boundary"` to remove the ray tail beyond the resolved boundary, or to `"crossing-side-to-endpoint"` to remove the selected endpoint-to-boundary arm while retaining the opposite arm. The latter mode supports open contours only and reports `unsupported-geometry` for closed contours. `removed` on each changed target contains the exact world-space contours removed, suitable for a red interaction preview. Overlapping removal intervals are merged, and all disjoint retained contours are returned. Intersections are computed against exact line and circular-arc equations; cubic intersections solve the cubic line-distance polynomial by derivative partitioning and at most 48 bisections per monotone interval, then split the curve with exact De Casteljau controls. Duplicate hits within `tolerance` are coalesced deterministically.

Sweep Trim accepts open and closed line/path contours, cubic path segments, circular arcs, and native rectangular outlines. Rotated and flipped paths are evaluated in world space. A simple closed contour with exactly two transverse crossings is split into two intervals; Core removes the interval on the directed stroke's left and returns the retained interval as an open contour, starting at the first cut point in stroke order and following the source contour direction. Closed contours with more than two crossings, tangencies, endpoint hits, overlaps, or uncertain side classification return a typed finding and remain unchanged. A stroke that self-intersects returns `self-intersecting-stroke` for its requested targets. Holes remain unchanged when untouched; if cutting could change a target's fill topology, that target returns a finding and remains unchanged. Ellipses without explicit path contours are unsupported because Core has no exact ellipse segment type.

Rotated and flipped paths are evaluated in world space. Locked/read-only paths, paths hosting ports, unknown IDs, and all `DiagramEdge` objects are unchanged with typed findings. Core never changes edge connectivity. A path with several retained open pieces keeps its original stable ID; style and metadata remain on that object. The result's `updates` can be committed atomically, and `preview` uses the exact canonical geometry written by the command:

```ts
const result = trimSelectionByStroke(engine.serialize(), {
  targetIds: engine.getScene().selection.ids,
  stroke: worldStrokePoints,
  tolerance: 1 / engine.getScene().viewport.zoom,
})
renderTrimPreview(result.targets)
if (result.updates.length) engine.dispatchBatch(result.updates)
// One successful stroke is one history entry; Escape/cancel simply discards this pure result.
```

`updateShapePath` accepts exactly one replacement representation; `worldSpace: true` interprets its points/contours as world coordinates. Core canonicalizes the resulting geometry in world coordinates and clears rotation/flip flags while preserving the exact rendered path, stable ID, metadata, and style. This mode rejects shapes hosting ports so existing connector attachment points cannot move.

Dynamic input is renderer-neutral and operates on the active gesture preview:

```ts
interaction.setDynamicInput({ length: 120, angle: 30 }) // length is world units, angle is degrees
interaction.confirmDynamicInput() // commits through the active gesture's normal command
interaction.cancelDynamicInput() // discards preview and creates no history
```

The interaction snapshot exposes `snapResult`, `snapMarkers`, `snapGuides`, `constraint`, `dynamicInput`, `edgeCreationPreview`, endpoint preview, movement delta, and resize entries. `validateDiagramScene(input)` returns structured validation issues; `previewBatch()` returns the valid draft scene and known changed IDs for AI or other programmatic clients.

The versioned document stores diagram content separately from optional viewport and selection state. `serialize()` and `deserializeScene()` keep their existing legacy scene contract; `transact()` continues replacing the scene and resetting history.

Equal-spacing guides search the nearest compatible neighbor on each side within the existing local search bounds. This replaces the earlier all-pairs candidate search; diagrams with more distant, non-adjacent equal gaps can therefore choose a different guide.

```ts
engine.dispatch({
  type: "updateEntities",
  updates: [{ id: "e1", metadata: { edgeWidth: 3, edgeStyle: "dashed" } }],
})
```

## Clipboard and duplication

Clipboard exports are scene-shaped and safe to persist or pass through app-level clipboard code. Import remaps all ids, offsets nodes/texts/shapes/edge waypoints, and remaps node port ids plus edge endpoints inside the selected subgraph.

```ts
const clipboard = engine.exportSelection()
engine.duplicateSelection({ x: 32, y: 32 })
engine.importClipboard(clipboard, { x: 64, y: 64 })
```

## Text Rendering Contract

Static text is data in core and should be rendered by adapters as SVG `<text>`/`<tspan>` elements in diagram/world coordinates. Core remains renderer-agnostic: it exposes text bounds through geometry, owns `editText` commands/history/serialization, and does not depend on DOM, SVG, Canvas, Vue, or browser globals. DOM is appropriate only for one active editor overlay owned by an adapter.

## Editor commands

```ts
engine.dispatch({ type: "resizeEntities", entries: [{ id: "n1", width: 160, height: 80 }] }) // node-relative ports scale with the node
engine.dispatch({ type: "insertEdgeWaypoint", id: "e1", index: 0, point: { x: 240, y: 120 } })
engine.dispatch({ type: "moveEdgeWaypoint", id: "e1", index: 0, point: { x: 260, y: 140 } })
engine.dispatch({ type: "removeEdgeWaypoint", id: "e1", index: 0 })
engine.dispatch({ type: "bringForward", ids: ["n1"] })
engine.dispatch({ type: "setLayer", ids: ["n1"], layer: "equipment", layerRole: "normal" })
engine.dispatch({ type: "rotateEntities", entries: [{ id: "n1", rotation: 90 }] }) // geometry exposes rotated bounds/corners
engine.dispatch({ type: "rotateEntities", entries: [{ id: "free-edge", rotation: 90 }] }) // rotates a free edge route around its geometry center
engine.dispatch({ type: "rotateEntities", entries: [{ id: "g1", rotation: 90 }] }) // rotates the group around its shared bounds center
engine.dispatch({ type: "flipEntities", axis: "horizontal" }) // uses current selection; horizontal mirrors left/right
engine.dispatch({ type: "flipEntities", ids: ["n1", "n2"], axis: "vertical" }) // vertical mirrors top/bottom around shared bounds center
engine.dispatch({ type: "alignEntities", ids: ["n1", "n2"], edge: "left" })
```

Flips are undoable, preserve entity IDs, and serialize as `flipX`/`flipY` state on nodes, shapes, text, and tables. A single object reflects around its own center; multiple selected IDs or a selected group reflect around their combined geometry bounds. Node ports keep their node-relative coordinates but resolve to mirrored anchors. Shape and text orientation follows the reflected object. A table mirrors its cell layout while keeping row/column IDs and editing indices stable. Edges keep node/port endpoint references; free endpoints and waypoints reflect around the selection center. An edge with only attached endpoints and no waypoints has no independent geometry to flip, so it is unchanged when selected alone. Vue's `getSvgEntityProps()` includes flip transforms for renderer projections; custom renderers should honor `DiagramGeometry.flipX` and `flipY`.

`rotateEntities` accepts free `DiagramEdge` routes whose source and target are both point endpoints. Core rotates both endpoints and all waypoints around the route bounds center, records the cumulative edge `rotation`, preserves the edge ID and current selection, and includes the update in normal undo/redo. Edges with node or port endpoint references are not directly rotatable, so those attachments cannot drift. A connected edge can rotate as a group member: Core rotates its free point endpoints and waypoints around the group center while retaining node/port references. Include referenced hosts in the group when their geometry should rotate with that route; the references remain attached either way. Edge geometry exposes oriented `corners` for free, straight two-point routes; multi-waypoint and connected routes do not claim a single aligned frame.

Entities can be marked with metadata constraints. `locked` and `readOnly` entities cannot move, resize, or delete; `nonDeletable` entities can move but cannot be deleted. Front/back commands write `metadata.zIndex` so render order can cross entity kinds. Background layers are excluded from default render ordering unless explicitly requested.

For temporary scene-wide protection (for example, while an application applies an authoritative server snapshot), call `engine.setEditingLocked(true)`. Core rejects user `dispatch`, `dispatchBatch`, `previewBatch`, undo/redo, and interaction commits while locked; an active transient gesture is cancelled. `engine.transact()` remains available for authoritative scene replacement and does not clear the lock. Call `setEditingLocked(false)` when editing can resume. The lock is runtime interaction state, not serialized document content.

## Pointer resize gestures

Adapters that use the headless interaction controller should start resize handles through core instead of calculating resize deltas in the renderer. Core owns capability checks, transient preview state, and the final history command.

```ts
const interaction = createDiagramInteractionController(engine)

interaction.beginResizeHandle("n1", "se", pointerEvent)
interaction.beginResizeSelectionHandle("se", pointerEvent)
const preview = interaction.getSnapshot().resizePreview
const entries = interaction.getSnapshot().resizePreviewEntries
interaction.beginTableResizeHandle("notes", "column", 0, pointerEvent)
const tablePreview = interaction.getSnapshot().tableResizePreview
// Pointer-up commits the selected command once; cancel discards either preview.
```

`resizePreview` is intentionally transient: it lets SVG render live dimensions without mutating serialized scene state on every pointer move. The public resize handles are `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, and `w`. Side handles change only their corresponding dimension and keep the opposite side centered and anchored; corner handles keep the opposite corner anchored. Deltas follow entity-local axes through rotation and flips. Multi-selection resize uses group bounds and emits one preview entry per resizable selected entity.

Holding Shift during a corner resize preserves the original aspect ratio. Holding Alt/Option resizes symmetrically around the original bounds center; with Shift, the centered resize also preserves aspect ratio. Side handles always change one dimension only. Modifiers are read on each pointer event, so changing them during a drag updates the preview and the same geometry is committed on pointer up. When grid snapping is configured, resized dimensions snap to the grid. With strict grid and Alt, the original center remains fixed even if that puts a resulting bound between grid lines. Escape or pointer cancellation discards the preview; pointer up commits one undoable resize.

Selected edge endpoints use `beginEdgeEndpointHandle(id, endpoint, event)`. The controller publishes an `edgeEndpointPreview` on scheduled frames and `getPreviewGeometry(id)` returns the previewed route without changing the scene. Pointer up commits one undoable `moveEdgeEndpoint`; cancel discards the preview.

Holding Shift while dragging an endpoint projects the vector from the stationary opposite endpoint to the nearest cardinal angle (0°, 90°, 180°, or 270°), preserving its length. After the pointer moves 4 screen pixels, the angle stays latched until Shift is released; pressing Shift again chooses a new angle from the current pointer position relative to the stationary endpoint. Port, alignment, and grid snapping preserve the cardinal angle. Orthogonal routes remain orthogonal as the endpoint-adjacent waypoint adjusts. Preview and final command use the same geometry. Selection drags retain their dominant-axis latch behavior.

Selection changes are transient UI state and are not recorded in undo history. Selection clicks change selection only. Core activates a move after the pointer travels at least 4 screen pixels; below that threshold it does not snap, publish a movement preview, or dispatch `moveEntities`. Once activated, selection drags snap by default to ports, alignments, and equal spacing. Configure grid spacing and screen-space tolerance when creating the controller; the tolerance is converted to world units using the viewport zoom. The `snapGuides` snapshot field contains world-space line segments for active alignment and equal-spacing matches. Set `enabled: false` to disable drag snapping. Moving a selected edge translates free endpoints and route points while preserving node/port endpoint attachments.

Holding Shift during a selection drag constrains the group to the dominant axis from the gesture origin (horizontal wins an exact tie). After the pointer moves 4 screen pixels, the axis stays latched until Shift is released; pressing Shift again chooses from the current gesture direction. The constraint applies to the frame-batched preview and the committed delta, and snapping stays on that axis. Shift-click continues to add or toggle selection. Direct `snapTranslation()` callers can set `axisConstraint: "x" | "y"` to apply the same axis-aware port, alignment, equal-spacing, and grid snapping.

```ts
const interaction = createDiagramInteractionController(engine, {
  snap: { gridSize: 16, tolerancePx: 8, snapToPorts: true, snapToAlignment: true, snapToEqualSpacing: true, angleIncrement: 45 },
})
```

## Keyboard and capability helpers

Adapters should use command helpers and capability checks so UI buttons do not guess state from selection alone.

```ts
engine.canUndo()
engine.canRedo()
engine.canDelete()
engine.canMove()
engine.canResize()
engine.canRotate()
engine.canAlign()
engine.canEditText("t1")
engine.canPaste(clipboard)

engine.dispatchKeyboardCommand("nudge-right", { step: 8, largeStep: 32, shiftKey: event.shiftKey })
engine.dispatchKeyboardCommand("delete")
engine.dispatchKeyboardCommand("escape")
engine.dispatchKeyboardCommand("undo")
engine.dispatchKeyboardCommand("redo")
```


## Query and search

Use `queryEntities()` for headless search/filter plumbing. It returns ids in render order and can filter by entity kind, world bounds, text/id/simple metadata, port inclusion, and limit. UI state such as input focus, debounce, current match index, and highlighted styling belongs in the adapter or app. Domain predicates such as SLD equipment class or IEC paths should stay in metadata/app code.

```ts
const matches = engine.queryEntities({
  kinds: ["node", "text"],
  text: "bay",
  metadata: { status: "warning" },
  limit: 20,
})
```

## Selection and viewport helpers

Pointer adapters can use additive, toggle, and replace selection modes. Marquee selection uses strict containment by default; pass `marqueeMode: "intersect"` only when partially intersecting objects should be selected.

```ts
engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" }, mode: "replace" })
engine.dispatch({ type: "setSelection", selection: { ids: ["n2"], primaryId: "n2" }, mode: "add" })
engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" }, mode: "toggle" })

engine.fitSelection(32)
engine.fitBounds({ x: 0, y: 0, width: 500, height: 300 }, 24)
engine.fitScene(48)
```

Fit helpers preserve the viewport screen size invariant: `viewport.width * viewport.zoom` and `viewport.height * viewport.zoom` stay stable, while world bounds and zoom change together. DOM label layers should use the same `viewport.zoom` as SVG overlays.

Viewport is presentation state, not document content. `setViewport`, interaction-controller pan, zoom, `fitBounds`, `fitSelection`, and `fitScene` update and serialize the current view but never add to or clear undo/redo history. Undo and redo affect document commands only and preserve the current viewport. Selection changes follow the same non-historical rule. This also applies when viewport or selection commands are included in `dispatchBatch()`; only document edits in the batch are recorded.

```ts
engine.dispatch({ type: "setViewport", viewport: { x: 120, y: 40, zoom: 1.5 } })
// The scene renders and serializes with this viewport; the document undo stack is unchanged.
```

## Diagnostics

```ts
const diagnostics = engine.getDiagnostics()
// { visibleQueryCount, entityQueryCount, hitTestCount, geometryRecomputeCount, lastCommandMs }
```

Use `BENCH_DIAGRAM_ENTITY_COUNTS=100,1000,10000 BENCH_OUTPUT_JSON=/tmp/diagram-routing-bench.json pnpm --filter @affino/diagram-core bench` after building to measure the indexed local-obstacle query plus visibility-graph route solve at three scene sizes. The benchmark uses 20 warmups and 100 samples and reports p50/p95 and candidate count alongside the existing engine metrics. Candidate filtering is spatial-index-backed in the pointer controller; auto-route geometry is cached and only rerouted when an endpoint dependency or an obstacle whose previous/current bounds intersect the route bounds changes. The visibility graph's cost depends on the local obstacle count, not a fixed world-space grid resolution.

On Node 24.21.0 in the current workspace run (one local obstacle; route scene contains the indicated background entity count), candidate query + solve measured:

| Scene entities | Local obstacles | p50 | p95 |
| ---: | ---: | ---: | ---: |
| 100 | 1 | 0.012 ms | 0.036 ms |
| 1,000 | 1 | 0.015 ms | 0.022 ms |
| 10,000 | 1 | 0.013 ms | 0.014 ms |

These figures validate that indexed candidate filtering remains bounded as unrelated scene size grows; they do not benchmark dense local obstacle clusters.

## Viewport contract

- `x`/`y` are the world coordinate of the top-left visible point.
- `width`/`height` are visible world units, not CSS pixels. `zoom` is CSS pixels per world unit; the rendered stage size is `width * zoom` by `height * zoom`.
- Use `screenToWorld`, `worldToScreen`, `zoomViewportAt`, and `zoomViewportCentered` for camera math. Fit preserves the CSS stage-size invariant.
- Empty or degenerate bounds are clamped to finite values.

Use `clampViewportToBounds(viewport, constraints)` after zooming or restoring a saved camera when the document has a finite page. Bounds and the optional margin are in world units. The viewport origin is clamped on each axis; when its visible world extent is larger than the page plus margins, that axis is centered on the page.

```ts
import { clampViewportToBounds, zoomViewportAt } from "@affino/diagram-core"

const page = { bounds: { x: 0, y: 0, width: 794, height: 1123 }, margin: 80 }
const zoomed = zoomViewportAt(engine.getScene().viewport, 1.5, { x: 400, y: 300 })
const bounded = clampViewportToBounds(zoomed, page)
```

Pass the same `viewportConstraints` to `createDiagramInteractionController()` to constrain pan preview and commit with one effective delta.

Persist `viewport` with the scene. Restore it before attaching the adapter; without viewport constraints, a resize only updates world extent and never changes `x`, `y`, or `zoom`.

## Retained group transforms

Groups created with `groupEntities` own their translation, rotation, reflection, and `transformOrigin`. Their children are converted to group-local coordinates once when grouping; later group transforms leave child-local geometry unchanged. Groups can contain other groups. `getGeometrySnapshot()` returns world-space bounds and a `parentTransform` for flat renderers. The headless engine also exposes `getParentGroupId()`, `getGroupChildren()`, `resolveLocalTransform()`, `resolveWorldTransform()`, `localToWorld()`, and `worldToLocal()`.

For backward compatibility, a serialized group without `x` and `y` is treated as a legacy group with already-baked child geometry. Safe hierarchies normalize to retained identity groups without changing child coordinates. Groups with descendant attached routes remain on the deprecated compatibility path because those routes and their endpoints are resolved in document coordinates. New group serialization writes `x` and `y`; see the [deprecation inventory](../../docs/diagram-hierarchy-deprecations.md). Relative pivots resolve from stable group-local bounds, excluding the group's own transform.

The current group model supports rigid affine transforms (translation, rotation, and reflection). Affine group scaling is not implemented; retained groups therefore reject group resize rather than resizing every child. Free connectors with manually stored points can be grouped; their points become group-local once. Edges with attached endpoints cannot be grouped or reparented because routes/endpoints are world-resolved. Automatic routes also cannot be reparented. Cardinal group rotations preserve orthogonality; non-cardinal rotations that would make descendant orthogonal routes diagonal are rejected. Connectors whose endpoint host lies outside a transformed group continue resolving that host in world space and are not themselves group-transformed. Ungroup composes retained transforms into child transforms and rejects non-representable transforms. Group-owned ports require an explicit `portRemaps` entry on ungroup; without one, ungroup is rejected rather than detaching endpoint references. Group-owned port local anchors may lie outside descendant bounds after children are removed, so deleting the final child is rejected if that would leave an owned port without a valid host geometry.

The Vue SVG/DOM adapters consume Core's `parentTransform`. External flat renderers should apply this matrix before each object's local rotation/reflection. `parentTransform` is the ancestor transform only, except for non-inheriting text policies, where Core resolves glyph orientation into that matrix while retaining the transformed text anchor.
