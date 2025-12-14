# Component Reference

Renderless components forward ARIA attributes, keyboard handlers, and data-state markers. Every component accepts `class`, `style`, and `asChild` unless noted.

## Core components

| Component | Purpose | Key props | Emits |
| --- | --- | --- | --- |
| `UiMenu` | Root provider that manages a menu channel. | `options`: partial of `MenuOptions`; `trigger`: `'click' | 'hover' | 'contextmenu'`; `dir`: `'ltr' | 'rtl'`. | `update:open`, `open`, `close`. |
| `UiMenuTrigger` | Toggles the root menu. | `disabled`; `asChild`. | `click`, `pointerenter` via DOM. |
| `UiMenuContent` | Wraps the floating panel. | `side`, `align`, `collisionPadding`, `loop`. | `openAutoFocus`, `closeAutoFocus`. |
| `UiMenuItem` | Selectable row. | `value` (required when using controller), `disabled`, `asChild`. | `select`, `pointermove`, `pointerleave`. |
| `UiMenuSeparator` | Visual separator. | - | - |

## Submenu components

| Component | Purpose | Notes |
| --- | --- | --- |
| `UiSubMenu` | Provides context for a nested tree. Wraps trigger + content. |
| `UiSubMenuTrigger` | Button or item that opens the nested content. Mirrors `UiMenuItem` props. |
| `UiSubMenuContent` | Floating panel for the nested tree. Accepts the same positioning props as `UiMenuContent`. |

## Utility components

| Component | Description |
| --- | --- |
| `UiMenuLabel` | Renders static text with the correct `role="menuitem"` semantics for grouped headings. |
| `UiMenuGroup` | Wraps related items and handles `aria-labelledby`. |
| `UiMenuArrow` | Optional arrow element whose position updates with the panel. |

## Events

All events bubble through the component instance and also fire on the underlying DOM node when you use `asChild`.

| Event | Payload | Fired when |
| --- | --- | --- |
| `select` | `{ value?: string | number | symbol }` | A menu item is activated via keyboard or pointer. |
| `highlight-change` | `{ id: string | null }` | Focus/highlight moves to a different item. |
| `update:open` | `boolean` | Controlled open state changes on `UiMenu`. |
| `open` / `close` | `void` | The menu is opened or closed for any reason. |

## Data attributes

Every component exposes `data-state` and `data-disabled` flags so you can style transitions without JS:

```css
.MenuItem[data-state="open"] { background: var(--menu-accent); }
.MenuItem[data-disabled="true"] { opacity: 0.4; pointer-events: none; }
```

## Types

Type definitions live in `dist/types`. Popular ones include:

- `MenuOptions` - configure pointer heuristics, delays, and positioner behavior.
- `MenuController` - shape returned by `useMenuController`.
- `MenuItemProps` - generics for strongly typed value payloads.

Import them directly:

```ts
import type { MenuController, MenuOptions } from '@workspace/menu-vue'
```

See the [controller reference](./controller.md) for imperative helpers.
