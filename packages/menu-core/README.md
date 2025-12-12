# @affino/menu-core

> 🚧 **Status:** Beta — API is stable, seeking feedback before 1.0 release

A framework-agnostic, type-safe menu/dropdown core engine with intelligent mouse prediction, nested submenu support, and comprehensive accessibility features.

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

### Minimal Working Example (Vanilla JS)

```javascript
import { MenuCore } from '@affino/menu-core'

// Create menu instance
const menu = new MenuCore()

// Get DOM elements
const trigger = document.querySelector('#menu-trigger')
const panel = document.querySelector('#menu-panel')
const items = panel.querySelectorAll('[data-item]')

// Bind trigger
Object.assign(trigger, menu.getTriggerProps())
trigger.addEventListener('click', () => menu.toggle())

// Bind panel
Object.assign(panel, menu.getPanelProps())

// Register and bind items
items.forEach(item => {
  const itemId = item.dataset.item
  menu.registerItem(itemId)
  Object.assign(item, menu.getItemProps(itemId))
  item.addEventListener('click', () => menu.select(itemId))
})

// React to state changes
menu.subscribe(state => {
  panel.style.display = state.open ? 'block' : 'none'
})
```

**No framework required!** This is pure JavaScript with DOM manipulation.

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
menu.close('programmatic')
menu.toggle()

// Cleanup
subscription.unsubscribe()
unregisterItem1()
unregisterItem2()
menu.destroy()
```

## Live Examples

- 🚀 [Vanilla JS Demo](https://codesandbox.io/s/menu-core-vanilla) — Pure JavaScript implementation
- 🎨 [Vue 3 Demo](../menu-vue) — Using `@affino/menu-vue` adapter
- ⚛️ React Demo — Coming soon
- 💚 Svelte Demo — Coming soon

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

See [`@affino/menu-vue`](../menu-vue) for a complete Vue 3 adapter implementation.

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

Predicts when users are moving toward a submenu to prevent accidental closes.

**Default configuration works well for most cases.** For advanced tuning:

```typescript
const menu = new MenuCore({
  mousePrediction: {
    history: 3,              // Track last 3 pointer positions
    verticalTolerance: 20,   // Allow 20px vertical drift
    headingThreshold: 0.3,   // Minimum directional confidence
    horizontalThreshold: 5,  // Min 5px horizontal progress
    samplingOffset: 2,       // Compare positions 2 steps apart
    driftBias: 0.8           // Forgiveness for vertical drift
  }
})
```

�� See [docs/mouse-prediction.md](./docs/mouse-prediction.md) for detailed explanation of each parameter.

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
- `mousePrediction?: MousePredictionConfig` — Mouse prediction settings

**Callbacks:**
- `onOpen?: (menuId: string) => void`
- `onClose?: (menuId: string) => void`
- `onSelect?: (itemId: string, menuId: string) => void`
- `onHighlight?: (itemId: string | null, menuId: string) => void`
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
- [`@affino/menu-vue`](../menu-vue) — Vue 3 components built on this core
- React adapter — Coming soon
- Svelte adapter — Coming soon
