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
- `activeHandles` for selected resize/port handles;
- `overlayAnchors` for context menus and toolbars.

Selected entities are included even when outside the viewport, which keeps handles and overlays stable during keyboard or programmatic selection changes. `useDiagramTextEditor()` owns one shared DOM editor overlay for the active text entity; it reads bounds from core, positions through the viewport transform, and commits through the `editText` command.

## What belongs in core

Do not put domain rules, snapping decisions, hit testing, undo/redo, or geometry math in Vue components. Route those through `@affino/diagram-core` commands and queries, then render the projection here.

## Viewport and camera migration

`ResizeObserver.contentRect` is CSS pixels. `useDiagramViewport()` converts them to world extent by dividing by the current zoom and ignores `0×0` measurements, so a restored camera is not overwritten by a hidden tab. The SVG viewBox should be `x y width height` from the core viewport—do not divide width or height by zoom again.

For DOM overlays call `getDomEntityStyle(entity, viewport.viewport.value)`; text editor positioning already applies the same transform. Use core `zoomViewportAt()` for cursor focus and `zoomViewportCentered()` for toolbar zoom. Minimap dimensions use the world scene bounds and the same camera transform.

Preview geometry remains transient until pointerup. Render the interaction preview and its handles from core state; entity IDs are opaque strings and may contain `:`. Use `handle.ownerId`, never parse `handle.id`. Escape/pointercancel cancels without history; pointerup commits one undo operation.

### Migration from 0.1.0

- Replace `viewBox.width = viewport.width / viewport.zoom` and the corresponding height formula with raw world `viewport.width` and `viewport.height`.
- Remove application-side ResizeObserver writes of CSS width/height into core; use `useDiagramViewport()`.
- Replace custom cursor zoom/focus and resize camera math with the exported core helpers.
- Run initial Fit only for a new document without a persisted viewport; never Fit on every resize or scene restore.
