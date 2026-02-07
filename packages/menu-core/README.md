# @affino/menu-core

Headless menu engine for deterministic open/close state, keyboard navigation, submenu intent handling, and ARIA props.

Use this package when you need menu behavior without framework lock-in.

## Installation

```bash
pnpm add @affino/menu-core
```

## Public exports

```ts
import {
  MenuCore,
  SubmenuCore,
  createMenuTree,
  computePosition,
  MousePrediction,
  predictMouseDirection,
} from "@affino/menu-core"
```

## Core contracts

### `MenuCore`

```ts
const menu = new MenuCore(
  {
    id: "file-menu",
    closeOnSelect: true,
    loopFocus: true,
    openDelay: 80,
    closeDelay: 120,
  },
  {
    onSelect: (itemId, menuId) => {},
    onHighlight: (itemId, menuId) => {},
  },
)
```

Primary methods:

- `open(reason?)`
- `close(reason?)`
- `requestClose(reason?)`
- `toggle()`
- `subscribe(listener)`
- `getSnapshot()`
- `registerItem(id, { disabled? })`
- `getTriggerProps()`
- `getPanelProps()`
- `getItemProps(id)`
- `highlight(id | null)`
- `moveFocus(1 | -1)`
- `select(id)`
- `destroy()`

### `SubmenuCore`

```ts
const submenu = new SubmenuCore(menu, {
  parentItemId: "file-export",
  closeOnSelect: true,
})
```

Additional submenu methods:

- `setTriggerRect(rect | null)`
- `setPanelRect(rect | null)`
- `recordPointer({ x, y })`

`SubmenuCore` coordinates with parent menu tree and pointer-intent prediction.

### `createMenuTree`

```ts
const tree = createMenuTree({ options: { id: "root-menu" } })

const root = tree.root
root.registerItem("file")

const fileSubmenu = tree.createSubmenu({
  parent: root,
  parentItemId: "file",
})

const release = root.subscribe((state) => {
  // render
})

release.unsubscribe()
tree.destroy()
```

Branch wrapper (`MenuTreeBranch`) exposes a stable facade:

- `getSnapshot()`, `subscribe(...)`
- `getTriggerProps()`, `getPanelProps()`, `getItemProps(id)`
- `registerItem(id, options?)`
- `open/close/toggle/highlight/moveFocus/select`
- `geometry` / `pointer` adapters for submenu branches
- `destroy()`

Failure contract:

- `createSubmenu({ parentItemId })` throws if `parentItemId` is not registered in parent menu.
- Expected error: `Cannot create submenu for unregistered parent item "<id>". Register the parent item before calling createSubmenu().`

## Adapter responsibilities

`menu-core` owns:

- state transitions (open/close/highlight/select),
- keyboard semantics,
- ARIA prop contracts,
- submenu intent logic.

Adapter owns:

- DOM/render lifecycle,
- element measurement and positioning application,
- styling/animation,
- cleanup on unmount.

## Guardrails (anti-misuse)

- Keep one canonical menu state source (`subscribe` -> adapter state).
- Register items with stable ids and call unregister callbacks on unmount.
- Bind returned props as-is; avoid mixing conflicting custom key handlers in the same phase.
- For submenus, register parent item id before `createSubmenu(...)` call.
- Feed `recordPointer` + geometry only for submenu contexts; root menus do not need it.
- Always call `destroy()` for every `MenuCore`/`SubmenuCore`/tree branch.

## Positioning

`computePosition` is re-exported from `@affino/surface-core`:

```ts
const position = computePosition(anchorRect, panelRect, {
  placement: "bottom",
  align: "start",
  gutter: 8,
  viewportPadding: 12,
})
```

## Overlay integration

`MenuCore` can integrate with `@affino/overlay-kernel` via:

- `overlayManager`
- `getOverlayManager`
- `overlayKind`
- `overlayEntryTraits`

When using overlay kernel, pointer/keyboard close reasons are mediated through overlay manager before local close.

## Related packages

- `@affino/menu-laravel`
- `@affino/menu-vue`
- `@affino/menu-react`
