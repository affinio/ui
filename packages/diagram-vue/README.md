# @affino/diagram-vue

Vue adapter for `@affino/diagram-core`. The package owns Vue refs, lifecycle cleanup, DOM pointer bridging, viewport resize bridging, and render projections. Diagram rules stay in core.

## Install

```bash
pnpm add @affino/diagram-core @affino/diagram-vue vue
```

## Basic setup

```ts
import { useDiagramEngine, useDiagramSelection, useDiagramVisibleEntities } from "@affino/diagram-vue"

const diagram = useDiagramEngine({
  nodes: [{ id: "bay-a", kind: "node", x: 0, y: 0, width: 160, height: 80 }],
  ports: [{ id: "bay-a-out", kind: "port", nodeId: "bay-a", x: 160, y: 40 }],
  viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 },
})
const selection = useDiagramSelection(diagram)
const visible = useDiagramVisibleEntities(diagram)

selection.setSelection(["bay-a"], "bay-a")
```

## SVG-first rendering

Render static diagram text as SVG `<text>`/`<tspan>` elements in world space. Use DOM only for the single active text editor overlay and floating UI such as context menus, toolbars, popovers, and form-like controls. The adapter returns render lists from `engine.queryVisible()`, so Vue code does not scan the whole scene on pan.

Core `flipEntities` commands are reflected by `getSvgEntityProps()` and `getDomEntityStyle()` through the geometry's `flipX`/`flipY` flags. The built-in table view mirrors its cell layout and keeps toolbar and active input controls readable.

Ports render and hit-test from the same Core geometry snapshot as other entities. `getSvgEntityProps()` exposes `data-port-host-id`, `data-port-anchor-kind`, and the anchor's local coordinates or vertex index for consumers that need to label or inspect terminals. Core owns transformed positions, preview, snapping, and endpoint attachment; the Vue adapter does not keep a duplicate anchor model. Existing node-relative ports continue to render unchanged.

For interactive placement, call `pointer.beginPortCreation(id, pointerEvent, options)` when arming a new caller-generated ID. The call publishes an initial hover preview; ordinary SVG pointer moves keep it reactive, and the next pointer down/up commits it. The `create-port` tool remains active after a commit; call `beginPortCreation()` again with a fresh ID to place another port. Escape can call `pointer.cancel()`, while native pointercancel already clears the preview.

Render the marker inside the same SVG/world coordinate system as diagram entities. `getSvgPortCreationPreviewProps()` returns renderer-ready circle attributes, including the resolved position and host/anchor data:

```vue
<template>
  <svg v-bind="pointer.getSvgPointerProps()">
    <!-- diagram entities -->
    <circle
      v-if="pointer.state.value.portCreationPreview"
      v-bind="getSvgPortCreationPreviewProps(pointer.state.value.portCreationPreview)"
      fill="none"
      stroke="currentColor"
    />
  </svg>
</template>
```

Rectangular `DiagramShape` geometry exposes `cornerRadius` (world units) to renderers. `getSvgEntityProps()` maps it to SVG `rx`/`ry`; render the shape as `<rect>`. Omitted radius projects as zero, and Core rejects a value above half the smaller rectangle side. Other shape kinds are unchanged.

Core group rotation publishes updated member geometry and selection bounds through the existing scene controller. `getSvgEntityProps()` and `DiagramTableView` apply the resulting rotation, so Vue toolbar capability checks based on `engine.canRotate(selection.ids)` and group selection overlays react to the command.

```vue
<script setup lang="ts">
import { screenToWorld } from "@affino/diagram-core"
import { getSvgEntityProps, useDiagramEngine, useDiagramPointerController, useDiagramTextEditor, useDiagramVisibleEntities } from "@affino/diagram-vue"

const diagram = useDiagramEngine(initialScene)
const visible = useDiagramVisibleEntities(diagram, { overscan: 200 })
const pointer = useDiagramPointerController(diagram)
const textEditor = useDiagramTextEditor(diagram)
</script>

<template>
  <div class="diagram-stage">
    <svg class="diagram-svg" v-bind="pointer.getSvgPointerProps()">
      <polyline v-for="edge in visible.projection.value.edges" :key="edge.id" v-bind="getSvgEntityProps(edge)" />
      <rect v-for="node in visible.projection.value.nodes" :key="node.id" v-bind="getSvgEntityProps(node)" />
      <circle v-for="port in visible.projection.value.ports" :key="port.id" v-bind="getSvgEntityProps(port)" />
      <text v-for="text in visible.projection.value.texts" :key="text.id" v-bind="getSvgEntityProps(text)">
        {{ diagram.scene.value.entities.textsById.get(text.id)?.text }}
      </text>
    </svg>
    <textarea v-if="textEditor.activeEditor.value" :style="textEditor.activeEditor.value.style" :value="textEditor.activeEditor.value.text" />
  </div>
</template>
```

