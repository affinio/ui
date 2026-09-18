# Diagram Packages

`@affino/diagram-core` and `@affino/diagram-vue` provide a framework-separated diagram stack. Core owns state, geometry, hit testing, commands, history, spatial indexes, interaction state, snapping, and serialization. Vue owns refs, lifecycle cleanup, DOM pointer events, viewport resize, and render lists.


The public core API is intentionally a single `createDiagramEngine()` facade. Internal ownership is split behind services for scene state/snapshots, history, geometry caching, spatial indexes, viewport fit math, and clipboard subgraph import/export; keep further command extraction behind that facade so adapters do not depend on internals.

## Core Example

```ts
import { createDiagramEngine } from "@affino/diagram-core"

const engine = createDiagramEngine({
  nodes: [{ id: "bay-a", kind: "node", x: 0, y: 0, width: 160, height: 80 }],
  ports: [{ id: "bay-a-out", kind: "port", nodeId: "bay-a", x: 160, y: 40 }],
  viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 },
})

engine.dispatch({ type: "moveNode", id: "bay-a", delta: { x: 24, y: 0 } })
const visibleIds = engine.queryVisible(engine.getScene().viewport)
const matches = engine.queryEntities({ kinds: ["node", "text"], text: "bay", limit: 20 })
const hit = engine.hitTest({ x: 30, y: 20 })
```

## Vue Example

```ts
import { useDiagramEngine, useDiagramSelection, useDiagramVisibleEntities } from "@affino/diagram-vue"

const diagram = useDiagramEngine(initialScene)
const selection = useDiagramSelection(diagram)
const visible = useDiagramVisibleEntities(diagram, { overscan: 200 })

selection.setSelection(["bay-a"], "bay-a")
```

Render `visible.projection.value.edges`, `nodes`, `ports`, `shapes`, and `texts` in SVG. Render static texts as SVG `<text>`/`<tspan>` elements in diagram/world space. Use a single shared DOM overlay only for the active text editor, plus DOM overlays for context menus, floating toolbars, popovers, and form-like UI. Context menus and floating toolbars should anchor to `overlayAnchors`, with one shared overlay instance rather than one subtree per entity.

## Core Editor APIs

Core now owns the editor-level operations that wrappers need for production diagram UX:

- Clipboard: `exportSelection()`, `importClipboard()`, and `duplicateSelection()` export selected subgraphs, remap ids on import, preserve internal edge endpoints, and offset pasted geometry.
- Ordering and layers: `bringForward`, `sendBackward`, `bringToFront`, `sendToBack`, `setLayer`, and `getRenderOrder()` provide deterministic render ordering plus background/normal/foreground layer roles; front/back commands use entity `metadata.zIndex` so nodes, edges, shapes, ports, and text can be ordered across kinds.
- Geometry edits: `resizeEntities` updates nodes, shapes, and texts, and scales node-relative ports with resized nodes; `insertEdgeWaypoint`, `moveEdgeWaypoint`, and `removeEdgeWaypoint` cover baseline polyline/orthogonal edge editing. `rotateEntities` and `alignEntities` are core commands because they share history, locks, diagnostics, geometry invalidation, and serialization rules; rotated nodes/shapes/texts expose rotated bounds/corners for hit testing and adapter handles. Vue should expose toolbar controls that dispatch those commands.
- Resize gestures: adapters can call `createDiagramInteractionController(...).beginResizeHandle(id, handle, event)` for `nw`, `ne`, `se`, and `sw` handles. Core maps pointer deltas through entity rotation, anchors the opposite rotated corner, exposes transient `resizePreview`/`resizePreviewEntries` in the interaction snapshot, leaves the persisted scene unchanged during drag, then commits one `resizeEntities` history entry on pointer up. Multi-selection adapters should use `beginResizeSelectionHandle()` for group bounds resizing.
- Keyboard helpers: `dispatchKeyboardCommand()` covers arrow nudge, shift-nudge, delete, escape, undo, and redo so adapters do not duplicate command semantics.
- Selection modes: `setSelection` supports `replace`, `add`, and `toggle`; pointer interaction uses strict containment marquee by default and can opt into intersecting marquee.
- Constraints: entity metadata can mark objects as `locked`, `readOnly`, or `nonDeletable`; capability checks (`canUndo`, `canRedo`, `canDelete`, `canMove`, `canResize`, `canRotate`, `canAlign`, `canEditText`, `canPaste`) expose the same rules to UI.
- Queries: `queryEntities()` provides renderer-agnostic filtering by kind, world bounds, text/id/simple metadata, port inclusion, and limit while preserving render order; Vue search panels should use it instead of scanning scene maps.
- Viewport: `fitSelection()`, `fitBounds()`, and `fitScene()` centralize fit math in core and preserve `width * zoom` / `height * zoom` screen-size invariants for SVG and DOM overlay alignment.
- Diagnostics: `getDiagnostics()` reports visible query count, entity query count, hit-test count, geometry recompute/read counts, and last command cost for demos and perf gates.

```ts
const clipboard = engine.exportSelection()
engine.importClipboard(clipboard, { x: 48, y: 48 })
engine.dispatch({ type: "resizeEntities", entries: [{ id: "bay-a", width: 180, height: 90 }] })
interaction.beginResizeHandle("bay-a", "se", pointerEvent)
engine.dispatch({ type: "insertEdgeWaypoint", edgeId: "line-a", index: 0, point: { x: 320, y: 140 } })
engine.dispatchKeyboardCommand("nudge-right", { step: 8, largeStep: 32, shiftKey: event.shiftKey })
const found = engine.queryEntities({ kinds: ["node", "text"], text: "bay", metadata: { status: "warning" } })
engine.fitSelection(32)
const canDelete = engine.canDelete()
const diagnostics = engine.getDiagnostics()
```

## Ownership Rules

- Do not put SLD, switchgear, IEC 61850 paths, or persistence state in diagram core. Store domain meaning in metadata and interpret it in an adapter package.
- Do not rebuild visible lists in Vue with full scene `map`/`filter` on pan. Use `useDiagramVisibleEntities()`, which calls `engine.queryVisible()`.
- Do not implement text geometry, snapping, undo/redo, hit testing, or command semantics in Vue components. Dispatch core commands or call core queries.
- Selected entities are included in the Vue projection even when outside the viewport, so overlays and keyboard selection remain stable.

## Validation

- Core: `pnpm --filter @affino/diagram-core test`, `pnpm --filter @affino/diagram-core build`, `pnpm --filter @affino/diagram-core bench`.
- Vue: `pnpm --filter @affino/diagram-vue test`, `pnpm --filter @affino/diagram-vue build`.

## Viewport contract and UnitLab migration

The canonical contract is world-space `x`, `y`, `width`, and `height`; `zoom` maps world units to CSS pixels. The CSS container size is `viewport.width * viewport.zoom` by `viewport.height * viewport.zoom`. ResizeObserver measurements are converted to world extent in `diagram-vue`; zero-size observations are ignored. `queryVisible()` receives the world viewport directly.

UnitLab must use `viewBox="x y width height"` with raw viewport width/height, calculate minimap extents in world coordinates, and use `zoomViewportAt()` for cursor focus or `zoomViewportCentered()` for toolbar zoom. Saved camera state is restored without an automatic Fit; Fit is appropriate only for a new document or an explicit user action.

The preview is core-owned and transient. Keep committed scene state separate, use the interaction snapshot for preview rendering, and treat `handle.ownerId` as authoritative for opaque IDs containing colons.
