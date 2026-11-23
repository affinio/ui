# @affino/diagram-vue

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