`pointer.state.value` mirrors Core snap markers, guides, active angle/axis constraint, numeric input, and connector preview. Use `pointer.getPreviewGeometry(id)` inside a computed render projection (read `pointer.state.value` in the same computed to track preview updates). Core owns snap selection and geometry; Vue only forwards pointer events and exposes the typed state.

For a free line shape, call `pointer.beginLineCreation(id, event)`; render `pointer.state.value.shapeCreationPreview` transiently, then let the same controller commit the shape on pointerup. Connector creation uses `beginEdgeCreation(id, event, routeOptions)` or `beginEdgePathCreation(id, event, routeOptions)`; the options are the Core `DiagramOrthogonalRouteOptions` type, including `mode: "auto"`, clearance, terminal directions, and ordered waypoints. The reactive `edgeCreationPreview.path` is the resolved route; Core commits its interior points in that same order. Automatic routes stay derived in Core and reroute after relevant scene edits. Vue only displays the published preview and committed Core geometry.

```ts
pointer.beginEdgeCreation("wire-12", event, {
  mode: "auto",
  clearance: 8,
  terminalLead: 12,
  sourceDirection: "east",
  targetDirection: "west",
})
// Render pointer.state.value.edgeCreationPreview.path as a transient route.
// Core commits the exact preview on pointerup; cancel creates no scene change.
```

For public connector rendering with rounded corners and crossing bridges, use `useDiagramConnectorRendering()`. It reacts to scene geometry and z-order changes and exposes SVG-ready path data computed by Core. Rendering settings remain view options, not scene data:

```ts
import { getSvgConnectorRenderProps, useDiagramConnectorRendering } from "@affino/diagram-vue"

const connectors = useDiagramConnectorRendering(diagram, {
  cornerRadius: 8, // world units
  crossingBridge: { radius: 6 },
  junctionAppearance: "filled-dot", // or "none"; visual only
  junctionRadius: 3,
})
```

```vue
<path
  v-for="edge in connectors.connectors.value"
  :key="edge.id"
  v-bind="getSvgConnectorRenderProps(edge)"
  :class="{ selected: edge.selected }"
  stroke="currentColor"
/>
```

Core determines crossing geometry, explicit junctions, and which edge is on top; Vue only formats its typed result as SVG. Bridges appear only at strict interior crossings and do not imply electrical junctions. Shared endpoint contacts, endpoint touches, and collinear overlaps are left unbridged. Explicit junctions are exposed as `connector.junctions`; render each with `getSvgJunctionRenderProps()`. The default is a filled dot. `"none"` hides its marker without changing connectivity, and bridges are suppressed at explicit junction points. Call `connectors.dispose()` when managing the composable outside a Vue effect scope.

`useDiagramPointerController({ snap: { snapToConnectors: true, connectorTolerancePx } })` exposes `state.value.edgeCreationPreview.prospectiveJunctions` while drawing a branch onto a connector. Render these transient marker geometries in the same world-coordinate SVG group as the route preview. Core commits the new stable junction and branch edge atomically; preview/cancel do not change document state.

Click-to-place drawing is available through `useDiagramPointerController()`: `beginPathCreation(id, event, "line")` places a two-click line; omit the mode for a multipoint free path, or pass `{ closeTolerancePx }` to enable magnetic closure in screen pixels. `state.value.pathCreationPreview.closing` and `closeTarget` expose the snap and target; clicking closes exactly to the first vertex. `"line"` mode stays open. Finish with `finishPathCreation()` or Enter (when the SVG pointer props receive keydown) or a double click. Enter finishes an open path through its confirmed vertices; it does not close the contour back to its first vertex. Holding Shift constrains the preview segment to the nearest cardinal direction from the last confirmed vertex; releasing Shift resumes free placement. Use `beginEdgePathCreation(id, event, options)` for a connector whose later clicks add route bends; Shift constrains each preview segment from the latest bend. Finish with `finishEdgePathCreation()` or snap its target to a port. The reactive `state.value.pathCreationPreview` and `edgeCreationPreview` are transient Core projections. Selected path vertices, edge waypoints, endpoints, and orthogonal segments appear as `activeHandles` (`path-vertex`, `waypoint`, `edge-endpoint`, and `edge-segment`). Pass a segment handle's `segmentIndex` to `beginEdgeSegmentHandle(id, segmentIndex, event)`; `state.value.edgeSegmentPreview` and `getPreviewGeometry(id)` expose the live route until commit or cancel. Segment drags preserve attached endpoints and commit as one undo step. Existing drag-to-draw methods remain supported.

