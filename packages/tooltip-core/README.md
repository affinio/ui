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

const triggerProps = tooltip.getTriggerProps()
const contentProps = tooltip.getTooltipProps()

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
- `getTriggerProps()` — Returns pointer/focus handlers + ARIA that you can spread on any element.
- `getTooltipProps()` — Returns attributes for the floating content node.
- `computePosition(anchorRect, surfaceRect, options?)` — Runs the shared geometry helper when you need collision-aware placement.

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
