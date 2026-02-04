# @affino/dialog-vue

Vue 3 bindings for [`@affino/dialog-core`](../dialog-core) with batteries included: focus-orchestration, async guards, nested stacks, and mobile-friendly gestures that drop into any component tree.

## Why use it

- **State machine quality** – identical controller used across Vue, React, and Livewire adapters.
- **Focus handled for you** – tab trapping, sentinels, and focus return logic ship with the orchestrator.
- **Async-friendly** – optimistic closes, guard hooks, and retry budgets are one option away.
- **Stack aware** – controllers cooperate so ESC/backdrop close only the top-most surface.
- **Mobile ready** – optional swipe-to-close gesture and scroll locking guards Safari/iOS quirks.

## Installation

```bash
pnpm add @affino/dialog-vue @affino/dialog-core
# or npm / yarn if you prefer
```

You need Vue 3.4+ (Composition API) available in your project.

## Quick start

1. **Create a dialog host once.** We append one automatically, but you can also add it to your HTML shell for SSR:

```html
<body>
  <div id="app"></div>
  <div id="affino-dialog-host" data-affino-dialog-host="true"></div>
</body>
```

2. **Wire the controller inside a component.**

```vue
<script setup lang="ts">
import { ref } from "vue"
import { useDialogController, createDialogFocusOrchestrator } from "@affino/dialog-vue"

const triggerRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLDivElement | null>(null)
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const focusOrchestrator = createDialogFocusOrchestrator({
  dialog: () => dialogRef.value,
  initialFocus: () => dialogRef.value?.querySelector<HTMLElement>("[data-dialog-initial]"),
  returnFocus: () => triggerRef.value,
})

const dialog = useDialogController({ focusOrchestrator })

function loopFocus(edge: "start" | "end") {
  const container = dialogRef.value
  if (!container) return
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  if (!nodes.length) {
    container.focus()
    return
  }
  const target = edge === "start" ? nodes[0] : nodes[nodes.length - 1]
  target?.focus()
}
</script>

<template>
  <button ref="triggerRef" class="cta" @click="dialog.open('trigger')">Launch dialog</button>

  <Teleport to="#affino-dialog-host">
    <transition name="dialog-layer">
      <div v-if="dialog.snapshot.isOpen" class="overlay" @click.self="dialog.close('backdrop')">
        <div ref="dialogRef" class="surface" role="dialog" aria-modal="true" aria-labelledby="demo-title" tabindex="-1">
          <span class="sr-only" tabindex="0" aria-hidden="true" @focus="loopFocus('end')" />
          <h2 id="demo-title">Example dialog</h2>
          <p>Drop in your content here.</p>
          <button class="ghost" data-dialog-initial @click="dialog.close('primary-action')">Apply</button>
          <button class="text" @click="dialog.close('cancel')">Cancel</button>
          <span class="sr-only" tabindex="0" aria-hidden="true" @focus="loopFocus('start')" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```
```

> The Teleport host keeps z-index predictable and prevents stacking context clashes.

3. **Bring your own styles.** The package is headless, so you can rely on Tailwind, UnoCSS, CSS Modules, etc.

## Overlay kernel integration

`useDialogController` automatically registers dialogs with the shared `@affino/overlay-kernel` manager whenever `document` is available. Customize stacking behavior by passing `overlayKind`, `overlayEntryTraits`, `overlayManager`, or `getOverlayManager` through the hook options. During SSR the hook simply defers registration until hydration so servers stay overlay-agnostic.

## Adding async guards (optional)

```ts
const dialog = useDialogController({
  focusOrchestrator,
  closeStrategy: "optimistic",
  maxPendingAttempts: 3,
})

dialog.controller.setCloseGuard(async ({ metadata }) => {
  await saveDraft()
  if (!metadata?.confirm) {
    return { outcome: "deny", message: "Please confirm" }
  }
  return { outcome: "allow" }
})

function requestClose() {
  dialog.close("primary-action", { metadata: { confirm: true } })
}
```

## Nested dialogs & stacks

Every dialog created with `useDialogController` is independent. If you need cascading overlays:

```ts
const stack = ref<DialogBinding[]>([])

function openStackLayer() {
  const surfaceRef = ref<HTMLDivElement | null>(null)
  const binding = useDialogController({
    focusOrchestrator: createDialogFocusOrchestrator({
      dialog: () => surfaceRef.value,
      returnFocus: () => stack.value.at(-1)?.focusOrchestrator?.dialog() ?? dialogRef.value,
    }),
  })

  stack.value.push(binding)
  binding.open("programmatic")
}
```

Because each controller understands `phase`, `isOpen`, and `optimisticCloseInFlight`, you can always determine which layer should react to ESC/backdrop clicks.

## Accessibility checklist

1. **Label every surface** with `aria-labelledby` or `aria-label`.
2. **Provide a `data-dialog-initial` focus target** (usually a primary button).
3. **Keep focus trapped**. The orchestrator already uses sentinels; just ensure focusable controls aren’t `display: none` when opening.
4. **Respect motion preferences** with `prefers-reduced-motion` in your CSS.
5. **Announce guard status** through `dialog.snapshot.guardMessage` or custom alerts.

## Mobile & Safari notes

- Use a Teleport host and scroll-lock `html`/`body` while any dialog is open to prevent iOS “rubber banding”.
- Gesture close: listen for vertical swipes and call `binding.close('programmatic')` when the delta exceeds your threshold.
- When focus disappears (e.g., software keyboard dismissed), call `binding.focusOrchestrator?.focusFirstFocusable()` before the next interaction.

## API reference (summary)

| Hook / helper | Description |
| --- | --- |
| `useDialogController(options)` | Returns `{ controller, snapshot, open, close, dispose }`. `snapshot` is a shallow ref with `isOpen`, `phase`, `lastCloseReason`, `optimisticCloseInFlight`, etc. |
| `createDialogFocusOrchestrator(config)` | Configures dialog/return focus getters plus optional `initialFocus` selector. Returns an object consumed by the controller. |
| `DialogController` | The core instance; call `controller.on(event, listener)` to subscribe to lifecycle events, `controller.setCloseGuard()` to register async guards, and `controller.dispose()` when the component unmounts. |

See [`packages/dialog-core`](../dialog-core) for the exhaustive controller documentation.

## Troubleshooting

- **Dialog opens without focus**: ensure the DOM node referenced by `dialog: () => dialogRef.value` exists before calling `open` (e.g., mount via `v-if` before focusing, or rely on the orchestrator’s built-in retry by keeping the getter lazily returning the element).
- **Escape closes too many overlays**: gate your key handlers with `binding.snapshot.phase === 'opening' || binding.snapshot.isOpen` and track a stack so only the top layer responds.
- **Scrolling the body underneath on iOS**: add `body[data-affino-scroll-lock="true"] { overscroll-behavior: contain; touch-action: none; }` and toggle a dataset flag while dialogs are active.

## Demo

See [`demo-vue/src/pages/DialogPage.vue`](../../demo-vue/src/pages/DialogPage.vue) for a production-style implementation featuring guards, menus, tooltips, and nested stacks.
