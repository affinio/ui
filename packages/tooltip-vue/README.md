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

## Overlay kernel integration

`useTooltipController` automatically registers every tooltip with the shared `@affino/overlay-kernel` manager whenever `document` exists. Override stacking metadata through `overlayKind` / `overlayEntryTraits`, or provide bespoke managers via `overlayManager` / `getOverlayManager`. During SSR the hook simply defers registration until hydration, so server renders stay DOM-free while tooltips join dialogs, menus, and popovers on the same client-side overlay stack.

## Controller API

| Method | Description |
| --- | --- |
| `controller.state` | `ShallowRef<TooltipState>` updated whenever the surface opens or closes. |
| `controller.getTriggerProps(options?)` | Returns id/ARIA/pointer/focus handlers with optional `aria-describedby` overrides. |
| `controller.getTooltipProps()` | Returns attributes for the floating surface, including `data-state`. |
| `controller.getDescriptionProps(options?)` | Produces a live-region description node you can attach to form fields. |
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

### Announcing validation or hints

Compose live regions by combining `getTriggerProps({ describedBy })` with `getDescriptionProps`:

```vue
<script setup lang="ts">
import { useTooltipController } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "field-tooltip" })
const descriptionId = "field-tooltip-description"
const triggerProps = controller.getTriggerProps({ describedBy: descriptionId })
const descriptionProps = controller.getDescriptionProps({ id: descriptionId, politeness: "assertive" })
</script>

<template>
	<button v-bind="triggerProps">?</button>
	<span class="sr-only" v-bind="descriptionProps">
		Use your company email so access can be provisioned instantly.
	</span>
</template>
```

`aria-hidden` flips automatically based on the tooltip state, so the announcement only fires when the helper is open.
