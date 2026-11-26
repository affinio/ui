# @affino/treeview-vue

Vue composable wrappers for `@affino/treeview-core`.

The virtual adapter assumes a fixed row height and a fixed-height viewport. It keeps the visible window bounded and refreshes from core subscriptions; consumers remain responsible for rendering tree semantics and ARIA attributes.

## Scripts

```bash
pnpm --filter @affino/treeview-vue build
pnpm --filter @affino/treeview-vue test
```

## Search

`useTreeviewController()` and `useVirtualTreeviewController()` expose `setSearchQuery(query)`, `clearSearchQuery()`, and `getSearchMatchCount()` from `@affino/treeview-core`. Virtual rows include `matched` metadata for direct search hits.

`rowHeight` is measured in CSS pixels and must be positive. `overscan` is a row count. Controllers preserve single selection by default and forward opt-in `selectionMode: "multiple"`, including modifier selection, range extension, anchor/focused values, drag/drop intent events, and clipboard intents. They do not render DOM or mutate application data.

In multiple mode, pass click modifiers to `requestSelect(value, modifiers)` and call `requestFocusNext({ extendSelection: true })` / `requestFocusPrevious({ extendSelection: true })` from Shift+Arrow handlers. Ranges use enabled currently visible nodes; collapsed descendants are excluded and disabled nodes are skipped. Keyboard listener ownership stays with the renderer, which can avoid intercepting shortcuts from editable descendants.

Subscribe to `subscribeInteractions()` for drag/drop and clipboard intents. The consumer computes drop position from rendered geometry, validates the intent, and applies/persists domain changes; `requestResolveDrop(accepted)` reports the result through the interaction subscription. Clipboard intent methods do not access the browser clipboard.

## Core result parity

The Vue controllers preserve the core result contracts. Patch registration can be used without reaching into the underlying core:

```ts
const registration = controller.registerNodes(nodes, { mode: "patch" })
if (registration.changed) {
  // Recompute only the projections affected by this registration.
}

const focus = controller.requestFocus(value)
if (!focus.ok) {
  // Handle missing, disabled, or boundary intents explicitly.
}
```

`registerNodes()` returns `{ changed, topologyChanged }`. The `request*` methods return the same `TreeviewActionResult` as `@affino/treeview-core`; legacy imperative methods remain available for compatibility. `requestArrowLeft()` and `requestArrowRight()` forward the core APG navigation actions; renderer keyboard handlers can use them without coupling focus to selection. The virtual controller refreshes its visible window after these operations while returning the original result.

Both controllers expose `removeNodes(ids)` (including subtree deletion) and `batch(callback)`. Batches publish one final state notification, including when a nested callback throws; applied changes are not rolled back. Virtual row state updates synchronously after core notifications. Scroll-driven updates remain coalesced through animation frames.

## Lazy children

Declare a branch before its children are available with `hasChildren: true`. The `childCount` metadata continues to count only registered children; `hasChildren` stays true while the node is unloaded so it remains expandable. `getNodeMeta(value)` and `getChildrenLoadState(value)` expose a typed `childrenLoadState` of `unloaded`, `loading`, `loaded`, or `error`.

Expanding an unloaded branch starts one request and emits the typed `children.load.requested` interaction with `{ value, requestId }`. The package performs no I/O. A loading request is not repeated by collapse/re-expand; a failed request also requires an explicit retry. `startChildrenLoad(value)` can start or supersede an in-flight request, `failChildrenLoad(value, requestId)` records a current failure, and `retryChildrenLoad(value)` starts a fresh request only from the error state. Completion accepts only the active request ID. Pass returned nodes to `completeChildrenLoad` to atomically register them with patch mode and reject stale results:

```ts
const unsubscribe = controller.subscribeInteractions((event) => {
  if (event.type !== "children.load.requested") return
  loadChildren(event.value).then(
    (children) => controller.completeChildrenLoad(event.value, event.requestId, children),
    () => controller.failChildrenLoad(event.value, event.requestId),
  )
})

controller.requestExpand("root")
```

`completeChildrenLoad(value, requestId, nodes?)` patches supplied nodes through the public `registerNodes(nodes, { mode: "patch" })` path in one notification batch. It returns `false` for a superseded request and does not register those nodes. Applications can alternatively use `registerNodes` directly when they own stale-result checks. Retry policy, caching, placeholder rows, loading/error copy, and ARIA rendering remain application responsibilities. Lazy rows retain normal `hasChildren`/`childCount` metadata, and the virtual adapter refreshes its bounded window and total height after accepted child registration while anchoring the current visible row.
