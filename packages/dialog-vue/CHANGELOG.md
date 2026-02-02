# @affino/dialog-vue

## 1.1.0

### Minor Changes

- Wire @affino/dialog-vue to a shared createDialogOverlayRegistrar so only the top-most dialog responds to backdrop/ESC, even in nested stacks, and update the demo to use handleBaseBackdropClick() for cascading closes.Add a Playwright regression (dialog overlays › backdrop clicks only close the top-most stack entry) to prove stacked dialogs dismiss in order.

### Patch Changes

- Updated dependencies
  - @affino/dialog-core@1.1.0

## 1.0.0

### Minor Changes

- 46f27ff: first changeset

### Patch Changes

- Updated dependencies [46f27ff]
  - @affino/dialog-core@1.0.0
