# @affino/combobox-laravel

Livewire-ready combobox primitives that keep filtering, surface geometry, and multi-select ranges in sync with `@affino/listbox-core`. Blade components emit deterministic `data-affino-*` hooks so the JavaScript helper can rehydrate after every morph—no Alpine or DOM diffing required.

> Status: experimental. APIs may still shift as we add typeahead recipes and virtualization support.

## Installation

```bash
composer require affino/combobox-laravel
php artisan vendor:publish --tag=affino-combobox-laravel-assets
```

Register the helper in your Vite entry point (same place you bootstrap tooltips/popovers):

```ts
import "./bootstrap"
import { bootstrapAffinoComboboxes } from "@affino/combobox-laravel"

bootstrapAffinoComboboxes()

registerComboboxManualBridge({
  eventName: "affino-combobox:manual",
  rootAttribute: "data-affino-combobox-root",
  property: "affinoCombobox",
  rehydrate: bootstrapAffinoComboboxes,
})

function registerComboboxManualBridge({ eventName, rootAttribute, property, rehydrate }) {
  const handledFlag = "__affinoComboboxManualHandled"
  const maxRetries = 20

  const findHandle = (id) => {
    const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
    const selector = `[${rootAttribute}="${escaped}"]`
    const root = document.querySelector(selector)
    return root?.[property]
  }

  const invoke = (detail, attempt = 0) => {
    rehydrate?.()
    const handle = findHandle(detail.id)
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
          handle.selectIndex(detail.index, { extend: detail.extend, toggle: detail.toggle })
          return
        }
        if (typeof detail.value === "string") {
          handle.selectValue(detail.value)
        }
        return
      case "clear":
        handle.clear()
        return
    }
  }

  document.addEventListener(eventName, (event) => {
    if (event[handledFlag]) return
    event[handledFlag] = true
    const detail = /** @type {CustomEvent<{ id?: string; action?: string; value?: string; index?: number; extend?: boolean; toggle?: boolean }> } */ (event).detail
    if (!detail?.id || !detail?.action) return
    invoke(detail)
  })
}
```

The helper keeps scanning for new roots after Livewire morphs, remembers whether a pinned combobox was open, and retries manual events while DOM nodes swap underneath it.

## Behavior contract

- The Blade wrapper renders an input + surface shell with stable `data-affino-combobox-*` markers. Avoid stripping them from your markup—the helper reads those attributes to hydrate.
- `data-affino-combobox-state` now stores boolean strings (`"true"`/`"false"`) so you can style `[data-affino-combobox-state='true']` for the open case. Every other boolean `data-affino-*` attribute (`loop`, `disabled`, `pinned`, etc.) follows the same `"true"`/`"false"` contract—no `open/closed` or `1/0` shorthands.
- Selection state, keyboard navigation, and range math come from `@affino/listbox-core`. Arrow keys, Home/End, PageUp/PageDown, and `Ctrl/⌘ + A` behave the same way they do in the Vue adapter.
- Typing in the text input performs a case-insensitive substring match against each option's `data-affino-listbox-label` (with `textContent` as a fallback). Options are hidden via `hidden` so Livewire diffs remain stable.
- Filtering (how options are searched/hidden, whether queries are debounced, etc.) intentionally lives in the DOM adapter; core only tracks the current filter string so you can swap in async sources or virtual lists without bloating `@affino/combobox-core`.
- Livewire integration stays implicit. Pass `model="property"` and the helper will call `Livewire.find(...).set(model, value)` whenever the selection changes.
- Sticky toolbars stay open by wrapping them with `data-affino-combobox-sticky="your-combobox-id"`. Outside-click guards ignore those nodes so preset buttons never close the surface.
- Passing `label="..."` renders a `<label>` element that both the input and listbox reference via `aria-labelledby`, so screen readers announce the same phrase regardless of focus target.
- Use `open-on-pointer-down="false"` if you only want keyboard typing or explicit triggers (buttons/icons) to open the surface; pointer taps on the input will simply focus the field.
- Every hydrated root exposes `element.affinoCombobox` with `{ open, close, toggle, selectIndex, selectValue, clear, getSnapshot }` so you can drive it manually or bridge from Livewire events.

## Basic usage

```blade
<x-affino-combobox
  combobox-id="playbook-search"
  label="Playbook"
  placeholder="Search incident playbooks"
  model="playbook"
>
    @foreach ($playbooks as $playbook)
        <x-affino-combobox.option
            :value="$playbook['value']"
            :label="$playbook['label']"
            :selected="$playbook['value'] === $playbookValue"
        >
            <strong>{{ $playbook['label'] }}</strong>
            <small>{{ $playbook['meta'] }}</small>
        </x-affino-combobox.option>
    @endforeach
</x-affino-combobox>
```

- The `combobox-id` prop seeds `data-affino-combobox-root` and wires the manual bridge.
- Options reuse the same `data-affino-listbox-option` contract as the listbox package, so you get keyboard + selection behavior for free.

## Sticky toolbars

When you wrap action rows in `data-affino-combobox-sticky="combobox-id"`, the outside-click guard treats them as part of the combobox. That's useful for preset filters, "Select all" chips, or toolbar buttons that should not close the surface while the user is interacting with them.

```blade
<div class="select-toolbar" data-affino-combobox-sticky="playbook-search">
  <button type="button" wire:click="resetPlaybooks">Reset</button>
  <button type="button" wire:click="applyPlaybooks">Apply</button>
</div>
```

You can pass multiple combobox ids via a comma-separated list when the toolbar controls more than one instance.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `combobox-id` | `string` | auto UUID | Stable DOM id + manual bridge target. |
| `label` | `string` | `null` | Optional accessible label for the input. |
| `placeholder` | `string` | `"Search dataset"` | Text shown when nothing is selected. |
| `mode` | `"single" \| "multiple"` | `single` | Enables range + multi-select behaviors. |
| `loop` | `bool` | `true` | Whether arrow-key navigation wraps around. |
| `model` | `string|null` | `null` | Livewire model to sync (`Livewire.find(...).set(model, value)`). |
| `name` | `string|null` | `null` | Optional hidden input name for regular form posts. |
| `disabled` | `bool` | `false` | Prevents pointer/keyboard interaction. |
| `pinned` | `bool` | `false` | Persists open state across Livewire morphs via `data-affino-combobox-pinned="true"`. |
| `open-on-pointer-down` | `bool` | `true` | Whether a bare pointer/tap on the input should open the surface. |

### Option props

| Prop | Type | Description |
| --- | --- | --- |
| `value` | `string` | Serialized value forwarded to the helper + Livewire. |
| `label` | `string` | Optional display label; falls back to the rendered slot. |
| `disabled` | `bool` | Removes the option from keyboard navigation. |
| `selected` | `bool` | Marks the option as selected on first hydration. |

## Manual control from Livewire

```php
$this->dispatch('affino-combobox:manual', id: 'playbook-search', action: 'select', value: 'playbook-scale');
$this->dispatch('affino-combobox:manual', id: 'playbook-search', action: 'open');
```

The helper retries every animation frame (up to ~300 ms) so commands still land while Livewire swaps DOM nodes.

## Events

- `affino-combobox:change` bubbles from the root with `{ values: string[]; indexes: number[]; labels: string[] }` whenever the selection changes.
- The hidden input (rendered as `<input type="hidden" data-affino-combobox-value>` ) fires regular `input`/`change` events so plain form posts stay in sync.

## Roadmap

- [ ] Typeahead strategies (prefix/contains).
- [ ] Async filtering helpers.
- [ ] Virtualized surface recipes for large datasets.
