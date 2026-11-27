# demo-vue

Sandbox package for trying Affino Vue component scenarios in one Vite app.

Included demo areas:

- menu
- dialog
- tooltip
- popover
- disclosure
- tabs
- treeview (`/treeview`, including a virtualized ~2.4k-node fixture for modifier/range selection, keyboard focus, drag/drop validation intents, clipboard intents, and search)
- selection
- combobox
- virtualization

The package is wired against workspace source packages, so local changes in `packages/*` are reflected immediately in the sandbox.

## Commands

```sh
pnpm --dir packages/demo-vue dev
pnpm --dir packages/demo-vue type-check
pnpm --dir packages/demo-vue build
pnpm run smoke:treeview:demo
```

## Notes

- This package intentionally does not include datagrid demos.
- The sandbox is intentionally Vue-only and focuses on compact, copy-paste friendly examples.
- Overlay diagnostics are visible in the floating stack panel during local development.
- `pnpm run smoke:treeview:demo` starts the Vite demo server automatically when `TREEVIEW_DEMO_URL` is not already available and writes desktop and mobile screenshots to `artifacts/treeview-smoke` unless `TREEVIEW_SMOKE_SCREENSHOTS=0`; set `TREEVIEW_SMOKE_MAX_LATENCY_MS` to fail on slow smoke operations.
- The `/treeview` page enables multiple selection on a virtualized 2.4k-node fixture. Use the range stress button, Ctrl/Meta-click, Shift-click, Shift+Arrow, Escape to clear and focus the anchor, drag/drop rows, and Ctrl/Meta+C/X/V; diagnostics display app-owned intents without changing the fixture hierarchy.


## Diagram demo

The `/diagram` route is the public Vue reference scene for `@affino/diagram-vue`. It uses the package composables directly: `useDiagramEngine`, `useDiagramViewport`, `useDiagramSelection`, `useDiagramVisibleEntities`, and `useDiagramPointerController`. The scene includes 1000 generated nodes, viewport navigation controls, trackpad wheel pan and zoom, touch pinch zoom, live movement previews, strict-containment marquee group selection, a minimap, selection handles, copy/paste/duplicate with offset remapping, live single and group resize handles backed by core `resizePreviewEntries`, rotate, align, cross-kind z-order actions for bays, bus lines, edges, and labels, delete/backspace removal, undo/redo, keyboard nudge actions, and fit selection/scene controls. The Pen tool demonstrates click-drag cubic anchors, tangent previews, Shift cardinal constraints, first-anchor closure, Enter/Escape behavior, and direct Bézier handle editing through the adapter overlay. Domain-specific SLD logic remains out of the route.

The route also includes Transform Origin and Text Orientation examples backed by Core commands and geometry. Transform Origin demonstrates a grouped rectangle, asymmetric open path, label, group-hosted ports, relative/absolute pivot selection, geometry preservation, rotation, reflection, and group resizing. The engine currently rejects nested groups, so the example does not claim nested transform support.

The `/diagram/table` route isolates table construction from the large generated scene. It renders one editable table on a canvas and places cell content, row/column structure, merges, alignment, and grid styling in a right-side inspector. The inspector uses the public `useDiagramTable()` controller and the SVG renderer hides its built-in toolbar for this route.

The `/diagram/connectors` route is a focused Connector Workbench built on the public Core engine and Vue pointer controller. It has resettable fixtures for free, aligned, perpendicular, offset, same-facing, manually routed, stacked, junction-connected, and transformed connectors. Connector-tool drags finish on pointer-up; changing direction by more than 10 screen pixels places a bend, with a 14-pixel minimum committed segment. Debug mode exposes the last Core preview, committed route, endpoint candidate, and preview-equality result.

The `/diagram/grid` and `/diagram/canvas` routes render live Core interaction previews while objects move. Diagram text is not browser-selectable, so pointer drags remain available for canvas interactions. Diagram canvases support wheel/trackpad pan, modifier-wheel zoom, and two-finger pinch zoom; zoom stays anchored to the pointer or pinch midpoint. The free canvas includes an **Orthogonal mode** checkbox that toggles Core's orthogonal snapping for connector and Bézier drawing; changing it cancels any in-progress pointer gesture and keeps the selected tool.

The diagram examples are split into four workbenches: `/diagram` covers a generated scene and editable table topology; `/diagram/connectors` focuses on ports and connector routing; `/diagram/grid` changes grid spacing and tests grid snapping while moving objects; `/diagram/canvas` starts with a small editable scene and exposes text, shapes, paths, Bézier curves, ports, connectors, transforms, grouping, clipboard-style duplication, and undo/redo. On the free canvas, choose **Place port on shape** and click a node, shape, or connector to add an attached port; choose **Draw connector** and drag between ports to connect them. Select a connector to show endpoint rings and draggable interior segment handles: drag an endpoint ring to reconnect to a port, or an interior handle to move that run while keeping attached endpoints fixed. Terminal runs next to attached ports are intentionally fixed, preserving the ports' approach direction. These are interactive demos backed by `@affino/diagram-core` and `@affino/diagram-vue`; they do not persist changes outside the current page session.

The `/diagram` page also compares live, ghost, and outline object movement using the existing pointer controller. Fixture controls select a simple shape, attached node, nested retained group, or multi-selection; **Reset drag fixtures** restores their original placement. Candidate display is projection-only: ghost includes Core-resolved attached-edge candidates, while outline draws candidate bounds and leaves committed connectors in place.
