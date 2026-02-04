# @affino/listbox-laravel

Livewire-friendly select primitives that lean on `@affino/listbox-core` for focus, keyboard input, and multi-select ranges. The Blade component emits deterministic data attributes so the JS helper can hydrate after every morph without Alpine glue code.

> ⚠️ Status: experimental. Shape may still shift while we wire ComboBox + typeahead affordances.

## Installation

```bash
composer require affino/listbox-laravel
php artisan vendor:publish --tag=affino-listbox-laravel-assets
```

Add the bootstrapper to your Vite entry point the same way you initialize the tooltip/popover helpers:

```ts
import "./bootstrap"
import { bootstrapAffinoListboxes } from "@affino/listbox-laravel"

bootstrapAffinoListboxes()

registerListboxManualBridge({
    eventName: "affino-listbox:manual",
    rootAttribute: "data-affino-listbox-root",
    property: "affinoListbox",
    rehydrate: bootstrapAffinoListboxes,
})

function registerListboxManualBridge({ eventName, rootAttribute, property, rehydrate }) {
    const handledFlag = "__affinoManualHandled"
    const maxRetries = 20

    const findHandle = (id) => {
        const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
        const selector = `[${rootAttribute}="${escaped}"]`
        const root = document.querySelector(selector)
        return { root, handle: root && root[property] }
    }

    const invoke = (detail, attempt = 0) => {
        rehydrate?.()
        const { handle } = findHandle(detail.id)
        if (!handle) {
            if (attempt < maxRetries) {
                requestAnimationFrame(() => invoke(detail, attempt + 1))
            }
            return
        }

        switch (detail.action) {
            case "open":
                handle.open()
                return
            case "close":
                handle.close()
                return
            case "toggle":
                handle.toggle()
                return
            case "select":
                if (typeof detail.index === "number") {
                    handle.selectIndex(detail.index)
                    return
                }
                if (typeof detail.value === "string") {
                    handle.selectValue(detail.value)
                    return
                }
                break
        }
    }

    document.addEventListener(eventName, (event) => {
        if (event[handledFlag]) return
        event[handledFlag] = true
        const detail = /** @type {CustomEvent<{ id?: string; action?: string; index?: number; value?: string }> } */ (event).detail
        if (!detail?.id || !detail?.action) return
        invoke(detail)
    })
}
```

The helper scans for new roots after Livewire morphs, keeps the trigger and surface wiring intact, and retries manual events while DOM nodes swap.

## Behavior contract

- The Blade wrapper renders a trigger + surface shell with stable `data-affino-listbox-*` attributes. Avoid stripping them from your markup—the JS helper reads them to hydrate.
- Selection state lives inside `@affino/listbox-core`. Keyboard navigation (`↑`, `↓`, `Home`, `End`), click toggles, and focus return all mirror the Vue adapter.
- Livewire models can be bound via the `model` prop. The helper finds the owning component and calls `Livewire.find(id)?.set(model, value)` every time the selection changes.
- Manual controllers stay opt-in: dispatch `affino-listbox:manual` with `{ action: 'open' | 'close' | 'toggle' | 'select' }` to keep the surface pinned while Livewire rerenders.
- Styling is yours. The package never injects Tailwind or CSS utility classes—it only flips `data-state`, `aria-selected`, and inline visibility styles.
- Each listbox remembers whether it was open the last time you interacted with it (keyed by `listbox-id`) so Livewire morphs don't force-close long forms. Closing the UI clears the stored flag.
- Wrap any toolbar, chip list, or external control group with `data-affino-listbox-sticky="listbox-id"` (comma-separated for multiple targets) when it should be ignored by the outside-click + focus guards.
- Every hydrated root exposes an imperative handle on `element.affinoListbox` with `open`, `close`, `toggle`, `selectIndex`, `selectValue`, and `getSnapshot` helpers. The manual bridge example below uses that handle.

## Basic usage

```blade
<x-affino-listbox
    listbox-id="region-select"
    label="Active region"
    placeholder="Select a region"
    model="region"
>
    <x-slot:trigger>
        <button type="button" class="SelectTrigger" data-affino-listbox-trigger>
            <span data-affino-listbox-display>{{ strtoupper($region) }}</span>
            <span aria-hidden="true">▾</span>
        </button>
    </x-slot:trigger>

    <ul class="SelectSurface" role="listbox">
        @foreach ($regions as $value => $label)
            <x-affino-listbox.option
                :value="$value"
                :selected="$region === $value"
            >{{ $label }}</x-affino-listbox.option>
        @endforeach
    </ul>
</x-affino-listbox>
```

- `trigger` slot renders the control (defaults to a neutral button if omitted).
- Default slot renders the surface container. Each option uses `<x-affino-listbox.option>` so hydration can map values to indexes.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `listbox-id` | `string` | auto UUID | Stable DOM id used for ARIA + manual events. |
| `label` | `string` | `null` | Optional label announcer for the trigger button. |
| `placeholder` | `string` | `"Select"` | Text rendered when no option is active. |
| `mode` | `"single" \| "multiple"` | `single` | Enables multi-select ranges when set to `multiple`. |
| `loop` | `bool` | `true` | Whether arrow key navigation wraps around the option list. |
| `model` | `string|null` | `null` | Livewire property name to sync via `Livewire.find(...).set(model, value)`. |
| `name` | `string|null` | `null` | Optional hidden input `name="..."` for plain form posts. |
| `disabled` | `bool` | `false` | Disables pointer/keyboard interaction. |

### Option props

```blade
<x-affino-listbox.option
    value="us-west"
    :disabled="false"
    :selected="in_array('us-west', $regions, true)"
>
    West Coast · SFO
</x-affino-listbox.option>
```

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `string` | Serialized value forwarded to the JS helper + Livewire model. |
| `disabled` | `bool` | Removes the option from keyboard navigation. |
| `selected` | `bool` | Marks the option as selected for the first hydration pass. |

## Manual control from Livewire

```php
$this->dispatch('affino-listbox:manual', id: 'region-select', action: 'select', value: 'apac');
```

The helper retries every animation frame (up to 20) so the command still lands while Livewire swaps DOM nodes.

## Events

- `affino-listbox:change` bubbles from the root element with `{ values: string[]; indexes: number[] }` whenever the selection mutates.
- The hidden input still fires regular `input`/`change` events for non-Livewire forms.

## Roadmap

- [ ] Popover-based surface positioning.
- [ ] Typeahead + search affordances.
- [ ] Server-driven filtering + virtualization recipes.
