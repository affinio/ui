# @affino/diagram-core

Framework-neutral diagram state, geometry, command, history, selection, viewport, and serialization engine. Vue, React, or canvas adapters should call core commands instead of reimplementing movement, hit testing, undo/redo, clipboard, or viewport math.

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
engine.dispatch({ type: "insertEdgeWaypoint", edgeId: "e1", index: 0, point: { x: 240, y: 120 } })
engine.dispatch({ type: "moveEdgeWaypoint", edgeId: "e1", index: 0, point: { x: 260, y: 140 } })
engine.dispatch({ type: "removeEdgeWaypoint", edgeId: "e1", index: 0 })
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
const preview = interaction.getSnapshot().resizePreview
// Render preview when present, then pointer up commits one resizeEntities history entry.
```

`resizePreview` is intentionally transient: it lets SVG render live dimensions without mutating serialized scene state on every pointer move. Drag deltas are mapped through entity rotation so handles follow the local resize axes exposed by rotated geometry.

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
