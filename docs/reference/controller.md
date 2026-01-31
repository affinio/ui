# Controller API

`MenuController` is the imperative surface behind every `<UiMenu>`. Use it for command palettes, custom shortcuts, and context menus that open at the pointer—regardless of whether you use the Vue or React adapter.

You get a controller in two ways:

1. Grab it from a template ref (Vue):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { UiMenu } from '@affino/menu-vue'

const menuRef = ref<InstanceType<typeof UiMenu> | null>(null)

const openMenu = () => menuRef.value?.controller.open('programmatic')
</script>

<template>
  <UiMenu ref="menuRef">
    ...
  </UiMenu>
</template>
```

2. Create one manually when you need a headless setup (works in both frameworks):

```ts
import { useMenuController } from '@affino/menu-vue'

const controller = useMenuController({ kind: 'root', options: { closeOnSelect: false } })
```

```tsx
import { useMenuController } from "@affino/menu-react"

const controller = useMenuController({ kind: "root", options: { closeOnSelect: false } })
```

`useMenu()` returns the same trio (`core`, `state`, `controller`) if you want the helper that `<UiMenu>` uses internally. In React the helper lives in `@affino/menu-react` as well.

## State

`controller.state` is a `ShallowRef<MenuState>` containing `{ open: boolean, activeItemId: string | null }`:

```ts
watch(
  () => controller.state.value,
  (next) => {
    console.log('open?', next.open, 'focused item', next.activeItemId)
  },
  { immediate: true }
)
```

Use the `callbacks` prop on `<UiMenu>`/`<UiSubMenu>` if you prefer event-style hooks (`onOpen`, `onClose`, `onSelect`, `onHighlight`, `onPositionChange`).

## Methods

| Method | Signature | Description |
| --- | --- | --- |
| `open` | `(reason?: 'pointer' \| 'keyboard' \| 'programmatic') => void` | Opens the menu. Reason is optional metadata for analytics / callbacks. |
| `close` | `(reason?: 'pointer' \| 'keyboard' \| 'programmatic') => void` | Closes the menu and clears highlight when needed. |
| `toggle` | `() => void` | Convenience wrapper around `open`/`close`. |
| `highlight` | `(id: string | null) => void` | Manually move focus to a known item ID (set `null` to clear). |
| `select` | `(id: string) => void` | Fire the selection flow as if the user activated the item. Honors `closeOnSelect`. |
| `setAnchor` | `(rect: Rect | null) => void` | Override the anchor geometry. Pass `{ x, y, width: 0, height: 0 }` for pointer-driven menus. |
| `recordPointer` | `(point: { x: number; y: number }) => void` | Submenu-only helper used for mouse prediction. |
| `setTriggerRect` / `setPanelRect` | `(rect: Rect | null) => void` | Submenu helpers that sync geometry with the parent chain. |
| `dispose` | `() => void` | Tears down subscriptions when you create controllers manually.

Every controller also exposes `triggerRef`, `panelRef`, and `anchorRef` so you can plug into positioning or focus logic.

## Programmatic context menus

Combine the controller with pointer coordinates to open without a visible trigger (expanded from the [guide](../guide/context-menu.md)):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { UiMenu, UiMenuContent, UiMenuItem } from '@affino/menu-vue'

const contextRef = ref<InstanceType<typeof UiMenu> | null>(null)

const showContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  const controller = contextRef.value?.controller
  if (!controller) return
  controller.setAnchor({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
  controller.open('pointer')
}

const hideContextMenu = () => {
  const controller = contextRef.value?.controller
  controller?.close('pointer')
  controller?.setAnchor(null)
}
</script>

<template>
  <div class="Canvas" @contextmenu="showContextMenu" @pointerdown="hideContextMenu">
    <UiMenu ref="contextRef">
      <UiMenuContent class="MenuPanel">
        <UiMenuItem asChild id="refresh" @select="refresh">
          <button class="MenuItem">Refresh data</button>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>
  </div>
</template>
```

## Debug helpers

- Inspect `controller.state.value` to confirm whether a menu thinks it is open/highlighted.
- Pass `callbacks.onHighlight`/`onOpen` to `<UiMenu>` for lightweight logging.
- When you create controllers manually, call `controller.core.subscribe(...)` if you need lower-level snapshots; remember to unsubscribe.
- Enable verbose console traces by setting `DEBUG_MENU=1` in your dev env (Vite, Next.js, etc.) or by toggling `window.__MENU_DEBUG__ = true` in the browser console. Every adapter now pipes those flags through to the underlying core so pointer heuristics, focus changes, and positioning logs become visible.

## Global shortcuts

Register keyboard shortcuts that trigger menu items even when the panel is closed (call inside the menu subtree so the hook can read the provider):

```vue
<script setup lang="ts">
import { useMenuShortcuts } from '@affino/menu-vue'

useMenuShortcuts({
  rename: 'F2',
  duplicate: 'Meta+D',
  delete: 'Delete',
})
</script>
```

```tsx
import { useMenuShortcuts } from "@affino/menu-react"

useMenuShortcuts({
  rename: "F2",
  duplicate: "Meta+D",
  delete: "Delete",
})
```

The helper ignores inputs, textareas, and contenteditable regions so forms stay usable. Provide menu item IDs as keys and shortcut strings as values (e.g. `Ctrl+Shift+P`).
