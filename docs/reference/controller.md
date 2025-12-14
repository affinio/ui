# Controller API

`useMenuController()` exposes an imperative surface for cases where template syntax is not enough: command palettes, global keyboard shortcuts, or integrating context menus with data grids.

```ts
import { useMenuController } from '@workspace/menu-vue'

const controller = useMenuController()
```

## Snapshot

The controller carries a readonly `snapshot` ref:

```ts
watchEffect(() => {
  console.log(controller.snapshot.value.openPath)
})
```

`openPath` lists the IDs of open menus, `highlightedId` tracks the active item, and `items` contains metadata for every registered node.

## Methods

| Method | Signature | Description |
| --- | --- | --- |
| `open` | `(id: string) => void` | Opens a menu or submenu by ID (usually the `value` prop). |
| `close` | `(id?: string) => void` | Closes a specific branch or the entire tree when omitted. |
| `highlight` | `(id: string | null) => void` | Manually move focus/highlight. Pass `null` to clear. |
| `select` | `(id: string) => void` | Trigger the `select` flow as if the user activated the item. |
| `setOptions` | `(options: Partial<MenuOptions>) => void` | Update delays, prediction, and positioning at runtime. |

## Programmatic context menus

Combine the controller with pointer coordinates to show a context menu without a visible trigger:

```vue
<script setup lang="ts">
import { useMenuController } from '@workspace/menu-vue'

const controller = useMenuController()

const onContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  controller.open('root')
  controller.setOptions({ anchorPoint: { x: event.clientX, y: event.clientY } })
}
</script>

<template>
  <div class="Canvas" @contextmenu="onContextMenu">
    <!-- The UiMenu lives elsewhere and reads the same controller -->
  </div>
</template>
```

## Controlled open state

You can control `UiMenu` like any other Vue component:

```vue
<UiMenu v-model:open="isOpen" :options="{ mousePrediction: false }">
  ...
</UiMenu>
```

Pair controlled state with the controller when you need external stores to drive the menu.

## Debug helpers

- `controller.log()` (dev only) prints the tree to the console.
- Inspect `controller.snapshot.value.items[id].rect` to see the last measured DOMRect for positioning issues.
- Use Vue Devtools to inspect the `MenuProvider` component when validating nested structures.

## Global shortcuts

Register keyboard shortcuts that trigger menu items even when the menu is closed:

```vue
<script setup lang="ts">
import { useMenuShortcuts } from '@workspace/menu-vue'

useMenuShortcuts({
  rename: 'F2',
  duplicate: 'Meta+D',
  delete: 'Delete',
})
</script>
```

The helper ignores inputs, textareas, and contenteditable regions so forms stay usable. Provide menu item IDs as keys and shortcut strings as values in the `Ctrl+Shift+P` format.

More real-world flows live in the [guides](../guide/context-menu.md).
