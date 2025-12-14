# Context Menu Guide

Context menus behave like native right-click menus but stay inside Vue's reactivity system. You can rely on triggers, open the menu programmatically, or mix both.

## Right-click trigger

```vue
<UiMenu trigger="contextmenu">
  <UiMenuContent class="MenuPanel">
    <UiMenuItem asChild value="refresh" @select="refresh">
      <button class="MenuItem">Refresh data</button>
    </UiMenuItem>
    <UiMenuItem asChild value="inspect" @select="inspect">
      <button class="MenuItem">Inspect row</button>
    </UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

- Set `trigger="contextmenu"` on `UiMenu`.
- The trigger listens to `contextmenu` events on its closest `UiMenuTrigger`. If you omit the trigger, the menu still opens on the element that wraps `UiMenu`.

## Programmatic context menu

Some layouts (tables, canvas, maps) need pointer coordinates. Use the controller to open at the cursor location.

```vue
<script setup lang="ts">
import { useMenuController } from '@workspace/menu-vue'

const controller = useMenuController()
const showContextMenu = (event: MouseEvent, channel = 'file-menu') => {
  event.preventDefault()
  controller.close(channel)
  controller.setOptions({ anchorPoint: { x: event.clientX, y: event.clientY }, channel })
  controller.open(channel)
}
</script>

<template>
  <div class="DataGrid" @contextmenu="(event) => showContextMenu(event)">
    <UiMenu :channel="'file-menu'">
      <UiMenuContent class="MenuPanel">
        <UiMenuItem value="duplicate" asChild @select="duplicate">
          <button class="MenuItem">Duplicate</button>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>
  </div>
</template>
```

### Coordinate anchoring

- `anchorPoint` accepts viewport coordinates; the menu positions relative to that point instead of a trigger DOMRect.
- Fallback to default positioning by clearing `anchorPoint` when you close the menu.

## Per-row menus in tables

Wrap each row with its own `UiMenu` or share a single instance and feed row data through a store. Example with per-row instances:

```vue
<tr v-for="row in rows" :key="row.id" @contextmenu.prevent>
  <UiMenu :channel="`row-${row.id}`" trigger="contextmenu">
    <UiMenuTrigger asChild>
      <td>{{ row.name }}</td>
    </UiMenuTrigger>
    <UiMenuContent class="MenuPanel">
      <UiMenuItem asChild @select="() => archive(row.id)">
        <button class="MenuItem">Archive {{ row.name }}</button>
      </UiMenuItem>
    </UiMenuContent>
  </UiMenu>
</tr>
```

When rows virtualize, prefer the single-controller pattern above to avoid mounting dozens of menus.

## Keyboard access

Native context menus are pointer only, so add your own shortcuts:

```ts
useMagicKeys({ onEventFired(_, event) {
  if ((event.metaKey || event.ctrlKey) && event.key === '/') {
    controller.open('command-menu')
  }
}})
```

Pair this with `anchorPoint` to pin the menu to a fixed corner or focused row.

## Testing

- Fire `pointerdown` + `contextmenu` events in Playwright or Cypress to assert behavior.
- Assert `data-state="open"` on `UiMenuContent` instead of brittle timing checks.

See also [virtualized menus](./virtualization.md) if your context menu renders thousands of items.
