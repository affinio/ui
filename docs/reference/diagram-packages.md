# Diagram Packages

`@affino/diagram-core` and `@affino/diagram-vue` provide a framework-separated diagram stack. Core owns state, geometry, hit testing, commands, history, spatial indexes, interaction state, snapping, and serialization. Vue owns refs, lifecycle cleanup, DOM pointer events, viewport resize, and render lists.

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

Render `visible.projection.value.edges`, `nodes`, `ports`, and `shapes` in SVG. Render `texts` as DOM overlays or active editors. Context menus and floating toolbars should anchor to `overlayAnchors`, with one shared overlay instance rather than one subtree per entity.

## Ownership Rules

- Do not put SLD, switchgear, IEC 61850 paths, or persistence state in diagram core. Store domain meaning in metadata and interpret it in an adapter package.
- Do not rebuild visible lists in Vue with full scene `map`/`filter` on pan. Use `useDiagramVisibleEntities()`, which calls `engine.queryVisible()`.
- Do not implement snapping, undo/redo, hit testing, or geometry math in Vue components. Dispatch core commands or call core queries.
- Selected entities are included in the Vue projection even when outside the viewport, so overlays and keyboard selection remain stable.

## Validation

- Core: `pnpm --filter @affino/diagram-core test`, `pnpm --filter @affino/diagram-core build`, `pnpm --filter @affino/diagram-core bench`.
- Vue: `pnpm --filter @affino/diagram-vue test`, `pnpm --filter @affino/diagram-vue build`.
