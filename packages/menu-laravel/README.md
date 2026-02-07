# @affino/menu-laravel

Laravel + Livewire runtime adapter for `@affino/menu-core`.
It hydrates Blade markup into interactive menu instances and keeps state stable across Livewire morph cycles.

## Installation

```bash
pnpm add @affino/menu-laravel
```

## Public API

```ts
import {
  bootstrapAffinoMenus,
  hydrateMenu,
  refreshAffinoMenus,
} from "@affino/menu-laravel"
```

- `bootstrapAffinoMenus()`: scans document, installs mutation observer + Livewire hooks, schedules refresh.
- `hydrateMenu(root)`: hydrates one menu root.
- `refreshAffinoMenus()`: schedules a full rescan/rehydrate pass.

## Markup contract

Required structure:

```html
<div data-affino-menu-root="account-menu">
  <button data-affino-menu-trigger type="button">Open</button>

  <div data-affino-menu-panel>
    <button data-affino-menu-item type="button">Profile</button>
    <button data-affino-menu-item type="button">Settings</button>
    <button data-affino-menu-close type="button">Close</button>
  </div>
</div>
```

Required data attributes:

- root: `data-affino-menu-root`
- trigger: `data-affino-menu-trigger`
- panel: `data-affino-menu-panel`
- item(s): `data-affino-menu-item`

Optional close target:

- `data-affino-menu-close` to close menu programmatically from inside markup.

## Runtime handle

Each hydrated root gets `root.affinoMenu`:

```ts
root.affinoMenu?.open("programmatic")
root.affinoMenu?.close("keyboard")
root.affinoMenu?.toggle()
root.affinoMenu?.highlight("menu-item-id")
const snapshot = root.affinoMenu?.getSnapshot()
```

## Config data attributes

Common options on root:

- `data-affino-menu-placement` (`top|bottom|left|right|auto`)
- `data-affino-menu-align` (`start|center|end|auto`)
- `data-affino-menu-gutter` (number)
- `data-affino-menu-viewport-padding` (number)
- `data-affino-menu-open-delay` (ms)
- `data-affino-menu-close-delay` (ms)
- `data-affino-menu-loop` (`true|false`)
- `data-affino-menu-close-select` (`true|false`)
- `data-affino-menu-default-open` (`true|false`)
- `data-affino-menu-autofocus` (`panel|item|none`)

Portal/overlay options:

- `data-affino-menu-portal` (`inline|body`, default `body`)
- `data-affino-menu-pinned` (`true|false`)
- `data-affino-menu-overlay-modal` (`true|false`)
- `data-affino-menu-lock-scroll` (`true|false`, defaults to modal value)

Submenu linkage:

- child root: `data-affino-menu-parent="parent-root-id"`
- child root: `data-affino-menu-parent-item="parent-item-id"`

## Behavioral guarantees

- Closed panel is always `hidden`, `aria-hidden="true"`, and `inert`.
- Open panel removes `inert`, sets `aria-hidden="false"`, and stays focusable.
- When closing while focus is inside panel, focus is returned to trigger before panel is hidden.
- Livewire morph updates are scope-aware and only trigger menu refresh when menu roots are involved.

## Adapter boundaries

`menu-laravel` owns:

- DOM hydration/rehydration lifecycle,
- event wiring between DOM and `menu-core`,
- Livewire hook integration and scoped refresh scheduling.

Application code owns:

- Blade markup structure and stable ids,
- styling and transitions,
- command/action side effects for menu items.
