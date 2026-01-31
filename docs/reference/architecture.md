# Architecture

The adapters (`@affino/menu-vue` and `@affino/menu-react`) stay small by leaning on `@affino/menu-core`, and the tooltip adapter (`@affino/tooltip-vue`) piggybacks on the same surface kernel. Understanding how the layers communicate helps when you debug tricky focus bugs or want to customize interactions.

## Layers

1. **Surface kernel** - `@affino/surface-core` owns the universal interaction pieces: open/close state machine, pointer/focus orchestration, timers, and positioning utilities. Tooltips, menus, and any future floating surface reuse the same deterministic foundation.
2. **Core graph** - `@affino/menu-core` layers tree tracking, highlight state, and selection rules on top of the surface kernel. It is framework-agnostic and written in TypeScript.
3. **Adapter hooks** - The Vue and React adapters subscribe to the core graph and expose helpers such as `useMenuContext`, `useSubMenuContext`, and `useMenuController`. Tooltips follow the same recipe through `useTooltipController` inside `@affino/tooltip-vue` while the React hook is still pending.
4. **Renderless components** - Components like `UiMenuTrigger` wrap the hooks and return DOM-ready props (Vue via `v-bind`, React via props). Using `asChild` lets you keep control of the rendered element.
5. **Positioner** - Geometry utilities compute placement, gutters, and viewport collision handling without forcing Popper.js or floating-ui. `useMenuPositioning` picks sensible defaults but exposes `placement`, `align`, `gutter`, and `viewportPadding` options.
6. **Styling** - All DOM output is unstyled. Theme via CSS variables, Tailwind, UnoCSS, vanilla-extract, or anything else.

## State flow

- Opening a menu registers nodes in the tree, linking parents and children.
- Keyboard navigation updates the highlighted node; the store emits a snapshot, and triggers/content subscribe to update ARIA attributes.
- Mouse prediction watches pointer velocity + triangle intent. When you move toward a submenu, timers delay closing to avoid flicker.
- Programmatic actions (`controller.open('file-menu')`) push changes through the same store so the UI stays in sync.

## Key concepts

| Concept | Description |
| --- | --- |
| **Channels** | Each menu root owns a channel ID, allowing multiple independent menus to coexist. |
| **Guards** | Functions that stop closing when the pointer is still headed toward a submenu. Configurable via `mousePrediction`. |
| **Snapshots** | Immutable payloads emitted by the core store; components subscribe to avoid rerendering the entire tree. |
| **AsChild** | Pattern that lets components inject behavior into your DOM nodes instead of forcing custom slots. |

## Customizing the core

- Pass `:options="{ mousePrediction: null }"` to disable heuristics for touch-heavy experiences.
- Adjust open/close timing with `openDelay`, `closeDelay`, or disable automatic closing via `closeOnSelect: false`.
- Toggle focus looping via `loopFocus: false` when embedding inside constrained widgets.
- Override pointer anchoring at runtime with `controller.setAnchor` (see the [context menu guide](../guide/context-menu.md)).

Tooltips reuse the same `SurfaceCore` but skip tree coordination and selection entirely, which keeps their controllers lean while guaranteeing identical hover/focus semantics. The `useTooltipController` composable simply subscribes to `TooltipCore` and exposes trigger/content props you can spread onto Vue templates today.

### Layering + overlay hosts

- Menus and tooltips teleport into overlay hosts created by `ensureOverlayHost`. By default menus render inside `#affino-menu-host` while tooltips target `#affino-tooltip-host`, so you never fight with random stacking contexts.
- `useFloatingTooltip` accepts both `teleportTo` (selector/HTMLElement) and a new `zIndex` option. Use them when a tooltip needs to live inside a modal/drawer container without falling behind scroll locks.
- Call `floating.updatePosition()` (or the promise the hook returns) whenever your modal animates so the inline styles continue to match the anchor geometry.

## Debugging tips

- Log the controller: `const controller = useMenuController(); watchEffect(() => console.table(controller.snapshot.value.items))`.
- Use the `data-state` attributes attached to triggers and content to confirm whether a menu thinks it is open.
- In dev builds the core warns when duplicate IDs are registered; ensure you pass stable `value` props to every `UiMenuItem`.
- Enable verbose tracing via `DEBUG_MENU=1` (build-time env) or by setting `window.__MENU_DEBUG__ = true` in the devtools console. The adapters forward those flags so you can watch pointer prediction, focus shifts, and positioning decisions in real time.

See also the [component reference](./components.md) and [controller API](./controller.md) for hands-on examples.
