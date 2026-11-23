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

### Atomic graph edits and documents

`dispatchBatch()` applies commands against a draft in order and publishes one change and one undo entry only after every command succeeds. Set `expectedRevision` to `getDocumentRevision()` to reject stale document edits. Viewport and selection changes do not advance that revision. A rejected result contains `failedCommandIndex`, `reason`, and known `affectedIds`; the scene, subscribers, and undo/redo stacks remain untouched.

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
engine.dispatch({ type: "alignEntities", ids: ["n1", "n2"], edge: "left" })
```

Entities can be marked with metadata constraints. `locked` and `readOnly` entities cannot move, resize, or delete; `nonDeletable` entities can move but cannot be deleted. Front/back commands write `metadata.zIndex` so render order can cross entity kinds. Background layers are excluded from default render ordering unless explicitly requested.

## Pointer resize gestures

Adapters that use the headless interaction controller should start resize handles through core instead of calculating resize deltas in the renderer. Core owns capability checks, transient preview state, and the final history command.

```ts
const interaction = createDiagramInteractionController(engine)

interaction.beginResizeHandle("n1", "se", pointerEvent)
interaction.beginResizeSelectionHandle("se", pointerEvent)
const preview = interaction.getSnapshot().resizePreview
const entries = interaction.getSnapshot().resizePreviewEntries
// Render previews when present, then pointer up commits one resizeEntities history entry.
```

`resizePreview` is intentionally transient: it lets SVG render live dimensions without mutating serialized scene state on every pointer move. Drag deltas are mapped through entity rotation and the opposite rotated corner stays anchored, so handles follow the local resize axes exposed by rotated geometry. Multi-selection resize uses group bounds and emits one preview entry per resizable selected entity.

Selected edge endpoints use `beginEdgeEndpointHandle(id, endpoint, event)`. The controller publishes an `edgeEndpointPreview` on scheduled frames and `getPreviewGeometry(id)` returns the previewed route without changing the scene. Pointer up commits one undoable `moveEdgeEndpoint`; cancel discards the preview.

Selection drags snap by default to ports, alignments, and equal spacing. Configure grid spacing and screen-space tolerance when creating the controller; the tolerance is converted to world units using the viewport zoom. The `snapGuides` snapshot field contains world-space line segments for active alignment and equal-spacing matches. Set `enabled: false` to disable drag snapping. Moving a selected edge translates free endpoints and route points while preserving node/port endpoint attachments.

```ts
const interaction = createDiagramInteractionController(engine, {
  snap: { gridSize: 16, tolerancePx: 8, snapToPorts: true, snapToAlignment: true, snapToEqualSpacing: true },
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

Persist `viewport` with the scene. Restore it before attaching the adapter; a resize only updates world extent and never changes `x`, `y`, or `zoom`.
