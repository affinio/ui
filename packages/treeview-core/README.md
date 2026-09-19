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

## Request API (deterministic)

Use `request*` methods for explicit success/failure semantics:

- `requestFocus(value)`
- `requestSelect(value)`
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
  | { ok: false; changed: false; reason: "missing-node" | "disabled-node" | "leaf-node" | "no-focusable-node" | "boundary" }
```

## Compatibility wrappers

Legacy imperative methods remain and delegate internally:

- `focus`, `select`, `expand`, `collapse`, `toggle`
- `focusFirst`, `focusLast`, `focusNext`, `focusPrevious`

## Other API

- `registerNodes(nodes, options?)` — default mode replaces the source; use `{ mode: "patch" }` for upserts without removing omitted nodes. Returns `{ changed, topologyChanged }`, so adapters can skip downstream work for no-op updates.
- `expandPath(value)`
- `clearSelection()`
- `getVisibleValues()`
- `getVisibleCount()` / `getVisibleAt(index)` / `getVisibleWindow(start, end)`
- `setSearchQuery(query)` / `clearSearchQuery()` / `getSearchMatchCount()`
- `getChildren(value)` / `getParent(value)`
- `isExpanded(value)` / `isSelected(value)` / `isActive(value)`
- `getSnapshot()`
- `subscribe(listener)`
- `destroy()`

## Search projection

Nodes can provide `text`, or consumers can pass `textAccessor` in options. `setSearchQuery(query)` filters the visible projection to matching nodes and their ancestors without mutating expansion state. `TreeviewNodeMeta.matched` marks direct matches for UI highlighting. Clearing the query restores the regular expansion-driven visible projection.

## Snapshot guarantees

- `getSnapshot()` returns a frozen immutable object.
- `expanded` inside snapshot is also frozen.
- Snapshot reference stays stable for no-op/failure requests.

## Guardrails

- Keep stable node ids (`value`) across re-renders.
- Use `request*` results to handle invalid user intents explicitly.
- Use `registerNodes` result flags to distinguish content changes from topology changes when coordinating virtualization or derived indexes.
- Treat snapshots as immutable outputs.
- Keep one canonical tree state source in adapter state.
- `value` must be unique and stable; `null` is reserved for root parents.
- The model supports one active node and one selected node. Multi-select, async loading, drag-and-drop, and variable row heights are not provided by this package.
