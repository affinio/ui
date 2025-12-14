# Virtualized Menu Guide

Large menus (command palettes, file browsers, search results) stay responsive when you combine Menu Vue with a virtualization library such as `vue-virtual-scroller` or `@tanstack/vue-virtual`.

## Goals

- Keep DOM node count low while preserving keyboard and pointer affordances.
- Maintain stable `value` identifiers so the controller can highlight correctly.
- Ensure items are still measurable for positioning (especially height for focus scroll).

## Setup with vue-virtual-scroller

```vue
<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'
import { UiMenu, UiMenuTrigger, UiMenuContent, UiMenuItem } from '@workspace/menu-vue'

const commands = computed(() => heavyList.value)
</script>

<template>
  <UiMenu>
    <UiMenuTrigger asChild>
      <button class="MenuButton">Cmd+K</button>
    </UiMenuTrigger>
    <UiMenuContent class="MenuPanel large">
      <RecycleScroller
        :items="commands"
        :item-size="40"
        key-field="id"
        v-slot="{ item }"
        class="MenuScroller"
      >
        <UiMenuItem :value="item.id" asChild @select="() => run(item)">
          <button class="MenuItem">{{ item.label }}</button>
        </UiMenuItem>
      </RecycleScroller>
    </UiMenuContent>
  </UiMenu>
</template>
```

### Tips

- Pass `:value="item.id"` (or any stable identifier). The virtualization layer may reuse DOM nodes, so avoid array indices.
- Give the scroller a fixed height so pointer intent triangles have real dimensions.
- If the virtualizer reorders DOM nodes, ensure it keeps focusable nodes mounted during keyboard navigation. Both packages above do.

## Dynamic heights

For variable height rows, measure each `UiMenuItem` when it mounts and feed the sizes back into the virtualizer. Most libraries expose an `onUpdate` callback for that.

## Keeping highlighted items in view

The controller emits `highlight-change` events. Scroll the virtualizer when the highlighted ID changes:

```ts
const controller = useMenuController()

watch(() => controller.snapshot.value.highlightedId, (id) => {
  if (!id) return
  virtualizer.scrollToIndex(indexFromId(id))
})
```

## Testing

- Render a small array in unit tests to avoid pulling in the virtualizer.
- In e2e suites, assert that `data-state="highlighted"` moves even when DOM nodes recycle.

Pair this guide with the [controller reference](../reference/controller.md) for more automation patterns.
