# @affino/popover-laravel

Laravel popover primitives that lean on `@affino/popover-core` for timing, focus management, and positioning. Drop the Blade component into any Livewire view and let the controller keep overlays aligned through morphs, pagination, and wire:navigate transitions.

> ⚠️ Status: experimental. APIs may shift while we harden nested workflows and modal affordances.

## Installation

```bash
composer require affino/popover-laravel
php artisan vendor:publish --tag=affino-popover-laravel-assets
```

Import the unified Laravel adapter bootstrap in `resources/js/app.ts` (or `.js`):

```ts
import "./bootstrap"
import { bootstrapAffinoLaravelAdapters } from "@affino/laravel-adapter"

bootstrapAffinoLaravelAdapters({
  diagnostics: import.meta.env.DEV,
})
```

From Livewire you can call `$dispatch('affino-popover:manual', { id: 'escalation-popover', action: 'open' })` without touching the DOM. The shared adapter bridge retries until the freshly morphed node hydrates and exposes its controller.

### Manual controllers stay opt-in

When you bypass the default trigger and keep the popover open via Livewire/JS state, flag the surface so the helper knows not to auto-close it:

```blade
<x-affino-popover
    popover-id="playbook-pin-popover"
    :data-affino-popover-manual="$manual ? 'true' : 'false'"
    :data-affino-popover-pinned="$manual ? 'true' : 'false'"
>
    ...
</x-affino-popover>
```

Marking `data-affino-popover-manual="true"` opts the surface out of automatic shutdown when another popover opens or when scroll guards run, matching the tooltip contract.

## Behavior contract

- Only one auto-managed popover stays open at a time. Surfaces marked as `data-affino-popover-manual="true"`, `data-affino-popover-pinned="true"`, or `modal="true"` opt out so you can compose multi-surface flows.
- Scroll, resize, and DOM mutations trigger re-hydration; pinned/manual/modal popovers re-open after Livewire morphs without developer intervention.
- Focus returns to the trigger after close unless `return-focus="false"`. Modal popovers also lock scroll until they close.
- The Blade component emits stable `data-affino-popover-*` attributes that the helper reads for placement, ARIA, and open state—leave them intact so hydration stays deterministic.
- The helper never injects theme styles—only positioning + visibility are handled. Bring your own CSS modules or utility classes to style triggers and surfaces.

## Basic usage

```blade
<x-affino-popover
    popover-id="actions-popover"
    placement="bottom"
    align="start"
    :gutter="12"
>
    <x-slot:trigger>
        <button type="button" class="DemoTrigger">Open quick actions</button>
    </x-slot:trigger>

    <div class="DemoPopover">
        <p>Stream rollouts without leaving the dashboard.</p>
    </div>
</x-affino-popover>
```

- `trigger` slot renders the button/link that toggles the popover.
- Default slot renders the floating content node. Add a nested `<div data-affino-popover-arrow>` if you want a visual arrow—the controller feeds placement styles automatically.

## Options

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `popover-id` | `string` | auto | Stable DOM id used for ARIA relationships and manual controllers. |
| `placement` | `string` | `bottom` | `top`, `right`, `bottom`, `left`, or `auto`. Passed to `computePosition`. |
| `align` | `string` | `center` | `start`, `center`, `end`, or `auto`. |
| `gutter` | `int` | `12` | Gap between the trigger and the floating surface. |
| `viewport-padding` | `int` | `20` | How aggressively the surface avoids the viewport edge. |
| `strategy` | `string` | `fixed` | Choose `fixed` (default) or `absolute` positioning. |
| `role` | `string` | `dialog` | ARIA role passed to the content region. |
| `modal` | `bool` | `false` | Whether to lock scroll + trap focus semantics. |
| `close-on-escape` | `bool` | `true` | Toggle Escape-key dismissal. |
| `close-on-interact-outside` | `bool` | `true` | Toggle outside click / focus guards. |
| `return-focus` | `bool` | `true` | Whether focus returns to the trigger after close. |
| `lock-scroll` | `bool` | `false` | Force document scroll locking while the popover is open. |
| `arrow-size` | `int` | `12` | Visual arrow size in pixels. Works with an element that has `data-affino-popover-arrow`. |
| `arrow-inset` | `int` | `6` | Padding applied before clamping the arrow within the surface. |
| `arrow-offset` | `int` | `6` | How far the arrow sits outside the surface edge. |
| `pinned` | `bool` | `false` | Keep the popover open across Livewire morphs. |

## Slots

| Slot | Description |
| --- | --- |
| `trigger` | Required. Render the toggle/control. |
| default | Required. Render the floating surface. |
| `arrow` | Optional. Render an element that should receive arrow positioning styles. |

## Keeping popovers open across morphs

Add `:data-affino-popover-pinned="$isPinned ? 'true' : 'false'"` or pass the `pinned` prop to the Blade component. The JS helper reads that attribute during hydration and re-opens the controller automatically, so Livewire toggles stay in sync with the UI.

## Roadmap

- [ ] Shared overlay host helpers for stacking popovers with dialogs.
- [ ] Blade directives for nested popover trees.
- [ ] Official Tailwind recipe mirrors.

Issues and PRs welcome! Tag `@affino` if you run into gaps.
