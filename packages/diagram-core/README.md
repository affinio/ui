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

### Rectangle corner radius

`DiagramShape.cornerRadius` is an optional world-unit radius for `shape: "rect"`; omission is equivalent to `0`. A radius must be finite and in `0..min(width,height)/2`. Non-rectangular shapes accept only `0` (or an omitted radius). Update it through one undoable command:

```ts
engine.dispatch({ type: "updateShape", id: "housing", cornerRadius: 8 })
```

The field is part of normal scene/document serialization and clipboard copies. A direct resize command that would make the stored radius exceed half the new smaller side is rejected; pointer-handle resizing clamps its minimum size to preserve the radius. Set a smaller radius first to permit tighter resizing. Geometry snapshots expose `cornerRadius` for renderers. Core hit testing continues to use the rectangle bounds, so rounded visual corners do not remove the rectangular hit area.

Shapes can also be created through an undoable command. A `line` shape stores its endpoints as `(x, y)` and `(x + width, y + height)`; negative direction is represented by `flipX`/`flipY` while width and height remain non-negative.

```ts
engine.dispatch({ type: "createShape", shape: { id: "guide", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 40 } })
```

### Groups

Groups are structural scene entities with stable IDs and ordered `childIds`. Group only existing, ungrouped nodes, edges, texts, shapes, or tables; ports cannot be direct children because they follow their owning node. Nested groups are rejected with a `TypeError` during scene construction, `transact()`, and deserialization.

```ts
engine.dispatch({ type: "groupEntities", id: "g1", ids: ["n1", "n2"] })
engine.dispatch({ type: "moveEntities", ids: ["g1"], delta: { x: 24, y: 0 } })
engine.dispatch({ type: "resizeEntities", entries: [{ id: "g1", x: 0, y: 0, width: 240, height: 128 }] })
engine.dispatch({ type: "ungroupEntities", ids: ["g1"] })
```

Group and ungroup commands participate in undo/redo. `serialize()`, `DiagramSceneInput`, and `DiagramDocument` preserve groups and their members. Copy, paste, and duplicate remap group and member IDs together; edges between copied nodes retain their remapped port references. Deleting a group deletes its members and dependent ports/edges. Ungrouping removes only the group and keeps child IDs and geometry.

`engine.canRotate()` returns true for a selected group when all children are rotatable and unlocked. `rotateEntities` accepts the group ID with an absolute target angle in degrees; Core rotates every child around the current shared bounds center and stores that target in `DiagramGroup.rotation`. Nodes, shapes, text, and tables update their position and orientation; tables expose the same optional `rotation` field. Edge waypoints and free endpoints rotate while node/port endpoint references stay attached and follow rotated owners. Undo/redo restores group and member state without changing IDs. All current groupable kinds (node, edge, text, shape, table) participate; ports follow nodes and remain invalid direct group children.

### Visual tables

`DiagramTable` is a plain text table object, not a spreadsheet. It stores a stable ID, world bounds, cells, row/column sizes, per-cell alignment, table-level grid/border styles, and an optional title header. Missing cell content defaults to empty text; omitted row and column sizes are initialized evenly. Tables are included in scene/document serialization, render order, hit testing, selection, move/resize, z-order, history, batch commands, copy/paste, duplicate, and delete.

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

`header` is omitted on legacy tables. When present, its `height` is a positive world-unit band above the data grid. `horizontalAlign` and `verticalAlign` are optional (`left`/`center`/`right` and `top`/`middle`/`bottom`); omitted vertical alignment renders as `middle`. Update these fields through `updateTableHeader`, which is undoable and preserved by serialization. The existing `table.y` and `table.height` continue to describe the grid body, while geometry bounds, hit testing, selection, and outer-border rendering include the header band. Resizing the whole table scales the header band and data rows proportionally; row/column edit commands affect only data cells. `getDiagramTableCellAt()` returns `null` for the header region and maps grid points through the table rotation/reflection. Header text may be empty; clearing the title is explicit with `header: null`. Existing scene/document format version 1 accepts both old tables without headers and new tables with headers.

