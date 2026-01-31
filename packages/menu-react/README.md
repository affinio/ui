# @affino/menu-react

> React's most precise headless menu system — deterministic controllers, diagonal pointer intent, and zero styling opinions.

```tsx
import { UiMenu, UiMenuTrigger, UiMenuContent, UiMenuItem } from "@affino/menu-react"

const actions = ["Edit", "Duplicate", "Archive"]

export function ActionsMenu() {
  return (
    <UiMenu>
      <UiMenuTrigger>Actions</UiMenuTrigger>
      <UiMenuContent>
        {actions.map((action) => (
          <UiMenuItem key={action} onSelect={() => console.log(action)}>
            {action}
          </UiMenuItem>
        ))}
      </UiMenuContent>
    </UiMenu>
  )
}
```

```bash
npm install @affino/menu-react
```

## Core Features

- Headless React components powered by `@affino/menu-core`
- Smart mouse prediction keeps submenus open during diagonal travel
- Unlimited submenu depth with shared tree state and safe focus handoffs
- Context-menu + click menu support with a single trigger surface
- Auto positioning and viewport collision handling without extra deps
- Snapshot-driven controller subscriptions for zero wasted renders
- `asChild` pattern so you can slot in any DOM structure or design system primitive
- Programmatic controller API for imperative flows (`open`, `close`, `highlight`, `select`)
- CSS variables for seamless theming (light/dark/brand palettes)
- First-class TypeScript types for every prop, event payload, and controller method

Docs → [../../docs/index.md](../../docs/index.md)

## Getting Started

1. `npm install @affino/menu-react`
2. Import the base styles once in your app entry so the design tokens are available everywhere:

```ts
import "@affino/menu-react/styles.css"
```

3. Compose `<UiMenu>`, `<UiMenuTrigger>`, `<UiMenuContent>`, and `<UiMenuItem>` to build dropdowns, context menus, or nested navigation.
4. Nest `<UiSubMenu>` components for infinite submenu depth.
5. Use the supplied hooks (`useMenu`, `useMenuShortcuts`) to drive programmatic flows.

## Controller Surface

`useMenuController` now builds on top of `createMenuTree`, so the hook exposes the same pointer + geometry adapters the core uses internally. Opt into them whenever you need custom positioning or analytics—no `instanceof SubmenuCore` casts required.

```tsx
const controller = useMenuController({ kind: "root", options, callbacks })

useEffect(() => {
  if (!controller.state.open) return
  console.log("Active item", controller.state.activeItemId)
}, [controller.state.open, controller.state.activeItemId])

controller.recordPointer?.({ x: event.clientX, y: event.clientY })
controller.setTriggerRect?.(controller.triggerRef.current?.getBoundingClientRect() ?? null)
controller.setPanelRect?.(controller.panelRef.current?.getBoundingClientRect() ?? null)
controller.setAnchor(controller.triggerRef.current?.getBoundingClientRect() ?? null)
```

- `recordPointer` feeds diagonal intent detection, enabling alternate input sources (stylus, remote desktop, Playwright pointer hooks).
- `setTriggerRect` / `setPanelRect` keep submenu geometry fresh after layout transitions without poking private APIs.
- `setAnchor` supports context menus, palette-style overlays, and anchored inspectors with zero custom timers.

## Headless usage with createMenuTree

Rolling your own renderer? Instantiate the helper directly to get the same branch objects the React hook relies on.

```ts
import { createMenuTree } from "@affino/menu-core"

const tree = createMenuTree({ options: { openDelay: 75, closeDelay: 120 } })
tree.root.registerItem("file")

const submenu = tree.createSubmenu({
  parent: tree.root,
  parentItemId: "file",
})

const syncGeometry = () => {
  submenu.geometry?.sync({
    trigger: document.querySelector("[data-file]")?.getBoundingClientRect() ?? null,
    panel: document.querySelector("[data-file-panel]")?.getBoundingClientRect() ?? null,
  })
}

window.addEventListener("pointermove", (event) => {
  submenu.pointer?.record({ x: event.clientX, y: event.clientY })
})

syncGeometry()

// Clean up every branch when you unmount
tree.destroy()
```

This keeps third-party design systems, test harnesses, and custom renderers aligned with the official adapters.

## Live Examples

**Try it yourself in under 30 seconds:**

- 🚀 **[Demos →](https://affino.dev)**

## FAQ

- **Does it work with Next.js / SSR?** Yes — everything renders on the server, hydrates on the client, and pointer-only features no-op until `window` exists.
- **Can I open at pointer coordinates?** Call `controller.setAnchor({ x, y, width: 0, height: 0 })` before `controller.open("pointer")` or rely on the built-in context menu trigger.
- **How do I keep my own DOM?** Pass `asChild` to any trigger or item component and Affino will clone + merge props while preserving refs/events.
- **What about 1000+ items?** Pair `<UiMenuContent>` with your favorite virtualization library; controllers stay snapshot-driven and never depend on render count.

## Browser Support

- Evergreen Chromium, Firefox, Safari (ES2020+)
- React 18+
- TypeScript 5+

## License

MIT © affino OSS