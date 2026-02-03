# @affino/tooltip-laravel

Laravel tooltip primitives that re-use the battle-tested `@affino/tooltip-core` timers, ARIA attributes, and geometry helpers. Keep full control over your Blade markup while letting the controller orchestrate hover/focus semantics just like our Vue adapter.

> ⚠️ Status: experimental. The package shape will likely change while we backfill the remaining surface APIs.

## Installation

```bash
composer require affino/tooltip-laravel
# publish the front-end assets so Vite can import the controller helper
php artisan vendor:publish --tag=affino-tooltip-laravel-assets
```

Import the helper in your `resources/js/app.ts` (Laravel + Vite):

```ts
import { bootstrapAffinoTooltips } from "@affino/tooltip-laravel"
import "./bootstrap"

bootstrapAffinoTooltips()

registerManualControllerBridge({
    eventName: "affino-tooltip:manual",
    rootAttribute: "data-affino-tooltip-root",
    property: "affinoTooltip",
    rehydrate: bootstrapAffinoTooltips,
})

function registerManualControllerBridge({ eventName, rootAttribute, property, rehydrate }) {
    const handledFlag = "__affinoManualHandled"
    const maxRetries = 20

    const findHandle = (id: string) => {
        const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
        const selector = `[${rootAttribute}="${escapedId}"]`
        const root = document.querySelector(selector) as HTMLElement | null
        return root?.[property as keyof typeof root] as any
    }

    const invokeAction = (detail: { id: string; action: string; reason?: string }, attempt = 0) => {
        rehydrate?.()
        const handle = findHandle(detail.id)
        if (!handle) {
            if (attempt < maxRetries) {
                requestAnimationFrame(() => invokeAction(detail, attempt + 1))
            }
            return
        }

        const reason = detail.reason ?? "programmatic"
        if (detail.action === "open") return handle.open(reason)
        if (detail.action === "close") return handle.close(reason)
        handle.toggle()
    }

    document.addEventListener(eventName, (event) => {
        const detail = (event as CustomEvent<{ id?: string; action?: string; reason?: string }>).detail
        if (!(detail?.id && detail?.action)) return
        if ((event as any)[handledFlag]) return
        ;(event as any)[handledFlag] = true
        invokeAction(detail as { id: string; action: string; reason?: string })
    })
}
```

The bootstrapper registers a mutation observer and Livewire DOM hooks so tooltips hydrate automatically, even after partial page updates.

The bridge retries while Livewire swaps DOM nodes, so `$dispatch('affino-tooltip:manual', { id: 'manual-tip', action: 'open' })` stays reliable even during morphs.

## Behavior contract

- Only one auto-managed tooltip stays open at a time. Manual (`trigger="manual"`) and pinned (`data-affino-tooltip-pinned="true"`) tips opt out so you can script multi-surface flows.
- Scroll, resize, and DOM mutations trigger re-hydration so open state survives Livewire morphs. Pinned/manual tips re-open automatically after each scan.
- Focus returns to the trigger (or its first focusable descendant) on close unless you explicitly unset the behavior.
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
- [ ] Guard rails for stacked overlays (dialogs/popovers).
- [ ] Tests inside a Laravel app using Pest + Livewire Dusk.

Contributions welcome! Ping `@affino` on GitHub issues if you hit any edge cases.
