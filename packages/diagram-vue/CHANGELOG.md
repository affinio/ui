# @affino/diagram-vue

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

