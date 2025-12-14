# Architecture

`@workspace/menu-vue` stays small by leaning on `@workspace/menu-core`. Understanding how the layers communicate helps when you debug tricky focus bugs or want to customize interactions.

## Layers

1. **Core graph** - `@workspace/menu-core` exposes a store that tracks menu nodes, open paths, highlighted items, pointer metadata, and timers. It is framework-agnostic and written in TypeScript.
2. **Adapter hooks** - The Vue adapter subscribes to the core graph and exposes helpers such as `useMenuContext`, `useSubMenuContext`, and `useMenuController`.
3. **Renderless components** - Components like `UiMenuTrigger` wrap the hooks and return DOM-ready props via `v-bind`. Using `asChild` lets you keep control of the rendered element.
4. **Positioner** - Geometry utilities compute placement, gutters, and viewport collision handling without forcing Popper.js or floating-ui. You can swap the strategy by passing a custom `positioner` option.
5. **Styling** - All DOM output is unstyled. Theme via CSS variables, Tailwind, UnoCSS, vanilla-extract, or anything else.

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
- Swap the positioner: `:options="{ positioner: customPositioner }"` where `customPositioner` matches the contract `{ anchor: DOMRect; content: DOMRect; placement: 'end' | 'start'; }`.
- Override focus management by providing `focusStrategy` with callbacks for `onEntry`, `onExit`, and `onLoop`.

## Debugging tips

- Log the controller: `const controller = useMenuController(); watchEffect(() => console.table(controller.snapshot.value.items))`.
- Use the `data-state` attributes attached to triggers and content to confirm whether a menu thinks it is open.
- In dev builds the core warns when duplicate IDs are registered; ensure you pass stable `value` props to every `UiMenuItem`.

See also the [component reference](./components.md) and [controller API](./controller.md) for hands-on examples.
