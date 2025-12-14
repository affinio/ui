# Menu Vue Docs

The `@workspace/menu-vue` package gives you accessible, headless Vue 3 building blocks for dropdowns, context menus, and multilevel navigation. This directory collects every deep dive that no longer fits in the marketing-focused README.

## Quick Links

- [Getting started](./getting-started.md)
- [Component reference](./reference/components.md)
- [Controller API](./reference/controller.md)
- [Context menus guide](./guide/context-menu.md)
- [Virtualized menus guide](./guide/virtualization.md)
- [Animations guide](./guide/animations.md)

## When to reach for Menu Vue

Use this adapter when you need any combination of the following:

- Infinite submenu depth without juggling manual focus management.
- Diagonal mouse intent detection that mirrors native operating system menus.
- The ability to keep your own DOM structure via the `asChild` pattern.
- Shared menu state between regular dropdown buttons and context menus.
- Programmatic control to integrate with command palettes, undo stacks, or external stores.

## Package layout

| Package | Purpose |
| --- | --- |
| `@workspace/menu-core` | Framework-agnostic state machine, pointer heuristics, and controller utilities written in TypeScript. |
| `@workspace/menu-vue` | Vue 3 adapter that exposes renderless components plus Vue-friendly controller helpers. |

The Vue adapter is intentionally thin so you can study the core package when you need lower level primitives.

## Architecture at a glance

1. A single observable tree tracks open paths, highlighted items, and pointer intent metadata.
2. Each component subscribes to the slice of state it cares about and emits DOM-ready props.
3. Pointer heuristics run outside the Vue render loop to avoid frame drops while you move across submenus.
4. The controller exposes imperative helpers (`open`, `close`, `highlight`, `select`) for automation.
5. A positioner computes geometry using anchor dimensions, viewport padding, and CSS logical sides.

Read more in [architecture](./reference/architecture.md).

## Documentation status

This folder will continue to grow as higher level guides migrate out of the README. If you spot missing coverage, open an issue or drop a PR with a draft -- partial outlines are welcome.
