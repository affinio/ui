````markdown
# @affino/dialog-laravel

Headless dialog helpers for Laravel + Livewire powered by `@affino/dialog-core`. The Blade component emits all of the data attributes the JavaScript hydrator needs to wire focus guards, teleport overlays into a shared host, and keep modal state stable while Livewire morphs the DOM.

> ⚠️ Status: experimental. We are iterating on guard hooks and stacked overlays while the API settles.

## Installation

```bash
composer require affino/dialog-laravel
php artisan vendor:publish --tag=affino-dialog-laravel-assets
```

Bootstrap dialogs through the unified Laravel adapter entry point:

```ts
import "./bootstrap"
import { bootstrapAffinoLaravelAdapters } from "@affino/laravel-adapter"

bootstrapAffinoLaravelAdapters({
  diagnostics: import.meta.env.DEV,
})
```

Now Livewire components can dispatch `affino-dialog:manual` without touching the DOM:

```php
$this->dispatch('affino-dialog:manual', id: 'ops-dialog', action: 'open', reason: 'programmatic');
$this->dispatch('affino-dialog:manual', id: 'ops-dialog', action: 'close', options: ['metadata' => ['confirmDiscard' => true]]);
```

## Blade usage

```blade
<x-affino-dialog
  id="ops-dialog"
    labelled-by="ops-dialog-title"
    description-id="ops-dialog-description"
    :lock-scroll="true"
    :close-on-backdrop="false"
>
    <x-slot:trigger>
        <button type="button" class="DemoTrigger">Launch command palette</button>
    </x-slot:trigger>

    <div class="DemoDialog">
        <header>
            <p class="DialogBadge">Livewire modal</p>
            <h3 id="ops-dialog-title">Ops command center</h3>
            <p id="ops-dialog-description">Focus, scroll, and teleport semantics stay intact after every morph.</p>
        </header>

        <button type="button" data-affino-dialog-dismiss="programmatic">Close dialog</button>
    </div>
</x-affino-dialog>
```

- Wrap the trigger content in the `trigger` slot; the helper prevents default on click and opens the modal.
- Place dialog content inside the default slot. The component injects start/end sentinels so focus stays within the surface when `modal="true"`.
- Add `data-affino-dialog-dismiss` to any button/link inside the root to close the dialog. Optional `data-affino-dialog-dismiss="escape-key"` style reasons forward to the controller for analytics/guards.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `id` | `string` | auto UUID | Stable identifier used for ARIA wiring, DOM selection, and manual controllers. |
| `modal` | `bool` | `true` | Locks focus inside the surface and adds `aria-modal="true"`. |
| `close-on-backdrop` | `bool` | `true` | Close when the backdrop receives a pointer event. |
| `close-on-escape` | `bool` | `true` | Toggle Escape key dismissal. |
| `lock-scroll` | `bool` | `true` | Prevent document scrolling while the dialog is visible. |
| `return-focus` | `bool` | `true` | Return focus to the trigger after the dialog closes. |
| `pinned` | `bool` | `false` | Keep the dialog open across Livewire morphs. The helper re-opens the controller automatically. |
| `default-open` | `bool` | `false` | Start in the open state on first hydration. |
| `overlay-kind` | `"dialog" \| "sheet"` | `dialog` | Selects the overlay semantics (standard modal vs slide/sheet). |
| `close-strategy` | `"blocking" \| "optimistic"` | `blocking` | Tell the core whether close requests should wait for guards. |
| `state-sync` | `bool` | `false` | When `true`, JS follows `data-affino-dialog-state` attribute updates from the server. Keep `false` for Livewire forms so typing/morphs do not force-close the dialog. |
| `teleport-target` | `string|null` | `null` | Controls where the overlay surface renders. `null`/`"inline"` keeps it next to the Blade markup, `"auto"` (default when omitted) mounts into the shared `#affino-dialog-host`, and any CSS selector targets a custom host. |
| `pending-message` | `string|null` | `null` | Copy rendered while a guard blocks the close request. |
| `max-pending-attempts` | `int|null` | `null` | Limit how many times an optimistic close retries before ignoring new requests. |
| `labelled-by` | `string|null` | `null` | Pass the id for the heading inside the dialog. |
| `aria-label` | `string|null` | `null` | Fallback label if no heading is present. |
| `surface-role` | `string` | `dialog` | Custom ARIA role for the surface. |
| `description-id` | `string|null` | `null` | Id of descriptive copy inside the surface. |

### Teleport targeting

Laravel devs often render dialogs deep inside Livewire components, so we expose flexible teleport semantics through `teleport-target`:

- `null` or `"inline"` keeps the overlay adjacent to the Blade markup (good for simple layouts or when you manage stacking contexts yourself).
- `"auto"` (the default) mounts into the shared `#affino-dialog-host`, ensuring the dialog floats above Livewire diffing and parent stacking contexts.
- Any CSS selector (e.g. `"#workspace-overlays"`) teleports into that host, which is useful when you already manage portals elsewhere.

The hydrator remembers the original position with a comment placeholder, so rehydrate cycles and Livewire morphs restore the overlay exactly where it came from if the host disappears.

When dialog content is teleported to `body`, avoid direct `wire:click` / `wire:model.live` bindings inside the teleported subtree. Use the shared `data-affino-livewire-*` bridge attributes from `@affino/laravel-adapter` for actions and model sync.

## Behavior contract

- The helper injects two focus sentinels into every modal so keyboard users wrap around automatically even if you do not write a focus trap.
- Scroll locking is reference-counted across dialogs. Multiple dialogs can be open (stacked) without fighting over `overflow: hidden`.
- Surfaces marked with `pinned` or `data-affino-dialog-pinned="true"` reopen after Livewire swaps DOM nodes.
- With `state-sync="false"` (default), client-side open state is preserved across Livewire morphs and replacement nodes that keep the same dialog id.
- Teleport hosts (`#affino-dialog-host` by default) keep overlays outside of nested stacking contexts so z-index math stays predictable.
- Manual controllers remain opt-in; dispatch `affino-dialog:manual` events when you want PHP, Alpine, or vanilla JS to drive open/close/toggle. The shared adapter runtime routes and retries these events during morphs.

## Roadmap

- [ ] Guard helpers (`data-affino-dialog-guard`) exposed to PHP so async close confirmation can be authored without touching JS.
- [ ] Stacked dialog demos shared with popover sheets and tooltips.
- [ ] Tailwind + CSS recipe pack once design tokens settle.

PRs and issues welcome!
````
