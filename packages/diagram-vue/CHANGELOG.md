# @affino/diagram-vue

## 0.23.0

### Minor Changes

- Exposed `beginBezierCreation()`, `finishBezierCreation()`, and `beginBezierHandle()` through the typed pointer controller, including reactive draft and handle previews.
- Added `DiagramBezierOverlay` for SVG-native cubic previews, anchors, tangent guides, and zoom-stable editing handles; Enter finishes and Escape cancels an active draft.
- Projected all four side resize handles for selected entities and group selections, added typed `beginResizeHandle()`/`beginResizeSelectionHandle()` methods, and routed Escape cancellation through Core.

## 0.22.0

### Minor Changes

- Added midpoint handles for orthogonal connector segments and exposed `beginEdgeSegmentHandle()` plus reactive `edgeSegmentPreview` through the pointer controller.
- Updated the Core workspace dependency for segment editing and related connector interaction fixes.
- Exposes Core's `snap.portTolerancePx` through `useDiagramPointerController()` for independent zoom-stable connector port capture.

## 0.21.1

### Patch Changes

- Preserve camera position and zoom when ResizeObserver updates the viewport extent; page constraints no longer cause incremental camera drift during layout changes.

## 0.21.0

### Minor Changes

- Exposed Core's runtime scene editing lock in the reactive pointer snapshot and refreshes/cancels active previews when the lock changes.
- Native SVG projections preserve Core cubic Bézier path commands and compound contour fill behavior.


## 0.20.0

### Minor Changes

- Added `beginPortCreation()` and reactive port placement preview through `useDiagramPointerController()`.
- Exported `getSvgPortCreationPreviewProps()` to render the transient marker from the Core snapshot without DOM geometry workarounds.
- Updated the workspace dependency to `@affino/diagram-core` 0.21.0.

## 0.19.0

### Minor Changes

- Exposed anchored port host and anchor descriptors through the SVG renderer projection while rendering and hit targets continue to use Core geometry snapshots.
- Updated the workspace dependency to `@affino/diagram-core` 0.20.0.

## 0.18.0

### Minor Changes

- Forwarded live Shift constraints through click-to-place line and path interactions.
- Rendered table title vertical alignment and added an accessible alignment control.
- Updated the workspace dependency to `@affino/diagram-core` 0.19.0.

## 0.17.0

### Minor Changes

- Added SVG path-data projection for exact circular contours.
- Added Arc, Trim, Trim & Join, and Subtract controls with preview and apply flows to the diagram playground.
- Updated the workspace dependency to `@affino/diagram-core` 0.18.0.

## 0.16.0

### Minor Changes

- Exposed click-to-place line, path, and connector methods and reactive Core preview snapshots through `useDiagramPointerController()`.
- Projected selected path vertices and connector waypoints as typed editing handles.
- Updated the workspace dependency to `@affino/diagram-core` 0.17.0.

## 0.15.0

### Minor Changes

- Render Core rectangle corner radii through SVG `rx`/`ry` projection.
- Render and edit optional table titles through `DiagramTableView` and `useDiagramTable`, without treating titles as data rows or cells.
- Updated the `@affino/diagram-core` workspace dependency to 0.16.0.

## 0.14.0

### Minor Changes

- Exposed typed snap markers, constraint state, numeric input, line and connector creation, and preview geometry through `useDiagramPointerController()`.
- Added zero-based `v-model:active-cell`, accessible selected-cell state, arrow-key event isolation, and screen-sized row/column resize handles with cancelable previews.
- Updated the `@affino/diagram-core` workspace dependency to 0.15.0.

## 0.13.0

### Minor Changes

- Added optional viewport constraints to `useDiagramPointerController()` and `useDiagramViewport()`. Pan gestures and programmatic viewport updates are clamped consistently when configured.
- Updated the `@affino/diagram-core` workspace dependency to 0.14.0.

## 0.12.0

### Minor Changes

- Group rotation updates Vue selection bounds and toolbar capability checks through the existing reactive scene controller; table views render their Core rotation.
- Updated the `@affino/diagram-core` workspace dependency to 0.13.0.

## 0.11.1

### Patch Changes

- Starting cell editing with a printable key now replaces the current text while preserving IME and shortcut behavior. Added a theme-token-backed `:focus-visible` cell ring without changing grid strokes.

## 0.11.0

### Minor Changes

- Included Core flip transforms in SVG/DOM render props and reflected `DiagramTableView` content with its table geometry.
- Updated the `@affino/diagram-core` workspace dependency to 0.12.0.

## 0.10.0

### Minor Changes

- `DiagramTableView` accepts an optional `DiagramPointerController` and renders live table movement and resize previews, including multi-selection and Core group resize. Previews do not change the committed scene until pointer-up.
- Added `showToolbar?: boolean` to `DiagramTableView` (default `true`) so applications can place table commands in an external inspector while retaining cell editing.
- Updated the `@affino/diagram-core` workspace dependency for table resize preview projection.

## 0.9.0

### Minor Changes

- Added `DiagramTableView` and `useDiagramTable` for SVG-native table rendering, accessible cell editing/navigation, and undoable row, column, alignment, and border controls backed by `@affino/diagram-core`.

## 0.8.0

### Minor Changes

- Updated the core dependency to `@affino/diagram-core` 0.10.0. Existing pointer events continue forwarding `shiftKey` for endpoint and resize constraints.

## 0.7.0

### Minor Changes

- Updated the core dependency to `@affino/diagram-core` 0.9.0 for Shift-constrained selection dragging; the existing pointer adapter forwards the modifier state.

## 0.6.0

### Minor Changes

- Exposed drag snap guides through the public pointer interaction snapshot and added snapping options to `useDiagramPointerController()`.

## 0.5.0

### Minor Changes

- Projected source and target endpoint handles for selected edges to `activeHandles`.
- Updated the core dependency to `@affino/diagram-core` 0.6.0 for endpoint drag previews and commits.

## 0.4.0

### Minor Changes

- Updated the adapter's core dependency to `@affino/diagram-core` 0.5.0, exposing undoable multi-entity metadata updates through the existing engine command API.

## 0.3.0

### Minor Changes

- Batched pointer-driven snapshot publication to one animation-frame update.
- Corrected rotated rendering geometry and external text-editor viewport synchronization.
- Preserved stable Vue projections for unchanged geometry while keeping interaction cleanup deterministic.

