# Context Menu Guide

Context menus behave like native right-click menus but stay inside your framework's reactivity system. You can rely on triggers, open the menu programmatically, or mix both. The snippets below use Vue syntax; React users can translate `@select` to `onSelect` and `v-model` style bindings to hooks (see the React example in [getting-started](../getting-started.md)).

## Right-click trigger

```vue
<UiMenu>
  <UiMenuTrigger asChild trigger="contextmenu">
    <button class="MenuButton">Open context menu</button>
  </UiMenuTrigger>
  <UiMenuContent class="MenuPanel">
    <UiMenuItem asChild @select="refresh">
      <button class="MenuItem">Refresh data</button>
    </UiMenuItem>
    <UiMenuItem asChild @select="inspect">
      <button class="MenuItem">Inspect row</button>
    </UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

- Set `trigger="contextmenu"` on `UiMenuTrigger` to react to right clicks (leave it off for normal clicks).
- The trigger listens to pointer events on the element you pass through `asChild`, so you can wrap table cells, cards, or any other DOM node.

## Programmatic context menu

Some layouts (tables, canvas, maps) need pointer coordinates. Use the exposed controller to anchor the menu at the cursor location.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { UiMenu, UiMenuContent, UiMenuItem } from '@affino/menu-vue'

const fileMenuRef = ref<InstanceType<typeof UiMenu> | null>(null)

const showContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  const controller = fileMenuRef.value?.controller
  if (!controller) return
  controller.setAnchor({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
  controller.open('pointer')
}

const hideContextMenu = () => {
  const controller = fileMenuRef.value?.controller
  controller?.close('pointer')
  controller?.setAnchor(null)
}
</script>

<template>
  <div class="DataGrid" @contextmenu="showContextMenu" @pointerdown="hideContextMenu">
    <UiMenu ref="fileMenuRef">
      <UiMenuContent class="MenuPanel">
        <UiMenuItem asChild @select="duplicate">
          <button class="MenuItem">Duplicate</button>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>
  </div>
</template>
```

### Coordinate anchoring

- `controller.setAnchor({ x, y, width: 0, height: 0 })` pins the menu to a viewport point instead of the trigger DOMRect.
- Call `controller.setAnchor(null)` before reopening if you want to fall back to the trigger position.

## Per-row menus in tables

Wrap each row with its own `UiMenu` or keep a single `<UiMenu>` and reuse its controller with `setAnchor`. Example with per-row instances:

```vue
<tr v-for="row in rows" :key="row.id" @contextmenu.prevent>
  <UiMenu>
    <UiMenuTrigger asChild trigger="contextmenu">
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

When rows virtualize, prefer the single-controller pattern so you do not mount dozens of menus.

## Keyboard access

Native context menus are pointer only, so add your own shortcuts. Reuse the controller reference from the examples above:

```ts
useMagicKeys({
  onEventFired(_, event) {
    if ((event.metaKey || event.ctrlKey) && event.key === '/') {
      fileMenuRef.value?.controller.open('keyboard')
    }
  },
})
```

Pair this with `controller.setAnchor` to pin the menu to a fixed corner or focused row.

## Testing

- Fire `pointerdown` + `contextmenu` events in Playwright or Cypress to assert behavior.
- Assert `data-state="open"` on `UiMenuContent` instead of brittle timing checks.

See also [virtualized menus](./virtualization.md) if your context menu renders thousands of items.
