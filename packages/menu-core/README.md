# @affino/menu-core

> 🚧 **Status:** Beta — API is stable, seeking feedback before 1.0 release

A framework-agnostic, type-safe menu/dropdown core engine with intelligent mouse prediction, nested submenu support, and comprehensive accessibility features.

> Built on `@affino/surface-core`, the shared interaction kernel that now also powers tooltips.

## The Problem It Solves

Building accessible, nested dropdown menus is hard:

- **Mouse prediction** — Users moving diagonally toward a submenu accidentally trigger other items
- **Framework lock-in** — Most libraries tie you to React, Vue, or specific UI frameworks  
- **Accessibility** — Proper ARIA attributes, keyboard navigation, and focus management require expertise
- **Bundle size** — Dragging in full component libraries for just a menu

**@affino/menu-core** solves this by providing **just the behavior logic** in ~8KB. You control the HTML and CSS, we handle the complex interaction patterns.

## Architecture Overview

```
MenuCore
 ├── State Management
 │    ├── subscribe()         → Observable pattern
 │    ├── getSnapshot()       → Current state
 │    └── getTree()           → Shared tree instance
 │         ├── openPath[]     → Active menu hierarchy
 │         └── activePath[]   → Highlighted item chain
 │
 ├── Item Registry
 │    ├── registerItem()      → Add menu items
 │    ├── highlight()         → Focus management
 │    ├── moveFocus()         → Keyboard navigation
 │    └── select()            → Item activation
 │
 ├── Props Binding
 │    ├── getTriggerProps()   → Button/anchor attributes
 │    ├── getPanelProps()     → Menu container attributes
 │    └── getItemProps()      → Individual item attributes
 │
 ├── Positioning
 │    └── computePosition()   → Smart viewport-aware placement
 │
 └── Lifecycle
      ├── open() / close() / toggle()
      ├── cancelPendingClose()
      └── destroy()
```

## Why @affino/menu-core?

Most menu libraries mix logic and UI, tying you to a specific framework. This package **isolates only the behavior layer**, allowing you to build:

- ✅ Vue menus (see `@affino/menu-vue`)
- ✅ React menus
- ✅ Svelte menus
- ✅ Web Components
- ✅ Canvas / Pixi.js menus
- ✅ Terminal UIs
- ✅ Any custom renderer

Libraries like Radix, HeadlessUI, and Mantine are framework-specific. **This is pure TypeScript logic** — bring your own UI.

### Key features

| Feature | @affino/menu-core |
|---------|------------------|
| **Framework** | Any (headless) |
| **Bundle Size** | ~8KB |
| **Mouse Prediction** | ✅ Built-in |
| **Nested Submenus** | ✅ Unlimited |
| **Custom Renderers** | ✅ Canvas/GL/etc |
| **Bring Your CSS** | ✅ 100% control |
| **TypeScript** | ✅ Full |

**Use this when:**
- You need framework flexibility (or plan to migrate frameworks)
- Bundle size matters (mobile-first, performance budgets)
- You want diagonal mouse prediction (better UX for nested menus)
- You're building custom renderers (game engines, canvas apps, terminal UIs)

**Use alternatives when:**
- You're all-in on React and want pre-styled components (Radix, Mantine)
- You prefer component libraries over headless logic (Mantine, Ant Design)
- You need zero configuration and don't mind framework lock-in

## Performance

- ✅ **Event-driven updates** — Core emits updates only when state actually changes
- ✅ **No virtual DOM** — No diffing overhead or reconciliation
- ✅ **No automatic re-renders** — Your adapter controls when/how to update UI
- ✅ **Efficient subscriptions** — Granular state observation with instant snapshots
- ✅ **Zero dependencies** — Minimal bundle size (~8KB minified)

Compared to React-based solutions, this approach eliminates:
- Virtual DOM diffing on every state change
- Framework-level re-render cycles
- Component tree reconciliation overhead

You get direct state updates and full control over rendering strategy.

## Features

- 🎯 **Framework Agnostic** — Pure TypeScript core logic, integrate with any UI framework
- ♿ **Accessible by Default** — Full ARIA support with keyboard navigation (Arrow keys, Home, End, Enter, Escape)
- 🧠 **Smart Mouse Prediction** — Intelligently predicts user intent when hovering toward submenus
- 🪆 **Nested Submenus** — Unlimited nesting depth with coordinated open/close timing
- ⌨️ **Keyboard Navigation** — Complete keyboard control with configurable focus looping
- 📍 **Intelligent Positioning** — Automatic placement and alignment with viewport collision detection
- ⚡ **Performance Optimized** — Minimal re-renders with efficient state subscriptions
- 🎨 **Fully Typed** — Complete TypeScript definitions for all APIs

