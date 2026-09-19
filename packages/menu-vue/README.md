# @affino/menu-vue

> Vue's most advanced headless menu system — instant accessibility, diagonal mouse prediction, and zero lock-in.

```vue
<script setup lang="ts">
import { UiMenu, UiMenuTrigger, UiMenuContent, UiMenuItem } from '@affino/menu-vue'
const actions = ['Edit', 'Duplicate', 'Archive']
</script>

<template>
  <UiMenu>
    <UiMenuTrigger>Actions</UiMenuTrigger>
    <UiMenuContent>
      <UiMenuItem v-for="action in actions" :key="action" @select="() => console.log(action)">
        {{ action }}
      </UiMenuItem>
    </UiMenuContent>
  </UiMenu>
</template>
```

```bash
npm install @affino/menu-vue
```

`@affino/menu-core` is bundled as an internal dependency of `@affino/menu-vue`, so Vue apps do not need to install it separately.

## Core Features

- Headless Vue 3 components powered by `@affino/menu-core`
- WAI-ARIA compliant keyboard and pointer handling out of the box
- Smart mouse prediction keeps submenus open during diagonal travel
- Unlimited submenu depth with shared tree state and focus safety
- `asChild` pattern lets you keep native elements and design systems
- Built-in context menu + click menu support with unified API
- Auto positioning and viewport collision handling without extra deps
- Snapshot-driven state subscriptions with focused Vue updates
- Programmatic controller for imperative open/close/highlight flows
- CSS variable theme surface for light/dark/brand combos
- First-class TypeScript types for every prop, event, and controller method
- Can be composed with virtualization strategies; benchmark your target item count

Docs → [./docs/index.md](./docs/index.md)

## Why this library exists

- **HeadlessUI** couples logic to Tailwind-era assumptions, lacks mouse prediction, and breaks under deep submenu trees.
- **Radix Vue** mirrors React APIs but still ties you to their opinionated slot structure and no framework-agnostic core.
- **Naive UI** ships batteries-included menus, but styling + behavior are inseparable, making custom UX nearly impossible.
- Designers demanded diagonal hover intent, perf on 1000-row tables, and context menus that feel native — so we built it.

## Highlights of architecture

- Shared observable menu tree keeps open/active paths in sync across levels.
- Pointer heuristics run outside Vue render cycle for predictable 60fps intent detection.
- Adapter layer returns ready-to-spread props so DOM stays under your control.
- Controller API exposes `open/close/highlight/select` hooks for automation.
- Positioner computes anchor/panel geometry with gutter + viewport padding inputs.
- `asChild` cloning ensures ARIA + event wiring survive custom elements.
- Core is framework-agnostic, so Menu Vue stays tiny and future-proof.

## Feature Comparison Table

| Feature | @affino/menu-vue |
|---------|---------------------|
| Smart mouse prediction | ✅ |
| Unlimited nested submenus | ✅ |
| Auto positioning | ✅ |
| `asChild` pattern | ✅ |
| Framework-agnostic core | ✅ |
| Context + click menus | ✅ |
| Programmatic controller | ✅ |
| Bundle size (unminified + gzip, current build) | 38.04 kB / 10.02 kB |
| Virtualization ready | ✅ |
| TypeScript coverage | 100% |

## Getting Started

1. `npm install @affino/menu-vue`
2. Import your global CSS followed by the menu styles in your app entry (usually `main.ts`) so the design tokens are available everywhere:

```ts
import '@affino/menu-vue/styles.css'
```

3. Wrap your trigger + content with `<UiMenu>` / `<UiMenuTrigger>` / `<UiMenuContent>`
4. Spread controller props onto your DOM via `asChild` when customizing
5. Add nested `<UiSubMenu>` components for multi-level trees (level 3+ supported)
6. Dive deeper in [docs/getting-started.md](./docs/getting-started.md)

## Positioning API

`UiMenu` and `UiMenuContent` now expose public positioning controls so teams can avoid local geometry hacks.

