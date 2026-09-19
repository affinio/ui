# Changelog

## 0.3.0

### Minor Changes

- Forwarded `registerNodes` options and result flags through the Vue and virtual controllers.
- Exposed the core `request*` result contracts while preserving legacy imperative methods.
- Virtual updates now refresh the visible window while returning the original core result.

## 0.2.0

- Exposed search helpers from `useTreeviewController` and `useVirtualTreeviewController`.
- Added `matched` metadata to virtual rows for direct search hits.
- Improved virtual window refresh behavior for search, scroll, expand/collapse, and blank-viewport prevention.

## 0.1.0

- Initial release of `@affino/treeview-vue`.