Selected resizable entities expose eight `activeHandles` with `resizeHandle` directions `nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, and `w`. Start entity and group gestures through `beginResizeHandle(id, handle, event)` and `beginResizeSelectionHandle(handle, event)` on the pointer controller; Core owns preview geometry and the single undoable commit. Escape or pointer cancellation drops the preview.

### Bézier/Pen tool

Set `pointer.setTool("draw-bezier")`; on the first canvas click call `pointer.beginBezierCreation(id, event, { closeTolerancePx })`. The optional close radius is in screen pixels. Subsequent canvas pointerdown/move/up events place click-drag anchors; dragging sets the outgoing tangent in the direction of the gesture and mirrors the incoming tangent across the anchor. The reactive `pointer.state.value.bezierCreationPreview` contains the exact cubic contour, active tangent handles, and `closing`/`closeTarget` while magnetically approaching the first anchor. The preview endpoint snaps to the target, which the Vue layer can highlight, and matches the geometry committed at finish. Enter finishes an open contour, clicking its first anchor closes it, and Escape/pointercancel cancels it. The adapter adds no document changes until finish; a completed contour creates one undo step and becomes selected.

Render transient paths and selected path handles inside the same world-coordinate SVG group as the scene:

```vue
<svg v-bind="pointer.getSvgPointerProps()" @keydown="pointer.getSvgPointerProps().onKeydown">
  <!-- committed entities -->
  <DiagramBezierOverlay
    :pointer="pointer"
    :handles="visible.projection.value.activeHandles"
    :zoom="diagram.scene.value.viewport.zoom"
  />
</svg>
```

`DiagramBezierOverlay` renders native SVG cubic commands, draft anchors, tangent guides, and editable controls. Its handle hit targets remain screen-sized using `zoom`; it accepts the adapter's typed `DiagramHandle` projection and routes edits through Core. Mount it within the existing viewport transform so path data, preview, and committed geometry use identical world coordinates. The controller's `beginBezierHandle(id, contourIndex, segmentIndex, handle, event)` is also available when an application renders its own handle chrome.

Shapes with exact Core `pathContours` are projected by `getSvgEntityProps()` as SVG `d` path data with `fill-rule="evenodd"`; render that entity as `<path>`. The diagram playground demonstrates three-point Arc, straight-line Trim, circle-by-rectangle Trim, two-line Trim & Join, and circle-minus-rectangle Subtract previews. Selection order is explicit: base/target first, cutter second; Trim & Join shoulder clicks select the two retained line ends. Escape cancels the active tool. These tools use Core geometry helpers and `updateShapePath`/`dispatchBatch`; Vue owns only pointer handling and display.

```ts
const pointer = useDiagramPointerController(diagram, {
  toWorldPoint: (event) => screenToWorld(diagram.scene.value.viewport, { x: event.clientX, y: event.clientY }),
  snap: { gridSize: 8, tolerancePx: 8, portTolerancePx: 14, kinds: ["port", "endpoint", "midpoint", "nearest", "grid"], angleIncrement: 45 },
})

function onConnectPointerDown(event: PointerEvent) {
  pointer.beginEdgeCreation("edge-12", event, { terminalLead: 12 })
}
pointer.setDynamicInput({ length: 120, angle: 30 })
pointer.confirmDynamicInput()
```

`snap.portTolerancePx` controls only connector endpoint capture to ports, in screen pixels across viewport zoom levels. If omitted, port capture uses `snap.tolerancePx`, preserving existing behavior; other snap types continue using `tolerancePx`. `snap.snapToPorts: false` disables port references regardless of either tolerance.

`snap.ortho: true` constrains creation of lines, each click-to-place path segment, Bézier anchors, connector endpoints, and existing edge endpoint edits to 90-degree increments. Core projects snap candidates onto the selected axis, so grid and nearby geometry do not create diagonal path segments. Connector waypoint and segment edits preserve orthogonality; preview and committed routes use canonical points. Hold Shift to constrain those gestures; grid, port, alignment, and object snapping remain active.

Set `snap.strictGrid: true` with a positive `gridSize` to normalize persisted straight geometry to the world grid. Core applies the same policy to previews and commits, group members, path vertices, hosted port world positions, and automatic orthogonal route bends. The Vue adapter passes the option through unchanged and contains no separate snapping geometry. Group member offsets may change when independently aligning them; circular arcs retain their exact curve geometry.

### Visual table component

Create table data through Core, then render `DiagramTableView` inside the diagram SVG. The component reads the same reactive scene as other projections and sends cell/style/row/column changes through undoable Core commands; it has no duplicate application-owned table model. Pass the optional pointer controller to project frame-batched drag and resize previews, including multi-selection and grouped-table resize. Preview geometry is transient: serialization, revision, and history remain unchanged until pointer-up, while pointer cancel returns to the committed scene.

```vue
<script setup lang="ts">
import { DiagramTableView, useDiagramEngine, useDiagramPointerController } from "@affino/diagram-vue"
import { ref } from "vue"
import type { DiagramTableCellPosition } from "@affino/diagram-core"