Cell edits are dispatched as one `updateTableCell` command. The Vue adapter keeps keystrokes in a local active editor and commits once on Enter, blur, or cell navigation; Escape discards the draft.

Vue table row and column boundary gestures use `DiagramInteractionController.beginTableResizeHandle(id, axis, index, pointer)`. The index identifies the row/column on the leading side of a boundary. `getSnapshot().tableResizePreview` exposes transient sizes and outer bounds without changing serialization, revision, or history. Pointer-up applies one existing `resizeTableRow`/`resizeTableColumn` command; cancel drops the preview. Pointer deltas are mapped into table-local axes, including rotated tables. Active-cell position (`DiagramTableCellPosition`) is adapter UI state and is intentionally absent from Core scene/document serialization.

### Atomic graph edits and documents

`dispatchBatch()` applies commands against a draft in order and publishes one change and one undo entry only after every command succeeds. Set `expectedRevision` to `getDocumentRevision()` to reject stale document edits. Viewport and selection changes do not advance that revision. A rejected result contains `failedCommandIndex`, `reason`, and known `affectedIds`; the scene, subscribers, and undo/redo stacks remain untouched.

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

Legacy `radius` in `snapPoint()` remains in world units. New callers should use `tolerancePx`. Use `origin` for polar constraints; angular projection preserves vector length from that origin. `ortho` is a 90-degree angular constraint. Selection movement and endpoint edits apply configured grid/object snaps and angle constraints to transient previews, then commit those resolved coordinates.

`routeOrthogonalConnector(source, target, { terminalLead, firstAxis })` returns stable waypoints plus diagnostics when terminal leads overlap. It creates a local orthogonal route only; it does not promise obstacle avoidance. `beginEdgeCreation(id, pointer, routeOptions)` provides a frame-batched route preview and commits one `createEdge` command. `beginLineCreation(id, pointer)` provides a snapped transient line-shape preview and commits one `createShape` command. Ports are retained as endpoint references when snapped for connectors. Endpoint reattachment during endpoint dragging is opt-in with `snap.endpointMode: "reattach"`; the default keeps the existing free-point editing contract.

Set `DiagramInteractionSnapOptions.portTolerancePx` to tune connector source/target port capture separately from other snaps. It is measured in screen pixels and converted through the current viewport zoom; when omitted, connector port capture continues to use `tolerancePx` (or its existing default). Alignment, grid, and geometric snap tolerances remain controlled by `tolerancePx`.

For click placement, use `beginPathCreation(id, firstClick, "line")` for a two-click free line or `beginPathCreation(id, firstClick)` for a free polyline. Read `getSnapshot().pathCreationPreview` while moving; subsequent `pointerDown`/`pointerUp` pairs add vertices, while `finishPathCreation()` (Enter) or `clickCount: 2` ends the path. Holding Shift constrains the live segment to the nearest cardinal direction from the last confirmed vertex; releasing Shift restores free movement. Preview and commit use the same resolved endpoint. `cancel()` (Escape or pointercancel) drops the transient path. The public `createPath` command accepts world-space `DiagramPath` vertices; Core stores the result as a line `DiagramShape` with local-coordinate `points`, preserving the existing scene schema. A path is visual only and never creates electrical connectivity. `beginEdgePathCreation()` similarly starts a connector: clicks add bends and snapping to a port completes the edge; Shift constrains each segment from the latest confirmed bend. `finishEdgePathCreation()` confirms a free target. Its source/target remain `DiagramEdgeEndpoint` references.

### Interactive cubic Bézier drawing

Use `beginBezierCreation(id, firstClick, { closeTolerancePx })` to start a native cubic path draft; the optional close radius is in screen pixels and defaults to the configured snap tolerance (8px by default). Move the pointer to preview the next segment; each later `pointerDown`/`pointerUp` places an anchor, and dragging during that click sets its incoming tangent with a mirrored outgoing tangent. Shift locks that tangent to the nearest cardinal direction. Click the first anchor to close the contour, or call `finishBezierCreation()` (Enter/double-click) to finish an open contour. `getSnapshot().bezierCreationPreview` contains the exact cubic contour and active tangent; `cancel()` (Escape or pointercancel) discards the whole draft without changing revision or history. Each completed contour is one existing `createPath` history operation, stored as exact `DiagramPathSegment` cubic data and selected after creation.

