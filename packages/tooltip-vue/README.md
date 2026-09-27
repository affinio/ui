# @affino/tooltip-vue

Renderless Vue 3 helpers that wrap `@affino/tooltip-core`. Keep your own DOM/markup and let the controller manage timers, ARIA wiring, and hover/focus semantics.

## Installation

```bash
pnpm add @affino/tooltip-vue
# or
npm install @affino/tooltip-vue
```

## Basic usage

```vue
<script setup lang="ts">
import { useTooltipController } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "sla-tooltip", openDelay: 120 })
const triggerProps = controller.getTriggerProps()
const tooltipProps = controller.getTooltipProps()
</script>

<template>
	<button class="Trigger" v-bind="triggerProps">
		Inspect SLA
	</button>

	<transition name="fade">
		<div v-if="controller.state.value.open" class="Tooltip" v-bind="tooltipProps">
			<p>Always-on support across 11 regions.</p>
		</div>
	</transition>
</template>
```

The props already include lowercase `onpointerenter/onpointerleave` handlers so they work directly with `v-bind`.

## Positioning (recommended)

Most layouts can rely on the built-in floating adapter, which wires `TooltipCore.computePosition()` to Vue refs:

```vue
<script setup lang="ts">
import { useTooltipController, useFloatingTooltip } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "sla-tooltip" })
const floating = useFloatingTooltip(controller, {
	placement: "top",
	align: "center",
	gutter: 12,
	arrow: { size: 10 },
})
</script>

<template>
	<button ref="floating.triggerRef" v-bind="controller.getTriggerProps()">
		Inspect SLA
	</button>

	<Teleport :to="floating.teleportTarget">
		<div
			v-if="controller.state.value.open"
			ref="floating.tooltipRef"
			class="Tooltip"
			v-bind="controller.getTooltipProps()"
			:style="floating.tooltipStyle"
		>
			<span v-if="floating.arrowProps" class="TooltipArrow" v-bind="floating.arrowProps" :style="floating.arrowProps.style" />
			<p>Always-on support across 11 regions.</p>
		</div>
	</Teleport>
</template>
```

The helper exposes `triggerRef`, `tooltipRef`, `tooltipStyle`, `teleportTarget`, `arrowProps`, and `updatePosition()` so you
can react to custom layout changes (portals, drawers, etc.) while keeping every tooltip inside the shared overlay host by
default.

The floating helper observes both element sizes and responds to viewport/scroll changes while the tooltip is open. It
translates viewport coordinates into the containing block for `strategy: "absolute"`; use a stable, untransformed
teleport target with `strategy: "fixed"` when rendering above dialogs or drawers.

### Layering inside modals or drawers

`useFloatingTooltip` automatically teleports into a singleton host (`#affino-tooltip-host`) so multiple tooltips can share the same stacking context. You can override both the Teleport target and the applied `z-index` when a modal, drawer, or sheet needs stricter layering:

```vue
const {
	triggerRef,
	tooltipRef,
	tooltipStyle,
	teleportTarget,
} = useFloatingTooltip(controller, {
	teleportTo: '#my-dialog-overlay',
	zIndex: 120,
})
```

- Pass a CSS selector, HTMLElement, or `false` via `teleportTo` if you want to keep the tooltip inside a scoped overlay.
- Use the `zIndex` option to pin the bubble above scroll locks or dialog chrome without reaching into the generated styles manually.
- Call `floating.updatePosition()` after animations or layout changes so the inline positioning stays in sync.

Escape dismisses the topmost open tooltip in the document overlay stack. The adapter shares its document keyboard, blur,
and visibility listeners across open tooltips; closed controllers do not install global listeners or overlay entries.
When the owning window loses focus or the document becomes hidden, an open or pending hover tooltip is closed/cancelled.
Hover stays suppressed after focus returns until the pointer leaves the trigger. Keyboard focus can still open it normally.

## Overlay kernel integration

`useTooltipController` registers a tooltip with the shared `@affino/overlay-kernel` manager while it is open. Override stacking metadata through `overlayKind` / `overlayEntryTraits`, or provide bespoke managers via `overlayManager` / `getOverlayManager`. During SSR the hook stays DOM-free; on the client open tooltips join dialogs, menus, and popovers on the same overlay stack.

## Controller API

| Method | Description |
| --- | --- |
| `controller.state` | `ShallowRef<TooltipState>` updated whenever the surface opens or closes. |
| `controller.getTriggerProps(options?)` | Returns id/ARIA/pointer/focus handlers with optional `aria-describedby` overrides. |
| `controller.getTooltipProps()` | Returns attributes for the floating surface, including `data-state`. |
| `controller.getDescriptionProps(options?)` | Produces a separate status/alert live-region node; `aria-hidden` mirrors tooltip open state. |
| `controller.open(reason?)` / `close(reason?)` / `toggle()` | Imperative controls for advanced flows. |
| `controller.dispose()` | Tears down timers + subscriptions (auto-called when the component unmounts).

## Working with forms

Tooltips often decorate input labels. Blend focus-driven logic with pointer helpers:

```vue
<label class="FieldLabel">
	Work email
	<button type="button" class="Help" v-bind="triggerProps">?</button>
</label>

<input @focus="controller.open('keyboard')" @blur="controller.close('keyboard')" />
```

Because the controller reuses `@affino/surface-core`, its timers match menus and other floating primitives in the Affino stack.

### Live announcements

The tooltip surface (`role="tooltip"`) is the ordinary hint relationship, referenced by the trigger through `aria-describedby`. `getDescriptionProps` is a separate status/alert live-region helper. It mirrors tooltip open state through `aria-hidden`; opening a static node alone is not a reliable announcement across assistive technologies.

Use a persistent description node for static field instructions. Reserve live regions for changing status content and verify announcement timing with your supported screen readers.