const diagram = useDiagramEngine({
  tables: [{ id: "notes", kind: "table", x: 40, y: 40, width: 320, height: 120, rowCount: 2, columnCount: 2,
    cells: [[{ text: "Item", horizontalAlign: "center" }, { text: "Value" }], [{ text: "Relay" }, { text: "R1" }]],
    header: { text: "Distribution panel", height: 28, horizontalAlign: "center" } }],
  viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 },
})
const pointer = useDiagramPointerController(diagram)
const activeCell = ref<DiagramTableCellPosition | null>(null)
</script>

<template>
  <svg :viewBox="`${diagram.scene.value.viewport.x} ${diagram.scene.value.viewport.y} ${diagram.scene.value.viewport.width} ${diagram.scene.value.viewport.height}`">
    <DiagramTableView v-model:active-cell="activeCell" :controller="diagram" :pointer="pointer" id="notes" :show-toolbar="false" />
  </svg>
</template>
```

Double-click a cell or focus it and press Enter/F2 to edit. Typing a printable key starts editing with that character replacing the previous cell text; IME composition and Ctrl/Meta/Alt shortcuts do not trigger replacement. Enter commits and returns focus to the cell; Escape discards; blur commits; Up/Down move to the adjacent cell, and Left/Right move when the text caret is at the corresponding edge. Keyboard-focused cells use a subtle `--affino-focus-ring-color`/`--affino-accent` ring that adapts to the active theme and does not alter grid strokes. While selected, the accessible table toolbar exposes row/column insertion and deletion, row/column sizes, cell alignment, grid visibility/color/width/style, and outer border visibility/color/width/style/radius. Set `showToolbar` to `false` to hide only that built-in toolbar and expose commands in an external inspector through `useDiagramTable(diagram, id)`; cell editing and diagram interactions remain enabled. Toolbar/editor pointer events stop at the controls; the table surface continues to bubble pointer gestures to the diagram controller.

An optional `DiagramTable.header` is rendered as a title band above the grid. `height` is in world units; optional `verticalAlign` (`top`, `middle`, or `bottom`) controls title text placement and defaults to `middle`. The formatting toolbar exposes an accessible vertical alignment selector when a title exists. Existing `table.y` and `table.height` continue to identify the data-grid body, so `rowCount` and active-cell coordinates never include the title. Focus the title and press Enter/F2 or type a printable character to edit it; Enter and blur commit one `updateTableHeader` command, while Escape cancels. Arrow keys on the title are isolated from cell navigation and diagram keyboard handlers. `useDiagramTable().updateHeader(header)` updates the Core-owned model; pass `null` to remove it. The built-in toolbar also offers add/remove title controls. Old tables without headers render as before.

`activeCell` is zero-based UI state and is never serialized or added to history. Without a supplied value, the first cell (`{ row: 0, column: 0 }`) is active; focus, click, and keyboard navigation emit `update:activeCell`, and row/column deletion clamps it to valid indexes. The active cell exposes `aria-selected`, a roving tabindex, a theme-aware fill through `--affino-diagram-table-active-cell`, and a focus ring without changing grid strokes.

Cell arrow navigation prevents default and stops bubbling to the diagram editor. While editing, Up/Down move between cells and Left/Right move only when the text caret reaches its corresponding edge; Enter/F2, Escape, printable-key replacement, and IME handling retain their existing behavior. Selected tables with a pointer controller expose screen-sized row/column resize handles. Drag previews are frame-batched and work with table rotation; pointer-up dispatches one existing Core resize command/history entry, while pointer cancel or Escape discards the preview. Resizing changes the selected row/column and matching outer table dimension; other row/column sizes remain unchanged.

## Viewport resize

`useDiagramViewport()` can attach a viewport element and write width/height changes into core through `setViewport` commands.

```ts
import { shallowRef } from "vue"
import { useDiagramEngine, useDiagramViewport } from "@affino/diagram-vue"

