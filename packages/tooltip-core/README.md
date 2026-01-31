# @affino/tooltip-core

Deterministic tooltip controller powered by `@affino/surface-core`. Use it when you need hover/focus driven helpers without pulling in a full component library.

## Highlights

- Built on the shared surface kernel, so timers and state semantics match menus/popovers.
- Pointer + focus orchestration with forgiving open/close delays.
- Geometry helpers (`computePosition`) without bringing in Popper/floating-ui.
- Pure TypeScript with zero DOM dependencies, ready for any framework adapter.

## Installation

```bash
pnpm add @affino/tooltip-core
# or
npm install @affino/tooltip-core
```

## Quick start

```ts
import { TooltipCore } from "@affino/tooltip-core"

const tooltip = new TooltipCore({
	id: "field-help",
	openDelay: 100,
	closeDelay: 120,
})

const triggerProps = tooltip.getTriggerProps({ describedBy: "field-hint" })
const contentProps = tooltip.getTooltipProps()

const anchorRect = triggerElement.getBoundingClientRect()
const tooltipRect = tooltipElement.getBoundingClientRect()
const position = tooltip.computePosition(anchorRect, tooltipRect)
const arrowProps = tooltip.getArrowProps({ anchorRect, tooltipRect, position })

document.querySelector("[data-help]")?.addEventListener("pointerenter", triggerProps.onPointerEnter!)
```

Spread `triggerProps` across the element that owns the tooltip (usually a label or icon) and `contentProps` across the floating surface. The controller wires ARIA attributes, hover/focus coordination, and delayed timers so your adapter logic stays thin.

## API surface

### `new TooltipCore(options?, callbacks?)`

| Option | Type | Description |
| --- | --- | --- |
| `id` | `string` | Stable surface identifier. Auto-generated when omitted. |
| `openDelay` | `number` | Milliseconds before opening on pointer intent (defaults to `80`). |
| `closeDelay` | `number` | Milliseconds before closing on pointer leave (defaults to `150`). |
| `defaultOpen` | `boolean` | Start the tooltip in the open state, useful for SSR previews. |

| Callback | Payload | When |
| --- | --- | --- |
| `onOpen(surfaceId)` | `string` | Fired after the tooltip transitions to `open`. |
| `onClose(surfaceId)` | `string` | Fired after closing. |
| `onPositionChange(surfaceId, position)` | `{ left, top, placement, align }` | Fired whenever `computePosition` resolves.

### Instance methods

- `open(reason?)` / `close(reason?)` / `toggle()` — Imperative control for advanced flows (guided tours, analytics-driven nudges, etc.).
- `subscribe(listener)` — Receive snapshot updates. Returns `{ unsubscribe }`.
- `getTriggerProps(options?)` — Returns pointer/focus handlers + ARIA wiring.
- `getTooltipProps()` — Returns attributes for the floating content node.
- `getArrowProps(params)` — Computes CSS-friendly values for arrow elements.
- `getDescriptionProps(options?)` — Live-region helper for verbose tooltips.
- `computePosition(anchorRect, surfaceRect, options?)` — Runs the shared geometry helper when you need collision-aware placement.

### `getTriggerProps(options?)`

| Option | Type | Description |
| --- | --- | --- |
| `describedBy` | `string \| string[]` | Additional ids merged into `aria-describedby` so you can point to persistent helper text or a live region. |
| `tabIndex` | `number` | Override the default `0` when your trigger is naturally focusable. |

## Positioning helper

```ts
const anchor = triggerElement.getBoundingClientRect()
const bubble = tooltipElement.getBoundingClientRect()

const { left, top } = tooltip.computePosition(anchor, bubble, {
	placement: "top",
	align: "start",
	gutter: 8,
})

Object.assign(tooltipElement.style, {
	transform: `translate(${left}px, ${top}px)`
})
```

Because everything funnels through the same kernel, tooltips and menus share identical timing and pointer semantics, making cross-surface behaviors consistent.

## Arrow helper

`getArrowProps` turns placement math into inline styles so your arrow element can stay dumb:

