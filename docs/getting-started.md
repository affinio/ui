# Getting Started

Follow this guide to install the Vue and React adapters, render your first dropdown, and understand the CSS/TypeScript setup they expect.

## Prerequisites

- Vue 3.4+ or React 18+ (both adapters rely on modern JSX/Composition APIs).
- TypeScript 5+ for first-class editor types (plain JavaScript also works).
- A bundler that understands ES2020 modules (Vite, Nuxt 3, Next.js 14, etc.).

## Installation

### Vue 3

```bash
pnpm add @affino/menu-vue
# npm install @affino/menu-vue
# yarn add @affino/menu-vue
```

### React 18

```bash
pnpm add @affino/menu-react
# npm install @affino/menu-react
# yarn add @affino/menu-react
```

Both adapters automatically pull in `@affino/menu-core`, so there is nothing else to configure.

## Minimal dropdown

### Vue 3 example

```vue
<script setup lang="ts">
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuSeparator,
} from '@affino/menu-vue'

const actions = [
  { label: 'Rename', shortcut: 'F2' },
  { label: 'Duplicate', shortcut: 'Cmd+D' },
]
</script>

<template>
  <UiMenu>
    <UiMenuTrigger asChild>
      <button class="MenuButton">File</button>
    </UiMenuTrigger>

    <UiMenuContent class="MenuPanel">
      <UiMenuItem
        v-for="action in actions"
        :key="action.label"
        asChild
        @select="() => console.log(action.label)"
      >
        <button class="MenuItem">
          <span>{{ action.label }}</span>
          <span class="Shortcut">{{ action.shortcut }}</span>
        </button>
      </UiMenuItem>
      <UiMenuSeparator class="MenuSeparator" />
      <UiMenuItem asChild @select="() => console.log('Delete')">
        <button class="MenuItem destructive">Delete</button>
      </UiMenuItem>
    </UiMenuContent>
  </UiMenu>
</template>
```

### React 18 example

```tsx
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuSeparator,
} from "@affino/menu-react"

const actions = [
  { label: "Rename", shortcut: "F2" },
  { label: "Duplicate", shortcut: "Cmd+D" },
]

export function ActionsMenu() {
  return (
    <UiMenu>
      <UiMenuTrigger asChild>
        <button className="MenuButton">File</button>
      </UiMenuTrigger>

      <UiMenuContent className="MenuPanel">
        {actions.map((action) => (
          <UiMenuItem key={action.label} asChild onSelect={() => console.log(action.label)}>
            <button className="MenuItem">
              <span>{action.label}</span>
              <span className="Shortcut">{action.shortcut}</span>
            </button>
          </UiMenuItem>
        ))}
        <UiMenuSeparator className="MenuSeparator" />
        <UiMenuItem asChild onSelect={() => console.log("Delete")}>
          <button className="MenuItem destructive">Delete</button>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>
  )
}
```

### Styling

Both adapters render plain DOM. Bring any styling solution you want—Tailwind, UnoCSS, vanilla CSS, or tokens. The included stylesheet only declares CSS variables so the demos look nice; you can fully replace it.

## Submenus

Nested menus share the same state tree, so keyboard focus and pointer intent carry over automatically.

```tsx
import {
  UiSubMenu,
  UiSubMenuTrigger,
  UiSubMenuContent,
  UiMenuItem,
} from "@affino/menu-react"

<UiSubMenu>
  <UiSubMenuTrigger asChild>
    <button className="MenuItem">Share &gt;</button>
  </UiSubMenuTrigger>
  <UiSubMenuContent className="MenuPanel">
    <UiMenuItem asChild onSelect={() => console.log("Copy link")}>
      <button className="MenuItem">Copy link</button>
    </UiMenuItem>
    <UiMenuItem asChild onSelect={() => console.log("Email") }>
      <button className="MenuItem">Send email</button>
    </UiMenuItem>
  </UiSubMenuContent>
</UiSubMenu>
```

The Vue version swaps `onSelect` for `@select`, but the structure stays the same.

## Context menus

### Vue 3

```vue
<UiMenu>
  <UiMenuTrigger asChild trigger="contextmenu">
    <button class="MenuButton">Right click me</button>
  </UiMenuTrigger>
  <UiMenuContent class="MenuPanel">
    <UiMenuItem asChild @select="() => console.log('Refresh')">
      <button class="MenuItem">Refresh data</button>
    </UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

### React 18

```tsx
<UiMenu>
  <UiMenuTrigger trigger="contextmenu" asChild>
    <button className="MenuButton">Right click me</button>
  </UiMenuTrigger>
  <UiMenuContent className="MenuPanel">
    <UiMenuItem asChild onSelect={() => console.log("Refresh") }>
      <button className="MenuItem">Refresh data</button>
    </UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

- `trigger="contextmenu"` reacts to right-click events; omit it for regular clicks or keyboard triggers.
- Prefer controller access (`menuRef.value?.controller` in Vue or `useMenuController()` in React) when you need to open the menu programmatically at pointer coordinates. See the [context menu guide](./guide/context-menu.md) for deeper patterns.

## SSR notes

- **Vue** – Components render safely during SSR because DOM-only logic lives inside `onMounted`. Nuxt 3 works without extra plugins.
- **React** – Hooks are compatible with Next.js 14+/app router. The adapters wait for `window` before touching pointer APIs, so hydration stays clean.

## Next steps

- Explore the [component reference](./reference/components.md) for full prop and event lists.
- Learn about the [controller API](./reference/controller.md) when you need programmatic control.
- Study the [virtualization guide](./guide/virtualization.md) before rendering thousands of rows.
- Use the [adapter triad pipeline](./adapter-triad-pipeline.md) when adding new primitives (for example: tabs/disclosure).
