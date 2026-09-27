# @affino/tooltip-laravel

Laravel tooltip primitives that re-use the battle-tested `@affino/tooltip-core` timers, ARIA attributes, and geometry helpers. Keep full control over your Blade markup while letting the controller orchestrate hover/focus semantics just like our Vue adapter.

> ⚠️ Status: experimental. The package shape will likely change while we backfill the remaining surface APIs.

## Installation

```bash
composer require affino/tooltip-laravel
# publish the front-end assets so Vite can import the controller helper
php artisan vendor:publish --tag=affino-tooltip-laravel-assets
```

Import the unified Laravel adapter bootstrap in your `resources/js/app.ts`:

```ts
import "./bootstrap"
import { bootstrapAffinoLaravelAdapters } from "@affino/laravel-adapter"

bootstrapAffinoLaravelAdapters({
  diagnostics: import.meta.env.DEV,
})
```

The adapter registers mutation observers + Livewire hooks and retries manual events while DOM nodes are being morphed, so `$dispatch('affino-tooltip:manual', { id: 'manual-tip', action: 'open' })` remains reliable.

## Behavior contract

- Only one auto-managed tooltip stays open at a time. Manual (`trigger="manual"`) and pinned (`data-affino-tooltip-pinned="true"`) tips opt out so you can script multi-surface flows.
- Escape dismisses the active tooltip when it is topmost in the shared document overlay stack; a dialog or menu above it receives Escape instead.
- While open, scroll, viewport resize, and trigger/surface size changes recalculate position. DOM mutations re-hydrate changed tooltip structure so open state can survive Livewire morphs; pinned/manual tips re-open automatically after each scan.
- The adapter puts `aria-describedby` and keyboard focus behavior on the first focusable control inside the trigger slot. If the slot has no focusable control, its generated wrapper becomes the keyboard trigger. When the slot contains several focusable controls, the first in DOM order is used.
- During a Livewire morph, focus-mode tooltips attempt to restore focus to the current trigger if focus was tracked and the user has not moved focus elsewhere. Closing a tooltip does not independently move focus.
- Bootstrap is bound to the current global `document` and `window`; bootstrapping tooltips in additional iframe documents is not supported by this adapter entry point.
- The Blade component emits deterministic `data-affino-tooltip-*` attributes for the JS helper; avoid stripping them so ARIA wiring, timers, and open-state syncing keep working.
- Styling is entirely up to you—the helper only sets positioning + visibility attributes. Keep design tokens in your own CSS so the primitives remain headless.

## Basic usage

```blade
<x-affino-tooltip
    tooltip-id="sla-tooltip"
    placement="top"
    align="center"
>
    <x-slot:trigger>
        <button class="Trigger">Inspect SLA</button>
    </x-slot:trigger>

    <div class="TooltipSurface">
        Always-on response across 11 regions.
    </div>
</x-affino-tooltip>
```

- `trigger` slot renders the hover/focus source.
- Default slot renders the floating surface.
- The component emits semantic data attributes (`data-affino-tooltip-*`) that the JS helper consumes to wire timers + geometry.

## Options

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `tooltip-id` | `string` | auto | Stable surface identifier. Useful for SSR snapshots or analytics hooks. |
| `open-delay` | `int` | `80` | Milliseconds before opening on pointer intent. |
| `close-delay` | `int` | `150` | Milliseconds before closing after pointer leave. |
| `placement` | `string` | `top` | One of `top`, `bottom`, `left`, `right`. Passed through to `computePosition`. |
| `align` | `string` | `center` | Alignment relative to the trigger: `start`, `center`, `end`. |
| `gutter` | `int` | `8` | Gap between trigger and surface. |
| `strategy` | `string` | `fixed` | Positioning strategy, `fixed` or `absolute`. |
| `trigger` | `string` | `hover-focus` | Interaction preset: `hover`, `focus`, `hover-focus`, `click`, or `manual`. |

## Slots

| Slot | Description |
| --- | --- |
| `trigger` | Required. Render the interactive element that owns the tooltip. |
| default | Required. Render the floating content node. Include arrow markup if desired. |

## Trigger modes

Pick the interaction profile per instance:

| Mode | Behavior |
| --- | --- |
| `hover` | Opens on `mouseenter`, closes on `mouseleave`. |
| `focus` | Opens on `focus`, closes on `blur`. |
| `hover-focus` | Combines both hover + focus (default). |
| `click` | Toggles open/closed on click using pointer semantics. |
| `manual` | No automatic listeners; drive the controller yourself. |

Every hydrated tooltip exposes a tiny controller on the root element so manual workflows can call `open`, `close`, or `toggle`:

```ts
const tooltipRoot = document.querySelector('[data-affino-tooltip-root="sla-tooltip"]')

tooltipRoot?.affinoTooltip?.open("programmatic")
```

### Keeping manual tooltips pinned through morphs

Livewire re-renders can temporarily unmount the tooltip root. If you need a manual tooltip to remain open across those morphs, add a `data-affino-tooltip-pinned="true"` attribute to the Blade component whenever the server-side state says it should stay visible:

```blade
<x-affino-tooltip
    tooltip-id="manual-tip"
    trigger="manual"
    :data-affino-tooltip-pinned="$isPinned ? 'true' : 'false'"
>
    ...
</x-affino-tooltip>
```

When hydration runs, the controller re-opens any tooltip marked as pinned so the UI stays in sync with Livewire’s boolean.

## Roadmap

- [ ] Arrow helper wiring (`data-affino-tooltip-arrow`).
- [ ] Live region helper + form-friendly presets.
- [ ] Tests inside a Laravel app using Pest + Livewire Dusk.

Contributions welcome! Ping `@affino` on GitHub issues if you hit any edge cases.