```ts
const arrowProps = tooltip.getArrowProps({
	anchorRect: triggerElement.getBoundingClientRect(),
	tooltipRect: tooltipElement.getBoundingClientRect(),
	position: tooltip.computePosition(anchorRect, tooltipRect, {
		placement: "bottom",
		align: "start",
		gutter: 8,
	}),
	options: { size: 10, inset: 6 },
})

Object.assign(arrowElement.dataset, {
	placement: arrowProps["data-placement"],
	align: arrowProps["data-align"],
})
Object.assign(arrowElement.style, arrowProps.style)
```

It exposes:

- `size` — arrow box size in pixels (`10` by default).
- `inset` — how far from the tooltip edge the arrow is allowed to roam.
- `staticOffset` — use when your tooltip uses shadows or borders that require extra spacing between the arrow and panel.

The returned style map includes `--tooltip-arrow-size` so your CSS can stay declarative:

```css
[data-arrow] {
	width: var(--tooltip-arrow-size);
	height: var(--tooltip-arrow-size);
	background: inherit;
	clip-path: polygon(50% 0, 0 100%, 100% 100%);
}
```

## Choosing a positioning strategy

`TooltipCore` intentionally stays agnostic about how you attach geometry to DOM nodes. The right strategy depends on where your trigger lives:

| Layout constraint | Recommended strategy | Notes |
| --- | --- | --- |
| Tooltip renders inside the same scrolling container as the trigger | `position: absolute` anchored to the nearest relatively positioned parent | Cheapest option when the scroll context is predictable. Remember to re-run `computePosition` on scroll/resize events. |
| Tooltip can teleport to `body` while the trigger sits in deeply nested scroll regions | `position: fixed` plus translating via `left/top` from `computePosition` | Works across stacking contexts and avoids jitter when transforms are involved. Requires you to clamp against the viewport since `fixed` ignores ancestor overflow. |
| Virtualized lists or CSS transforms (`scale`, `translate`) alter the trigger rect | Use `position: fixed` and feed `viewportWidth` / `viewportHeight` overrides into `computePosition` if you render inside an iframe or scaled canvas | Forward custom viewport sizes so collision detection still works after transforms. |

Decision tree:

1. Does the tooltip live in a portal/teleport? If yes → start with `position: fixed` to avoid parent transforms clipping it.
2. Are you placing it inside a scroll container that does **not** teleport? If yes → `position: absolute` tied to the container’s offset is often simpler.
3. Are you syncing to pointer coordinates (context-style tooltips)? Use `setAnchor({ x, y, width: 0, height: 0 })` and still respect the strategy rules above.

```ts
function applyStyles(tooltip: HTMLElement, position: { left: number; top: number }, strategy: "absolute" | "fixed") {
	Object.assign(tooltip.style, {
		position: strategy,
		transform: `translate(${position.left}px, ${position.top}px)`,
	})
}
```

Pair this with a `ResizeObserver`/`IntersectionObserver` so that geometry updates whenever the trigger moves.

## Live announcement helper

When tooltips double as inline validation or status updates, use `getDescriptionProps` to mount a hidden live region and merge its id via `getTriggerProps({ describedBy: descriptionId })`:

```ts
const descriptionProps = tooltip.getDescriptionProps({
	id: "field-help-description",
	politeness: "assertive",
})

Object.assign(descriptionElement, descriptionProps)
```

The helper:

- Defaults to `role="status"`, `aria-live="polite"`, and `aria-atomic=true`.
- Mirrors tooltip state through `data-state` / `aria-hidden` so you can animate it independently.
- Lets you switch to `role="alert"` + `politeness="assertive"` for high-priority announcements.

## Accessibility pointers

- **Arrow alignment:** The arrow helper already exposes `data-placement` and `data-align`. Lean on those attributes to flip CSS.
- **Multiple descriptions:** Merge ids into `describedBy` so controls can reference both persistent helper text and ephemeral tooltip content.
- **Reduced motion:** Honor `prefers-reduced-motion` by toggling transitions based on the `data-state` attribute the controller emits.
