# Component Reference

Renderless components forward ARIA attributes, keyboard handlers, and `data-state` markers. Every component accepts `class`, `style`, and `asChild` unless noted. The API surface is identical in Vue and React; only the event syntax changes (`@select` in Vue vs `onSelect` in React).

## Exported components

| Component | Purpose | Key props & notes |
| --- | --- | --- |
| `UiMenu` | Root provider that creates a `MenuController` instance and exposes it via `ref`. | `options?: MenuOptions`, `callbacks?: MenuCallbacks`. Grab the controller with `const controller = menuRef.value?.controller` for programmatic control. |
| `UiMenuTrigger` | Button that opens/closes the nearest menu. | `trigger?: 'click' \| 'contextmenu' \| 'both'` (defaults to `click` for root menus, `both` for submenus), `asChild?: boolean`. Automatically wires ARIA attributes. |
| `UiMenuContent` | Floating panel rendered inside a `Teleport` (defaults to `body`). | Accepts regular HTML attributes for classes, styles, etc. `data-state`, `data-side`, and `data-motion` are applied for animation hooks. |
| `UiMenuItem` | Selectable row. | `id?: string` (auto-generated when omitted), `disabled?: boolean`, `danger?: boolean`, `asChild?: boolean`. Vue emits a `select` event, React exposes an `onSelect` callback with `{ id, controller }`. |
| `UiMenuSeparator` | Visual separator with `role="separator"`. | No props. |
| `UiMenuLabel` | Static text helper rendered with `role="presentation"`. | No props. |
| `UiSubMenu` | Provides nested menu context. | `id?: string`, `options?: MenuOptions`, `callbacks?: MenuCallbacks`. Creates a submenu controller linked to the parent menu. |
| `UiSubMenuTrigger` | Item that opens the nested submenu. | `asChild?: boolean`. Always shows an arrow glyph by default. |
| `UiSubMenuContent` | Floating panel for nested menus. | Shares the same attributes/teleport behavior as `UiMenuContent` and inherits mouse prediction from the parent chain.

## Events

`UiMenuItem` emits a single `select` event (Vue) or invokes the `onSelect` prop (React). The payload contains the resolved `id` and the controller so you can run imperative logic:

```vue
<UiMenuItem @select="({ id, controller }) => controller.select(id)">
	...
</UiMenuItem>
```

```tsx
<UiMenuItem onSelect={({ id, controller }) => controller.select(id)}>
  ...
</UiMenuItem>
```

Open/close/highlight notifications are surfaced through the `callbacks` prop on `UiMenu`/`UiSubMenu` (`onOpen`, `onClose`, `onSelect`, `onHighlight`, `onPositionChange`). Use those callbacks or watch `controller.state` when you need lifecycle hooks.

## Data attributes

Use the auto-applied attributes to style hover/animation states without extra JavaScript:

- `data-state="open" | "closed"` on panels and triggers.
- `data-motion="from-top" | ...` describing the calculated placement.
- `data-state="highlighted"` and `aria-disabled="true"` on items.
- `data-ui-menu-id`, `data-ui-root-menu-id`, and `data-ui-menu-trigger` for debugging or analytics.

Example:

```css
.MenuItem[data-state="highlighted"] { background: var(--menu-accent); }
.UiMenuContent[data-state="closed"] { opacity: 0; transform: translateY(-4px); }
```

## Types

Type definitions ship with the package:

- `MenuOptions` – configure open/close delays, pointer prediction, and looping behavior.
- `MenuCallbacks` – hook into lifecycle events without touching DOM refs.
- `MenuController` – the object returned by `useMenuController` and exposed via `<UiMenu ref>`.

Import them directly:

```ts
import type { MenuController, MenuOptions, MenuCallbacks } from '@affino/menu-vue'
// or
import type { MenuController, MenuOptions, MenuCallbacks } from '@affino/menu-react'
```

See the [controller reference](./controller.md) for more on the imperative surface.
