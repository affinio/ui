# @affino/treeview-core

Headless treeview engine for focus, selection, and expansion logic.

The core is headless: it does not render DOM or provide ARIA attributes. The Vue/Laravel adapters own keyboard event wiring and accessibility markup.

## Installation

```bash
pnpm add @affino/treeview-core
```

## Quick start

```ts
import { TreeviewCore } from "@affino/treeview-core"

const tree = new TreeviewCore<string>({
  nodes: [
    { value: "root", parent: null, text: "Workspace" },
    { value: "child", parent: "root", text: "Security settings" },
  ],
  defaultExpanded: ["root"],
  defaultActive: "root",
})

tree.requestFocus("child")
tree.requestSelect("child")
```

Multiple selection is opt-in with `selectionMode: "multiple"`; single selection remains the default. In multiple mode, `requestSelect(value, { ctrlKey: true })` or `{ metaKey: true }` toggles a value, while `{ shiftKey: true }` selects the enabled visible range from the stable `anchorValue`. Collapsed descendants are not part of a range and disabled nodes are skipped. `selectedValues` is ordered by tree traversal, independent of click order. A range request targeting a hidden node fails with `not-visible`. `requestFocusNext({ extendSelection: true })` and `requestFocusPrevious({ extendSelection: true })` provide Shift+Arrow behavior without coupling focus to selection.

Snapshots retain the legacy `selected` field and add `selectedValues`, `anchorValue`, and `focusedValue` (an alias of `active`). In multiple mode, the legacy scalar points to the active value while it is selected, otherwise to the last selected value in tree order. `TreeviewNodeMeta.selected` and `isSelected(value)` reflect membership in the full selection.

## Request API (deterministic)

Use `request*` methods for explicit success/failure semantics:

- `requestFocus(value)`
- `requestSelect(value)`
- `requestToggleSelection(value)` / `requestRangeSelection(value)`
- `requestExpand(value)`
- `requestCollapse(value)`
- `requestToggle(value)`
- `requestFocusFirst()`
- `requestFocusLast()`
- `requestFocusNext()`
- `requestFocusPrevious()`

Return type:

```ts
type TreeviewActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; changed: false; reason: "missing-node" | "disabled-node" | "not-visible" | "leaf-node" | "no-focusable-node" | "boundary" }
```

## Compatibility wrappers

Legacy imperative methods remain and delegate internally:

- `focus`, `select`, `expand`, `collapse`, `toggle`
- `focusFirst`, `focusLast`, `focusNext`, `focusPrevious`

## Other API

- `registerNodes(nodes, options?)` — default mode replaces the source; use `{ mode: "patch" }` for upserts without removing omitted nodes. Returns `{ changed, topologyChanged }`, so adapters can skip downstream work for no-op updates.
- `removeNodes(values)` — removes each existing ID and its full subtree. Missing IDs are ignored. If active/selected is removed, the nearest surviving ancestor becomes active/selected; root removal falls back to `null`.
- `batch(callback)` — groups synchronous notifications across nested operations into one final notification. Mutations are applied immediately and are not rolled back if the callback throws; the final state is still published before the error is rethrown.
- `expandPath(value)`
- `clearSelection()`
- `getSelectedValues()`
- `subscribeInteractions(listener)` with `requestBeginDrag`, `requestHoverDrop`, `requestResolveDrop`, `requestCancelDrag`, and `requestClipboardIntent`
- `getVisibleValues()`
- `getVisibleCount()` / `getVisibleAt(index)` / `getVisibleWindow(start, end)`
- `setSearchQuery(query)` / `clearSearchQuery()` / `getSearchMatchCount()`
- `getChildren(value)` / `getParent(value)`
- `isExpanded(value)` / `isSelected(value)` / `isActive(value)`
- `getSnapshot()`
- `subscribe(listener)`
- `destroy()`

## Search projection

Nodes can provide `text`, or consumers can pass `textAccessor` in options. `setSearchQuery(query)` creates a temporary visible projection containing direct matches, their ancestor paths, and descendants of direct matches. Ancestors needed to reach a match expand temporarily; a matching node's own descendants appear only when that node is effectively expanded. Descendants are not recursively expanded. `TreeviewNodeMeta.matched` marks direct matches for UI highlighting. Expand/collapse actions during search are temporary overrides, including on required ancestors, and do not alter the snapshot's persistent `expanded` state. Changing the query starts a fresh override session. Clearing the query discards search overrides and restores the normal expansion-driven projection.

Search-only expand/collapse actions publish a fresh snapshot notification so subscribers can refresh derived UI state. The snapshot's `expanded` array remains the persistent state; use `getNodeMeta(value).expanded` for effective visual expansion during search.

## Snapshot guarantees

- `getSnapshot()` returns a frozen immutable object.
- `expanded` inside snapshot is also frozen.
- Snapshot reference stays stable for no-op/failure requests.
- A batch publishes at most one final snapshot; reads inside the callback see already-applied operations.

## Guardrails

- Keep stable node ids (`value`) across re-renders.
- Use `request*` results to handle invalid user intents explicitly.
- Use `registerNodes` result flags to distinguish content changes from topology changes when coordinating virtualization or derived indexes.
- Treat snapshots as immutable outputs.
- Keep one canonical tree state source in adapter state.
- `value` must be unique and stable; `null` is reserved for root parents.
- The model supports one focused node and opt-in multiple selection. Drag methods publish typed start/hover/accepted/rejected intent events; they never change hierarchy. Clipboard requests publish selected values and an optional paste target; they never read or write the system clipboard. Consumers provide geometry and keyboard event bindings, validate drop intent, and mutate/persist their own domain model. Async child loading and variable row heights remain outside this package.
- For a rendered multiple-selection tree, expose `aria-multiselectable="true"` on the tree and keep `aria-selected` in sync with `TreeviewNodeMeta.selected`; focus remains represented by the active/focused node independently of selection. Bind modifier keys from the renderer to `requestSelect(value, modifiers)`. Clipboard key handlers belong to the consumer so editable descendants retain their native shortcuts.
