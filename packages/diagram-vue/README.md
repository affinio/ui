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

## SVG/DOM hybrid rendering

Use SVG for structural entities and DOM only for overlays or active text editing. The adapter returns render lists from `engine.queryVisible()`, so Vue code does not scan the whole scene on pan.

```vue
<script setup lang="ts">
import { getDomEntityStyle, getSvgEntityProps, useDiagramEngine, useDiagramPointerController, useDiagramVisibleEntities } from "@affino/diagram-vue"

const diagram = useDiagramEngine(initialScene)
const visible = useDiagramVisibleEntities(diagram, { overscan: 200 })
const pointer = useDiagramPointerController(diagram)
</script>

<template>
  <div class="diagram-stage">
    <svg class="diagram-svg" v-bind="pointer.getSvgPointerProps()">
      <polyline v-for="edge in visible.projection.value.edges" :key="edge.id" v-bind="getSvgEntityProps(edge)" />
      <rect v-for="node in visible.projection.value.nodes" :key="node.id" v-bind="getSvgEntityProps(node)" />
      <circle v-for="port in visible.projection.value.ports" :key="port.id" v-bind="getSvgEntityProps(port)" />
    </svg>
    <div v-for="text in visible.projection.value.texts" :key="text.id" :style="getDomEntityStyle(text)">
      {{ text.id }}
    </div>
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

- `nodes`, `edges`, `ports`, and `shapes` for SVG rendering;
- `texts` for DOM overlays or active editors;
- `activeHandles` for selected resize/port handles;
- `overlayAnchors` for context menus and toolbars.

Selected entities are included even when outside the viewport, which keeps handles and overlays stable during keyboard or programmatic selection changes.

## What belongs in core

Do not put domain rules, snapping decisions, hit testing, undo/redo, or geometry math in Vue components. Route those through `@affino/diagram-core` commands and queries, then render the projection here.
