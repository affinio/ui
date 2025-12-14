# Getting Started

Follow this guide to install `@workspace/menu-vue`, render your first dropdown, and understand the minimum CSS/TypeScript setup.

## Prerequisites

- Vue 3.4 or newer with `<script setup>` or Composition API.
- TypeScript 5+ if you want editor type inference (plain JavaScript works too).
- A bundler that supports ES2020 modules (Vite, Nuxt 3, Vue CLI 5, etc.).

## Installation

```bash
npm install @workspace/menu-vue
# or
pnpm add @workspace/menu-vue
yarn add @workspace/menu-vue
```

The package depends on `@workspace/menu-core`, which is pulled in automatically.

## Basic dropdown

```vue
<script setup lang="ts">
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuSeparator,
} from '@workspace/menu-vue'

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

### Styling

The components render plain DOM nodes. Add any CSS solution you like; the snippet above assumes utility classes. Ship CSS variables (e.g. `--menu-bg`, `--menu-radius`) if you want consumers to restyle the primitives.

## Submenus

```vue
<UiSubMenu>
  <UiSubMenuTrigger asChild>
    <button class="MenuItem">Share ></button>
  </UiSubMenuTrigger>
  <UiSubMenuContent class="MenuPanel">
    <UiMenuItem asChild @select="() => console.log('Copy link')">
      <button class="MenuItem">Copy link</button>
    </UiMenuItem>
    <UiMenuItem asChild @select="() => console.log('Email')">
      <button class="MenuItem">Send email</button>
    </UiMenuItem>
  </UiSubMenuContent>
</UiSubMenu>
```

Submenus subscribe to the same tree as root menus, so keyboard focus and pointer intent carry over automatically.

## Context menus

```vue
<UiMenu trigger="contextmenu">
  <UiMenuContent class="MenuPanel">
    <UiMenuItem asChild @select="() => console.log('Refresh')">
      <button class="MenuItem">Refresh data</button>
    </UiMenuItem>
  </UiMenuContent>
</UiMenu>
```

- Pass `trigger="contextmenu"` to react to right-click events.
- You can also skip the DOM trigger entirely and use the controller API. See [Context menu guide](./guide/context-menu.md).

## SSR and Nuxt

The components render safely on the server because all DOM-only logic runs inside `onMounted`. No special Nuxt plugin is required. If you defer menu creation to client-only routes, wrap calls with `if (import.meta.env.SSR) return` just like any other interactive component.

## Next steps

- Explore the [component reference](./reference/components.md) for full prop and event lists.
- Learn about the [controller API](./reference/controller.md) when you need programmatic control.
- Study the [virtualization guide](./guide/virtualization.md) before rendering thousands of rows.