Selected cubic paths expose anchor and tangent handles through the Vue visible projection. Core `beginBezierHandle(id, contourIndex, segmentIndex, handle, event)` previews an edit and commits the resulting contour with one `updateShapePath` operation on pointerup. Anchors preserve adjacent tangent offsets; incoming/outgoing controls can be moved independently. Existing non-cubic path geometry and serialized documents are unchanged.

For existing orthogonal connectors, `beginEdgeSegmentHandle(edgeId, segmentIndex, pointer)` starts a transient segment drag. The selected segment moves perpendicular to its direction, adjoining bends move with it, and adjacent orthogonal segments stretch. Collinear route sections move as a run. Free endpoints move when included in the run; attached node/port endpoints stay fixed and gain an elbow where required. `getSnapshot().edgeSegmentPreview` exposes the resolved full route. Snapping is constrained to the segment movement axis, and pointerup commits the preview as one atomic undoable operation; cancel leaves scene and history unchanged.

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

`trimSelectionByStroke(scene, { targetIds, stroke, tolerance })` is a pure world-geometry helper. It returns one result per explicit target, retained world-space contours, exact cut points, renderer-ready preview shapes, batch-ready `updates`, and typed `findings`. `tolerance` is in world units; convert a screen tolerance with the current zoom before calling. The directed stroke removes the side to its left according to the segment cross-product sign. Intersections are computed against exact line and circular-arc equations; cubic intersections solve the cubic line-distance polynomial by derivative partitioning and at most 48 bisections per monotone interval, then split the curve with exact De Casteljau controls. Duplicate hits within `tolerance` are coalesced deterministically.

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

`updateShapePath` accepts `worldSpace: true` for the batch updates returned by this helper. Core canonicalizes the resulting geometry in world coordinates and clears rotation/flip flags while preserving the exact rendered path, stable ID, metadata, and style. This mode rejects shapes hosting ports so existing connector attachment points cannot move.

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
engine.dispatch({ type: "rotateEntities", entries: [{ id: "g1", rotation: 90 }] }) // rotates the group around its shared bounds center
engine.dispatch({ type: "flipEntities", axis: "horizontal" }) // uses current selection; horizontal mirrors left/right
engine.dispatch({ type: "flipEntities", ids: ["n1", "n2"], axis: "vertical" }) // vertical mirrors top/bottom around shared bounds center
engine.dispatch({ type: "alignEntities", ids: ["n1", "n2"], edge: "left" })
```

Flips are undoable, preserve entity IDs, and serialize as `flipX`/`flipY` state on nodes, shapes, text, and tables. A single object reflects around its own center; multiple selected IDs or a selected group reflect around their combined geometry bounds. Node ports keep their node-relative coordinates but resolve to mirrored anchors. Shape and text orientation follows the reflected object. A table mirrors its cell layout while keeping row/column IDs and editing indices stable. Edges keep node/port endpoint references; free endpoints and waypoints reflect around the selection center. An edge with only attached endpoints and no waypoints has no independent geometry to flip, so it is unchanged when selected alone. Vue's `getSvgEntityProps()` includes flip transforms for renderer projections; custom renderers should honor `DiagramGeometry.flipX` and `flipY`.

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

Holding Shift during a corner resize preserves the original aspect ratio. Side handles always change one dimension only, including while Shift is held. The modifier is read on each pointer event, so pressing or releasing Shift updates the scheduled preview and the same geometry is committed on pointer up. When grid snapping is configured, the resized dimension snaps to the grid. Escape or pointer cancellation discards the preview; pointer up commits one undoable resize.

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

Use `pnpm --filter @affino/diagram-core bench` after building to refresh `artifacts/performance/bench-diagram-core.json` and watch visible query, entity search/query, clipboard, routing, resize, fit, and command latency metrics.

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