const stage = shallowRef<HTMLElement | null>(null)
const diagram = useDiagramEngine(initialScene)
const pageConstraints = { bounds: { x: 0, y: 0, width: 794, height: 1123 }, margin: 80 }
const viewport = useDiagramViewport(diagram, { element: stage, viewportConstraints: pageConstraints })

viewport.setViewport({ x: 120, y: 40, zoom: 1.25 })
```

Pass the same `viewportConstraints` to `useDiagramPointerController()` to constrain pan gesture preview and commit. `useDiagramViewport()` clamps restored state, programmatic `setViewport()` calls, and resize updates only when this option is provided; without it, the existing unbounded behavior is preserved. Bounds and margin use world units, and a visible world area larger than the page plus margin centers the page on that axis.

## Projection contract

`useDiagramVisibleEntities()` exposes:

- `nodes`, `edges`, `ports`, `shapes`, and `texts` for SVG rendering;
- `activeHandles` for the eight selected resize handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`), port handles, and source/target handles on selected edges. Resize handles expose their typed direction as `resizeHandle` and their projected world-space center as `point`;
- `overlayAnchors` for context menus and toolbars. Free straight selected edges include optional world-space `corners` for a frame aligned to the route; other edges continue to omit an edge selection frame.

Selected entities are included even when outside the viewport, which keeps handles and overlays stable during keyboard or programmatic selection changes. `useDiagramTextEditor()` owns one shared DOM editor overlay for the active text entity; it reads bounds from core, positions through the viewport transform, and commits through the `editText` command.

## What belongs in core

Do not put domain rules, snapping decisions, hit testing, undo/redo, or geometry math in Vue components. Route those through `@affino/diagram-core` commands and queries, then render the projection here.

## Viewport and camera migration

`ResizeObserver.contentRect` is CSS pixels. `useDiagramViewport()` converts them to world extent by dividing by the current zoom and ignores `0×0` measurements, so a restored camera is not overwritten by a hidden tab. The SVG viewBox should be `x y width height` from the core viewport—do not divide width or height by zoom again.

Resize measurements update only the viewport's world width and height. They preserve camera `x`, `y`, and `zoom`, even when page constraints are configured; constraints remain active for explicit viewport changes and interaction gestures. This prevents repeated layout changes, including those caused by document undo/redo, from incrementally shifting the camera.

For DOM overlays call `getDomEntityStyle(entity, viewport.viewport.value)`; text editor positioning already applies the same transform. Use core `zoomViewportAt()` for cursor focus and `zoomViewportCentered()` for toolbar zoom. Minimap dimensions use the world scene bounds and the same camera transform.

Preview geometry remains transient until pointerup. Start endpoint gestures with `interaction.beginEdgeEndpointHandle(handle.ownerId, "source" | "target", event)` and render `interaction.getPreviewGeometry(edgeId)` while the gesture is active. Entity IDs are opaque strings and may contain `:`. Use `handle.ownerId`, never parse `handle.id`. Escape/pointercancel cancels without history; pointerup commits one undo operation.

`useDiagramPointerController()` accepts `snap` options for grid spacing, port snapping, alignment, equal spacing, and screen pixel tolerance. Its `state.value.snapGuides` contains world-space line segments for currently active alignment and equal-spacing matches and clears when the gesture ends.

During selection drags, holding Shift constrains movement to the dominant axis from the gesture origin. During edge endpoint drags, Shift projects the edge vector from its stationary endpoint to a latched cardinal angle. During resize gestures it preserves the original aspect ratio. The Vue pointer adapter forwards `shiftKey` to core on pointer events, so pressing or releasing Shift updates the active preview.

The pointer snapshot exposes `editingLocked`, which reacts to Core's `engine.setEditingLocked(boolean)`. Locking cancels transient previews and prevents pointer interactions from committing; Core still allows authoritative `transact()` scene replacement while locked. Path projections preserve cubic Bézier control points and `getSvgEntityProps()` returns native SVG `C` path commands without display-time flattening.

### Migration from 0.1.0

- Replace `viewBox.width = viewport.width / viewport.zoom` and the corresponding height formula with raw world `viewport.width` and `viewport.height`.
- Remove application-side ResizeObserver writes of CSS width/height into core; use `useDiagramViewport()`.
- Replace custom cursor zoom/focus and resize camera math with the exported core helpers.
- Run initial Fit only for a new document without a persisted viewport; never Fit on every resize or scene restore.