## Installation

```bash
npm install @affino/menu-core
# or
pnpm add @affino/menu-core
# or
yarn add @affino/menu-core
```

## Quick Start

### Three Steps to a Working Menu

**HTML:**
```html
<button id="menu-trigger">Open Menu</button>
<div id="menu-panel" hidden>
  <div data-item="save">Save</div>
  <div data-item="export">Export</div>
  <div data-item="delete">Delete</div>
</div>
```

**JavaScript:**
```javascript
import { MenuCore } from '@affino/menu-core'

const menu = new MenuCore()
const trigger = document.querySelector('#menu-trigger')
const panel = document.querySelector('#menu-panel')

// 1. Connect the trigger button
trigger.addEventListener('click', () => menu.toggle())

// 2. Register menu items
panel.querySelectorAll('[data-item]').forEach(item => {
  const id = item.dataset.item
  menu.registerItem(id)
  item.addEventListener('click', () => {
    console.log('Selected:', id)
    menu.select(id)
  })
})

// 3. Show/hide the panel
menu.subscribe(state => {
  panel.hidden = !state.open
})
```

**That's it!** Three clear steps, no framework required. The core handles:
- ✅ Keyboard navigation (arrows, enter, escape)
- ✅ ARIA attributes for screen readers  
- ✅ Focus management
- ✅ Open/close coordination

### Full Example with Options

```typescript
import { MenuCore } from '@affino/menu-core'

// Create a menu instance
const menu = new MenuCore({
  id: 'main-menu',
  openDelay: 80,
  closeDelay: 150,
  closeOnSelect: true,
  loopFocus: true
}, {
  onOpen: (menuId) => console.log('Menu opened:', menuId),
  onClose: (menuId) => console.log('Menu closed:', menuId),
  onSelect: (itemId, menuId) => console.log('Item selected:', itemId)
})

// Subscribe to state changes
const subscription = menu.subscribe((state) => {
  console.log('Menu state:', state.open, state.activeItemId)
})

// Register menu items
const unregisterItem1 = menu.registerItem('item-1')
const unregisterItem2 = menu.registerItem('item-2', { disabled: true })

// Get props to bind to your UI elements
const triggerProps = menu.getTriggerProps()
const panelProps = menu.getPanelProps()
const item1Props = menu.getItemProps('item-1')

// Control the menu programmatically
menu.open('programmatic')
menu.requestClose('programmatic')
menu.toggle()

// Cleanup
subscription.unsubscribe()
unregisterItem1()
unregisterItem2()
menu.destroy()
```

## Live Examples

**Try it yourself in under 30 seconds:**