```vue
<UiMenu placement="bottom" align="start" :gutter="8" :viewport-padding="12">
  <UiMenuTrigger>Open</UiMenuTrigger>
  <UiMenuContent>
    <UiMenuItem id="edit">Edit</UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

Available props:

- `placement?: "top" | "bottom" | "left" | "right" | "auto"`
- `align?: "start" | "center" | "end" | "auto"`
- `gutter?: number`
- `viewportPadding?: number`

Behavior and compatibility:

- Defaults are preserved (`bottom` for root content, `right` for submenu content).
- `UiMenuContent` / `UiSubMenuContent` can override values passed from `UiMenu` / `UiSubMenu`.
- Props are forwarded to `useMenuPositioning` and then to `@affino/menu-core` positioning.

Options may be static values or Vue refs/getters when passed through the positioning composables. Item `disabled` state is reactive; when rendering keyed item lists, the adapter synchronizes DOM order before keyboard navigation.

Keyboard behavior follows the menu contract: `Home`/`End` move to the first/last enabled item, `Escape` closes and returns focus to the trigger, and `Tab` closes without trapping focus. `closeOnSelect` controls whether accepted item activation closes the current menu.


## Controller Surface

`useMenuController` is backed by `createMenuTree`, so every controller now exposes the same pointer + geometry helpers that power the core package. That means you can sync layout data or inject custom pointer samples without casting to `SubmenuCore`.

```ts
const controller = useMenuController({ kind: "root", options, callbacks })

watchEffect(() => {
  if (controller.state.value.open) {
    console.log("Active item", controller.state.value.activeItemId)
  }
})

// Optional helpers become available automatically for submenus
controller.recordPointer?.({ x: event.clientX, y: event.clientY })
controller.setTriggerRect?.(triggerRect)
controller.setPanelRect?.(panelRect)

// Anchors work for both context menus and custom positioning flows
controller.setAnchor(triggerRect)
```

- `recordPointer` feeds the diagonal intent heuristic so you can pipe in your own pointer stream (desktop, stylus, remote input, etc.).
- `setTriggerRect` / `setPanelRect` keep submenu geometry in sync after ResizeObserver updates or layout transitions.
- `setAnchor` lets you open at arbitrary coordinates (context menus, palettes, inspector panes) without writing glue code.

## Overlay kernel integration

`useMenuController` (and the components built on top of it) automatically register each menu surface with the shared `@affino/overlay-kernel` manager when `document` exists. Override stacking metadata via `:options="{ overlayKind, overlayEntryTraits }"`, or provide custom managers with `overlayManager` / `getOverlayManager`. During SSR the hook simply defers registration until hydration, so servers never touch the DOM and client-side managers stay in sync once mounted.


## Headless usage with createMenuTree

Need to integrate the Affino core into another renderer? Instantiate the helper directly — it returns the same branch objects the Vue controller now uses internally.

```ts
import { createMenuTree } from "@affino/menu-vue"

const tree = createMenuTree({ options: { openDelay: 60, closeDelay: 90 } })

tree.root.registerItem("file")

const submenu = tree.createSubmenu({
  parent: tree.root,
  parentItemId: "file",
})

submenu.geometry?.sync({
  trigger: document.querySelector("[data-file]")?.getBoundingClientRect() ?? null,
  panel: document.querySelector("[data-file-panel]")?.getBoundingClientRect() ?? null,
})

window.addEventListener("pointermove", (event) => {
  submenu.pointer?.record({ x: event.clientX, y: event.clientY })
})

// Tear everything down when the view unmounts
tree.destroy()
```

This flow works in design systems, custom runtimes, or tests where you want the raw controller surface without Vue components.


## Live Examples

**Try it yourself in under 30 seconds:**

- 🚀 **[Demos →](https://affino.dev)**


## FAQ

- **Does it work with Nuxt / SSR?** Components avoid DOM registration during server rendering and generate deterministic default IDs for equivalent component trees. Verify your teleport/overlay host setup in the target SSR framework.
- **Can I disable mouse prediction?** Pass `:options="{ mousePrediction: null }"` on `UiMenu`.
- **How do I run context menus?** Use `trigger="contextmenu"` or open the controller at pointer coordinates (see `guide/context-menu.md`).
- **What about huge data sets?** Pair `<UiMenuContent>` with `vue-virtual-scroller` (recipe in `guide/virtualization.md`) and validate keyboard order, focus, and positioning for the chosen virtualization strategy.

## Browser Support

- Evergreen Chromium, Firefox, Safari (ES2020+)
- Vue 3.4+
- TypeScript 5+

## License

MIT © affino OSS
