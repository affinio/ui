# demo-vue

Sandbox package for trying Affino Vue component scenarios in one Vite app.

Included demo areas:

- menu
- dialog
- tooltip
- popover
- disclosure
- tabs
- treeview (`/treeview`, including a virtualized ~2.4k-node performance fixture, search projection, and matched-node styling)
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


## Diagram demo

The `/diagram` route is the public Vue reference scene for `@affino/diagram-vue`. It uses the package composables directly: `useDiagramEngine`, `useDiagramViewport`, `useDiagramSelection`, `useDiagramVisibleEntities`, and `useDiagramPointerController`. The scene includes 1000 generated nodes, viewport navigation controls, trackpad wheel pan, modifier-wheel zoom down to 5%, live pan preview, strict-containment marquee group selection, a minimap, selection handles, copy/paste/duplicate with offset remapping, live single and group resize handles backed by core `resizePreviewEntries`, rotate, align, cross-kind z-order actions for bays, bus lines, edges, and labels, delete/backspace removal, undo/redo, keyboard nudge actions, and fit selection/scene controls while keeping domain-specific SLD logic out of the route. Core now exposes headless `queryEntities()` for future search/filter panels without moving UI state or domain predicates into the demo route.
