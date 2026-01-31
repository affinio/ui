# @affino/popover-vue

Renderless Vue 3 helpers that wrap `@affino/popover-core`. Keep ownership of your DOM while the controller manages ARIA wiring, outside clicks, Escape handling, and floating geometry.

## Install

```bash
pnpm add @affino/popover-vue
# or
yarn add @affino/popover-vue
# or
npm install @affino/popover-vue
```

## Quick start

```vue
<script setup lang="ts">
import { usePopoverController, useFloatingPopover } from "@affino/popover-vue"

const controller = usePopoverController({ id: "filters" })
const floating = useFloatingPopover(controller, { placement: "bottom", gutter: 10 })
</script>

<template>
  <button ref="floating.triggerRef" v-bind="controller.getTriggerProps()">
    Filters
  </button>

  <Teleport :to="floating.teleportTarget">
    <div
      v-if="controller.state.value.open"
      ref="floating.contentRef"
      class="PopoverPanel"
      v-bind="controller.getContentProps()"
      :style="floating.contentStyle"
    >
      <span v-if="floating.arrowProps" class="PopoverArrow" v-bind="floating.arrowProps" :style="floating.arrowProps.style" />
      <slot />
    </div>
  </Teleport>
</template>
```

- `usePopoverController()` exposes the headless controller + prop helpers.
- `useFloatingPopover()` wires DOM refs to `computePosition()`, teleports into the overlay host, and closes on outside clicks when enabled.

## Controller API

| Method | Description |
| --- | --- |
| `controller.state` | `ShallowRef<PopoverState>` updated whenever the surface opens/closes |
| `controller.getTriggerProps(options?)` | Returns ARIA + event handlers for the trigger button |
| `controller.getContentProps(options?)` | Returns attributes + Escape handling for the floating surface |
| `controller.interactOutside(event)` | Close manually when you detect pointer/focus outside |
| `controller.open(reason?) / close(reason?) / toggle()` | Imperative controls |
| `controller.dispose()` | Tears everything down on unmount |

## Floating helper options

`useFloatingPopover(controller, options?)` accepts:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `placement` / `align` / `gutter` | See `computePosition()` | `"bottom" / "center" / 8` | Geometry inputs |
| `viewportPadding` | `number` | `8` | Collision padding |
| `strategy` | `'fixed' | 'absolute'` | `fixed` | Positioning strategy |
| `teleportTo` | `string | HTMLElement | false` | overlay host | Where the panel Teleport renders |
| `zIndex` | `number | string` | `120` | Applied to inline styles |
| `arrow` | `PopoverArrowOptions` | `undefined` | Arrow helper config |
| `closeOnInteractOutside` | `boolean` | `controller.core.shouldCloseOnInteractOutside()` | Auto-close on outside pointer/focus |
| `returnFocus` | `boolean` | `true` | Moves focus back to trigger after closing |
| `lockScroll` | `boolean` | `controller.core.isModal()` | Uses the overlay host scroll-lock helper |

The binding returns:

- `triggerRef`, `contentRef`, `contentStyle`, `teleportTarget`
- `arrowProps`, `updatePosition()`

It also wires document-level pointer/focus listeners to close the popover when the user clicks or tabs outside.

## Outside interactions

The helper already calls `controller.core.interactOutside()` when it detects pointer/focus outside. If you need custom analytics, pass a callback into the controller constructor.

## Accessibility hints

- Prefer `role="dialog"` for modal experiences. For menu-like popovers, pass `{ role: 'menu' }`.
- Keep the trigger focusable (button or custom element with `tabindex="0"`).
- When `lockScroll` is enabled, the helper uses `@affino/overlay-host` to freeze `body` scroll and restore it afterward.
