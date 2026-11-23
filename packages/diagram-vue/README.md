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

```vue
<script setup lang="ts">
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

### Visual table component

Create table data through Core, then render `DiagramTableView` inside the diagram SVG. The component reads the same reactive scene as other projections and sends cell/style/row/column changes through undoable Core commands; it has no duplicate application-owned table model. Pass the optional pointer controller to project frame-batched drag and resize previews, including multi-selection and grouped-table resize. Preview geometry is transient: serialization, revision, and history remain unchanged until pointer-up, while pointer cancel returns to the committed scene.

```vue
<script setup lang="ts">
import { DiagramTableView, useDiagramEngine, useDiagramPointerController } from "@affino/diagram-vue"

const diagram = useDiagramEngine({
  tables: [{ id: "notes", kind: "table", x: 40, y: 40, width: 320, height: 120, rowCount: 2, columnCount: 2,
    cells: [[{ text: "Item", horizontalAlign: "center" }, { text: "Value" }], [{ text: "Relay" }, { text: "R1" }]] }],
  viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 },
})
const pointer = useDiagramPointerController(diagram)
</script>

<template>
  <svg :viewBox="`${diagram.scene.value.viewport.x} ${diagram.scene.value.viewport.y} ${diagram.scene.value.viewport.width} ${diagram.scene.value.viewport.height}`">
    <DiagramTableView :controller="diagram" :pointer="pointer" id="notes" :show-toolbar="false" />
  </svg>
</template>
```

Double-click a cell or focus it and press Enter/F2 to edit. Typing a printable key starts editing with that character replacing the previous cell text; IME composition and Ctrl/Meta/Alt shortcuts do not trigger replacement. Enter commits and returns focus to the cell; Escape discards; blur commits; Up/Down move to the adjacent cell, and Left/Right move when the text caret is at the corresponding edge. Keyboard-focused cells use a subtle `--affino-focus-ring-color`/`--affino-accent` ring that adapts to the active theme and does not alter grid strokes. While selected, the accessible table toolbar exposes row/column insertion and deletion, row/column sizes, cell alignment, grid visibility/color/width/style, and outer border visibility/color/width/style/radius. Set `showToolbar` to `false` to hide only that built-in toolbar and expose commands in an external inspector through `useDiagramTable(diagram, id)`; cell editing and diagram interactions remain enabled. Toolbar/editor pointer events stop at the controls; the table surface continues to bubble pointer gestures to the diagram controller.

## Viewport resize

`useDiagramViewport()` can attach a viewport element and write width/height changes into core through `setViewport` commands.

```ts
import { shallowRef } from "vue"
import { useDiagramEngine, useDiagramViewport } from "@affino/diagram-vue"

const stage = shallowRef<HTMLElement | null>(null)
const diagram = useDiagramEngine(initialScene)
const viewport = useDiagramViewport(diagram, { element: stage })

viewport.setViewport({ x: 120, y: 40, zoom: 1.25 })
```

## Projection contract

`useDiagramVisibleEntities()` exposes:

- `nodes`, `edges`, `ports`, `shapes`, and `texts` for SVG rendering;
- `activeHandles` for selected resize/port handles and source/target handles on selected edges;
- `overlayAnchors` for context menus and toolbars.

Selected entities are included even when outside the viewport, which keeps handles and overlays stable during keyboard or programmatic selection changes. `useDiagramTextEditor()` owns one shared DOM editor overlay for the active text entity; it reads bounds from core, positions through the viewport transform, and commits through the `editText` command.

## What belongs in core

Do not put domain rules, snapping decisions, hit testing, undo/redo, or geometry math in Vue components. Route those through `@affino/diagram-core` commands and queries, then render the projection here.

## Viewport and camera migration

`ResizeObserver.contentRect` is CSS pixels. `useDiagramViewport()` converts them to world extent by dividing by the current zoom and ignores `0×0` measurements, so a restored camera is not overwritten by a hidden tab. The SVG viewBox should be `x y width height` from the core viewport—do not divide width or height by zoom again.

For DOM overlays call `getDomEntityStyle(entity, viewport.viewport.value)`; text editor positioning already applies the same transform. Use core `zoomViewportAt()` for cursor focus and `zoomViewportCentered()` for toolbar zoom. Minimap dimensions use the world scene bounds and the same camera transform.

Preview geometry remains transient until pointerup. Start endpoint gestures with `interaction.beginEdgeEndpointHandle(handle.ownerId, "source" | "target", event)` and render `interaction.getPreviewGeometry(edgeId)` while the gesture is active. Entity IDs are opaque strings and may contain `:`. Use `handle.ownerId`, never parse `handle.id`. Escape/pointercancel cancels without history; pointerup commits one undo operation.

`useDiagramPointerController()` accepts `snap` options for grid spacing, port snapping, alignment, equal spacing, and screen pixel tolerance. Its `state.value.snapGuides` contains world-space line segments for currently active alignment and equal-spacing matches and clears when the gesture ends.

During selection drags, holding Shift constrains movement to the dominant axis from the gesture origin. During edge endpoint drags, Shift projects the edge vector from its stationary endpoint to a latched cardinal angle. During resize gestures it preserves the original aspect ratio. The Vue pointer adapter forwards `shiftKey` to core on pointer events, so pressing or releasing Shift updates the active preview.

### Migration from 0.1.0

- Replace `viewBox.width = viewport.width / viewport.zoom` and the corresponding height formula with raw world `viewport.width` and `viewport.height`.
- Remove application-side ResizeObserver writes of CSS width/height into core; use `useDiagramViewport()`.
- Replace custom cursor zoom/focus and resize camera math with the exported core helpers.
- Run initial Fit only for a new document without a persisted viewport; never Fit on every resize or scene restore.
