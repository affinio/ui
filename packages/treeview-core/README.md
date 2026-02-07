# @affino/treeview-core

Headless treeview engine for focus, selection, and expansion logic.

## Installation

```bash
pnpm add @affino/treeview-core
```

## Quick start

```ts
import { TreeviewCore } from "@affino/treeview-core"

const tree = new TreeviewCore<string>({
  nodes: [
    { value: "root", parent: null },
    { value: "child", parent: "root" },
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

- `registerNodes(nodes, options?)`
- `expandPath(value)`
- `clearSelection()`
- `getVisibleValues()`
- `getChildren(value)` / `getParent(value)`
- `isExpanded(value)` / `isSelected(value)` / `isActive(value)`
- `getSnapshot()`
- `subscribe(listener)`
- `destroy()`

## Snapshot guarantees

- `getSnapshot()` returns a frozen immutable object.
- `expanded` inside snapshot is also frozen.
- Snapshot reference stays stable for no-op/failure requests.

## Guardrails

- Keep stable node ids (`value`) across re-renders.
- Use `request*` results to handle invalid user intents explicitly.
- Treat snapshots as immutable outputs.
- Keep one canonical tree state source in adapter state.
