# @affino/popover-core

Headless popover controller built on top of `@affino/surface-core`. It keeps ARIA wiring, toggle semantics, and positioning helpers in sync with the rest of the Affino floating surfaces so adapters can stay tiny.

## Highlights

- Deterministic open / close orchestration with shared surface timers
- Trigger + content prop helpers for instant ARIA wiring
- Optional modal mode and escape / interact-outside guards
- Optional integration with `@affino/overlay-kernel` so Escape / pointer closes respect global stacking rules
- Arrow + positioning helpers that reuse `computePosition()`

## Install

```bash
pnpm add @affino/popover-core
# or
yarn add @affino/popover-core
# or
npm install @affino/popover-core
```

## Usage

```ts
import { PopoverCore } from "@affino/popover-core"

const popover = new PopoverCore({ id: "filters", closeOnEscape: true })

const triggerProps = popover.getTriggerProps()
const panelProps = popover.getContentProps({ role: "dialog" })

buttonEl.addEventListener("click", triggerProps.onClick!)
panelEl.addEventListener("keydown", panelProps.onKeyDown!)

popover.open()
```

- Trigger props already expose `aria-haspopup`, `aria-expanded`, and `aria-controls` so DOM stays declarative.
- Content props include `role`, `aria-modal`, and Escape handling.
- Call `popover.computePosition(anchorRect, panelRect)` anytime layout shifts.
- Use `popover.getArrowProps({ anchorRect, popoverRect, position })` to align decorative arrows.

## API

### `new PopoverCore(options?, callbacks?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | auto | Stable identifier forwarded to trigger/content ids |
| `role` | `'dialog' | 'menu' | 'listbox' | 'tree' | 'grid'` | `dialog` | Controls `aria-haspopup` + content role |
| `modal` | `boolean` | `false` | Toggles `aria-modal="true"` and lets adapters apply scroll locking |
| `closeOnEscape` | `boolean` | `true` | Close the surface when Escape fires from trigger or panel |
| `closeOnInteractOutside` | `boolean` | `true` | Let adapters close when pointer / focus leaves the surface |
| `overlayKind` | `OverlayKind` | `"popover"` | Overlay kind forwarded to `@affino/overlay-kernel` for stack semantics |
| `overlayManager` | `OverlayManager` | `undefined` | Inject a kernel instance so pointer / Escape closes are mediated by the stack |
| `getOverlayManager` | `() => OverlayManager \| null \| undefined` | `undefined` | Lazy resolver for the same manager, handy when adapters own the instance |
| `overlayEntryTraits` | `PopoverOverlayTraits` | `{}` | Override owner / modal / priority traits forwarded to the kernel |
| `openDelay` / `closeDelay` | `number` | `80 / 150` | Forwarded to the shared surface timers |

Callbacks mirror `SurfaceCallbacks` and add `onInteractOutside(event)` so analytics hooks can observe outside clicks before the controller closes.

### Trigger helpers

```ts
const triggerProps = popover.getTriggerProps({ type: "button" })
```

Returns:

- `id`, `aria-haspopup`, `aria-controls`, `aria-expanded`
- `onClick` (toggles the surface)
- `onKeyDown` (Space/Enter toggle, Escape closes)

### Content helpers

```ts
const panelProps = popover.getContentProps({ role: "dialog", tabIndex: -1 })
```

Returns:

- `id`, `role`, `aria-modal`, `tabIndex`, `data-state`
- `onKeyDown` (Escape closes when enabled)

### Arrow helper

```ts
const arrow = popover.getArrowProps({ anchorRect, popoverRect, position, options: { size: 12 } })
```

Just like tooltips, this helper outputs `data-placement`, `data-align`, and inline styles so CSS can stay declarative.

## Adapter guidance

- Pair with `@affino/overlay-host` to teleport panels into a managed stacking context.
- Close on outside pointer / focus targets when `popover.shouldCloseOnInteractOutside()` returns `true`.
- When `popover.isModal()` is `true`, lock scroll using `createScrollLockController()` from the overlay host package.

```ts
if (popover.shouldCloseOnInteractOutside() && !panel.contains(event.target)) {
  popover.interactOutside({ event, target: event.target })
}
```

The controller stays DOM-agnostic so it can power Vue, React, or vanilla adapters from the same package.
