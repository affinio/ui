# @affino/popover-vue

## 1.1.0

### Minor Changes

- Default `usePopoverController` to the document-level `@affino/overlay-kernel` manager so popovers automatically participate in the shared overlay stack while still honoring custom `overlayManager` / `getOverlayManager` overrides.

### Patch Changes

- Added dependency on `@affino/overlay-kernel`.

## 1.0.0

### Minor Changes

- 46f27ff: first changeset

### Patch Changes

- Updated dependencies [46f27ff]
  - @affino/overlay-host@1.0.0
  - @affino/popover-core@1.0.0
