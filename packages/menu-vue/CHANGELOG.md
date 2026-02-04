# @affino/menu-vue

## 1.1.0

### Minor Changes

- Default every Vue controller/component to the document-scoped `@affino/overlay-kernel` manager so menus participate in the shared overlay stack while still allowing custom managers or kinds via `options.overlayManager`, `options.getOverlayManager`, and `options.overlayKind`.

### Patch Changes

- Added dependency on `@affino/overlay-kernel`.

## 1.0.0

### Minor Changes

- 46f27ff: first changeset

### Patch Changes

- Updated dependencies [46f27ff]
  - @affino/focus-utils@1.0.0
  - @affino/menu-core@1.0.0
  - @affino/overlay-host@1.0.0