- 🚀 **[Vanilla JS Demo →](https://codesandbox.io/p/sandbox/menu-core-vanilla-j98x8z)**  
  Pure JavaScript — no build step, no framework
  
- 🎨 **Vue 3 Adapter →** Install `@affino/menu-vue` for ready-made Vue components

- ⚛️ **React Adapter →** Install `@affino/menu-react` for ready-made React hooks


## Adapter Guide

Want to create an adapter for your favorite framework? Here's how:

**Step 1: Bind getTriggerProps()**
```typescript
const triggerProps = menu.getTriggerProps()
// Apply these to your trigger element (button/anchor)
```

**Step 2: Bind getPanelProps()**
```typescript
const panelProps = menu.getPanelProps()
// Apply these to your menu panel container
```

**Step 3: Register items and bind getItemProps()**
```typescript
items.forEach(item => {
  menu.registerItem(item.id)
  const itemProps = menu.getItemProps(item.id)
  // Apply to each menu item element
})
```

**Step 4: Handle pointer tracking (for submenus)**
```typescript
// On pointermove events
submenu.recordPointer({ x: event.clientX, y: event.clientY })
```

**Step 5: Use computePosition() for dynamic placement**
```typescript
const position = menu.computePosition(
  triggerRect,
  panelRect,
  { placement: 'bottom', align: 'start' }
)
// Apply position.left and position.top to panel
```

**Step 6: Subscribe to state**
```typescript
menu.subscribe(state => {
  // Update your framework's reactive state
  updateYourFrameworkState(state)
})
```

## Overlay kernel integration

Menus can register with `@affino/overlay-kernel` so pointer/keyboard closes respect global stacking rules:

```ts
import { createOverlayManager } from "@affino/overlay-kernel"

const overlayManager = createOverlayManager()
const menu = new MenuCore({
  id: "file-menu",
  overlayManager,
  overlayEntryTraits: {
    ownerId: "app-shell",
    modal: false,
    priority: 70,
  },
})

menu.open("programmatic")
menu.requestClose("pointer") // routes through overlay manager before closing
```

- `overlayManager` / `getOverlayManager` — inject a manager instance or lazy resolver per host document.
- `overlayKind` — defaults to `"menu"`, but you can set `"context-menu"`, `"listbox"`, etc. for priority tuning.
- `overlayEntryTraits` — override kernel metadata (`ownerId`, `priority`, `modal`, custom `data`). Submenus automatically set `ownerId` to their parent menu.
- `requestClose(reason)` — use this instead of `close()` when you need to invoke pointer/keyboard dismissals manually; kernel-managed reasons (`"pointer"`, `"keyboard"`) always ask the manager first.

Destroying a menu (`menu.destroy()`) unregisters it from the overlay stack; make sure adapters call this during unmount so the kernel never keeps stale entries around.

---

## Core Concepts

### State Management

Menu state is managed through an observable pattern. Subscribe to state changes and react to updates:

```typescript
interface MenuState {
  open: boolean
  activeItemId: string | null
}

const subscription = menu.subscribe((state) => {
  // Update your UI based on state changes
  updateUI(state)
})
```

### Props System

The core provides props objects that match WAI-ARIA Menu pattern specifications. Simply spread these onto your UI elements:

```typescript
const triggerProps = menu.getTriggerProps()
// Returns: { id, role, tabIndex, aria-*, onClick, onKeyDown, ... }

const panelProps = menu.getPanelProps()
// Returns: { id, role, tabIndex, aria-labelledby, onKeyDown, ... }

const itemProps = menu.getItemProps('item-id')
// Returns: { id, role, tabIndex, aria-disabled, data-state, onClick, ... }
```

### Mouse Prediction

**The Problem:**  
When users move their cursor diagonally toward a submenu, they briefly hover over other menu items. Without prediction, this closes the submenu they're trying to reach—super frustrating!

**The Solution:**  
The core tracks mouse movement and intelligently keeps submenus open when it detects diagonal motion toward them. Inspired by Amazon's mega menus and Stripe's navigation.

```typescript
// The defaults work great for 90% of cases:
const menu = new MenuCore() // ✅ Just works!

// Need to tune for trackpads or dense menus?
const menu = new MenuCore({
  mousePrediction: {
    verticalTolerance: 30,    // More forgiving diagonal movement
    headingThreshold: 0.2     // Less strict direction checking
  }
})
```

**When to adjust:**
- Trackpad users → Increase `verticalTolerance` (30-40px)
- Very dense menus → Lower `headingThreshold` (0.1-0.2)
- High-precision mice → Keep defaults

**Need visibility into the heuristic?** Pass `onDebug` when constructing a menu (or when creating submenus) to receive structured `MenuDebugEvent` objects. Today the event type is `"mouse-prediction"`, which streams the sampled points, heading score, and corridor analysis so devtools can render overlays or export telemetry. If you would rather log without wiring a callback, set `DEBUG_MENU=1` (or `globalThis.__MENU_DEBUG__ = true`) before creating controllers and the predictor will `console.debug` the payloads for you.

📖 Full tuning guide: [docs/mouse-prediction.md](./docs/core/mouse-prediction.md)

### Nested Submenus

Create child menus with automatic coordination:

```typescript
import { SubmenuCore } from '@affino/menu-core'

const parentMenu = new MenuCore({ id: 'parent' })
const parentTree = parentMenu.getTree()

const submenu = new SubmenuCore(
  parentMenu,
  {
    id: 'submenu-1',
    parentItemId: 'parent-item-with-submenu',
    openDelay: 100,
    closeDelay: 150
  },
  {
    onOpen: (menuId) => console.log('Submenu opened:', menuId)
  }
)

// Submenus inherit parent tree for coordinated behavior
submenu.getTree() === parentTree // true
```

### Headless Tree Helper

Prefer not to touch `SubmenuCore` directly? Use `createMenuTree` to get typed handles that include pointer + geometry adapters for every branch.

```ts
import { createMenuTree } from "@affino/menu-core"

const tree = createMenuTree({ options: { openDelay: 60, closeDelay: 90 } })

tree.root.registerItem("file")

const fileSubmenu = tree.createSubmenu({
  parent: tree.root,
  parentItemId: "file",
})

fileSubmenu.geometry?.sync({
  trigger: document.querySelector("[data-file]")?.getBoundingClientRect() ?? null,
  panel: document.querySelector("[data-file-panel]")?.getBoundingClientRect() ?? null,
})

window.addEventListener("pointermove", (event) => {
  fileSubmenu.pointer?.record({ x: event.clientX, y: event.clientY })
})

// Clean up every branch with a single call
tree.destroy()
```

## API Reference

### MenuCore

#### Constructor

```typescript
new MenuCore(options?: MenuOptions, callbacks?: MenuCallbacks)
```

**Options:**
- `id?: string` — Unique menu identifier (auto-generated if omitted)
- `openDelay?: number` — Delay before opening on hover (default: `80`ms)
- `closeDelay?: number` — Delay before closing on hover out (default: `150`ms)
- `closeOnSelect?: boolean` — Auto-close when item selected (default: `true`)
- `loopFocus?: boolean` — Wrap focus at list boundaries (default: `true`)
- `mousePrediction?: MousePredictionConfig | null | false` — Mouse prediction settings (`null`/`false` disables it)

**Callbacks:**
- `onOpen?: (menuId: string) => void`
- `onClose?: (menuId: string) => void`
- `onSelect?: (itemId: string, menuId: string) => void`
- `onHighlight?: (itemId: string | null, menuId: string) => void`
- `onDebug?: (event: MenuDebugEvent) => void`
- `onPositionChange?: (menuId: string, position: PositionResult) => void`

#### Methods

##### State Control

```typescript
menu.open(reason?: 'pointer' | 'keyboard' | 'programmatic'): void
menu.close(reason?: 'pointer' | 'keyboard' | 'programmatic'): void
menu.toggle(): void
```

##### State Subscription

```typescript
menu.subscribe(listener: (state: MenuState) => void): Subscription
menu.getSnapshot(): MenuState
```

##### Item Registry

```typescript
menu.registerItem(id: string, options?: { disabled?: boolean }): () => void
menu.highlight(id: string | null): void
menu.moveFocus(delta: 1 | -1): void
menu.select(id: string): void
```

##### Props Getters

```typescript
menu.getTriggerProps(): TriggerProps
menu.getPanelProps(): PanelProps
menu.getItemProps(id: string): ItemProps
```

##### Positioning

```typescript
menu.computePosition(
  anchor: Rect,
  panel: Rect,
  options?: PositionOptions
): PositionResult
```

**PositionOptions:**
- `gutter?: number` — Space between anchor and panel (default: `4`px)
- `viewportPadding?: number` — Minimum viewport margin (default: `8`px)
- `placement?: 'left' | 'right' | 'top' | 'bottom' | 'auto'` (default: `'bottom'`)
- `align?: 'start' | 'center' | 'end' | 'auto'` (default: `'start'`)
- `viewportWidth?: number` — Custom viewport width
- `viewportHeight?: number` — Custom viewport height

##### Tree & Cleanup

```typescript
menu.getTree(): MenuTree
menu.cancelPendingClose(): void
menu.destroy(): void
```

### SubmenuCore

Extends `MenuCore` with parent-child coordination.

```typescript
new SubmenuCore(
  parent: MenuCore,
  options: SubmenuOptions,
  callbacks?: MenuCallbacks
)
```

**Additional Options:**
- `parentItemId: string` — ID of the parent menu item that triggers this submenu

**Additional Methods:**

```typescript
submenu.setTriggerRect(rect: Rect | null): void
submenu.setPanelRect(rect: Rect | null): void
submenu.recordPointer(point: { x: number; y: number }): void
```

## Advanced Examples

### Custom Framework Integration

```typescript
import { MenuCore } from '@affino/menu-core'

class MyMenuComponent {
  private core: MenuCore
  private unsubscribe: () => void
  
  constructor(element: HTMLElement) {
    this.core = new MenuCore({
      id: element.id || undefined,
      closeOnSelect: true
    }, {
      onOpen: () => this.render(),
      onClose: () => this.render(),
      onHighlight: () => this.render()
    })
    
    this.unsubscribe = this.core.subscribe((state) => {
      this.updateDOM(state)
    })
    
    this.bindEvents(element)
  }
  
  private bindEvents(element: HTMLElement) {
    const trigger = element.querySelector('[data-trigger]')!
    const panel = element.querySelector('[data-panel]')!
    const items = element.querySelectorAll('[data-item]')
    
    const triggerProps = this.core.getTriggerProps()
    Object.entries(triggerProps).forEach(([key, value]) => {
      if (key.startsWith('on')) {
        trigger.addEventListener(key.slice(2).toLowerCase(), value)
      } else if (key.startsWith('aria-') || key === 'role' || key === 'tabIndex') {
        trigger.setAttribute(key, String(value))
      }
    })
    
    items.forEach((item) => {
      const itemId = item.getAttribute('data-item')!
      const unregister = this.core.registerItem(itemId)
      const itemProps = this.core.getItemProps(itemId)
      
      // Bind item props similarly...
    })
  }
  
  destroy() {
    this.unsubscribe()
    this.core.destroy()
  }
}
```

### Dynamic Positioning

```typescript
import { computePosition } from '@affino/menu-core'

function updateMenuPosition(
  triggerEl: HTMLElement,
  panelEl: HTMLElement
) {
  const triggerRect = triggerEl.getBoundingClientRect()
  const panelRect = panelEl.getBoundingClientRect()
  
  const position = computePosition(triggerRect, panelRect, {
    placement: 'bottom',
    align: 'start',
    gutter: 8,
    viewportPadding: 16,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  })
  
  panelEl.style.left = `${position.left}px`
  panelEl.style.top = `${position.top}px`
  
  // Update based on final placement
  panelEl.dataset.placement = position.placement
  panelEl.dataset.align = position.align
}
```

### Multi-Level Menu Tree

```typescript
const rootMenu = new MenuCore({ id: 'root' })
const tree = rootMenu.getTree()

// First level submenu
const submenu1 = new SubmenuCore(rootMenu, {
  id: 'submenu-1',
  parentItemId: 'root-item-1'
})

// Second level submenu
const submenu2 = new SubmenuCore(submenu1, {
  id: 'submenu-2',
  parentItemId: 'submenu-1-item-3'
})

// All share the same tree instance
tree.subscribe('root', (state) => {
  console.log('Open path:', state.openPath)
  console.log('Active path:', state.activePath)
})
```

## TypeScript Support

All types are exported for full type safety:

```typescript
import type {
  MenuCore,
  SubmenuCore,
  MenuOptions,
  MenuCallbacks,
  MenuState,
  TriggerProps,
  PanelProps,
  ItemProps,
  PositionOptions,
  PositionResult,
  MousePredictionConfig,
  Rect,
  Point
} from '@affino/menu-core'
```

## Best Practices

1. **Always cleanup** — Call `destroy()` and unsubscribe when component unmounts
2. **Register items early** — Register menu items before opening to ensure proper focus management
3. **Use ref callbacks** — Bind element refs via callbacks to handle dynamic DOM updates
4. **Debounce positioning** — Use ResizeObserver with debouncing for position recalculation
5. **Test accessibility** — Verify keyboard navigation and screen reader announcements
6. **Handle edge cases** — Account for scrollable containers and CSS transforms in positioning

## Browser Support

- Modern browsers with ES2020+ support
- TypeScript 5.0+
- No polyfills required for core functionality

## Troubleshooting

### Menu doesn't close when clicking outside

**Problem:** The core doesn't automatically handle click-outside detection.  
**Solution:** Add this to your adapter:

```javascript
document.addEventListener('click', (e) => {
  if (!panel.contains(e.target) && !trigger.contains(e.target)) {
    menu.close('programmatic')
  }
})
```

### Keyboard navigation not working

**Problem:** Forgot to apply `getPanelProps()` to the menu container.  
**Solution:** The panel needs `role="menu"` and keyboard event handlers:

```javascript
const panelProps = menu.getPanelProps()
Object.assign(panel, panelProps)
```

### Menu position is wrong with CSS transforms

**Problem:** `getBoundingClientRect()` returns viewport coordinates, but transforms affect positioning.  
**Solution:** Pass custom viewport dimensions or adjust for transform scale:

```javascript
const position = menu.computePosition(triggerRect, panelRect, {
  viewportWidth: window.innerWidth / scale,
  viewportHeight: window.innerHeight / scale
})
```

### Submenu closes too quickly

**Problem:** Default `closeDelay` is too short for your use case.  
**Solution:** Increase the delay:

```javascript
const submenu = new SubmenuCore(parent, {
  closeDelay: 300  // Wait 300ms before closing (default: 150ms)
})
```

### TypeScript errors with props

**Problem:** Spreading props onto elements with strict types.  
**Solution:** Cast or use type assertions:

```typescript
const props = menu.getTriggerProps()
Object.assign(trigger as any, props)
// Or: {...props as React.ButtonHTMLAttributes<HTMLButtonElement>}
```

## Contributing

Feedback and contributions are welcome! This project is in beta and we're actively seeking:

- 🐛 Bug reports
- 💡 Feature suggestions
- 🧪 Real-world usage examples
- 📦 Framework adapters (React, Svelte, etc.)

## License

MIT

---

**Related Packages:**
- [`@affino/menu-vue`] — Vue 3 components built on this core
- [`@affino/menu-react`] — React components built on this core
