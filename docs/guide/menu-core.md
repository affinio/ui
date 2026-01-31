# Menu Core Guide

The `@affino/menu-core` package is the shared state machine that powers every menu adapter. It owns item registration, nested tree coordination, predictive pointer heuristics, and the ergonomics above DOM frameworks. This guide walks through the mental model so you can author your own adapter, integrate with a design system, or run complex test harnesses without touching Vue/React glue.

## Architecture In Plain English

```
MenuCore (root)
  |-- Trigger props --> DOM button / custom element
  |-- Panel props   --> floating surface container
  |-- Item props    --> repeated menu rows (can spawn SubmenuCore)
          |
          v
  SubmenuCore (child) --> shares the same MenuTree instance
```

Key ideas:

- Every `MenuCore` extends `SurfaceCore`, gaining open/close timers, pointer leave heuristics, and viewport-aware positioning telemetry.
- Item registration feeds a deterministic `MenuStateMachine` that tracks enabled IDs and provides `highlight`, `moveFocus`, and `select` helpers.
- When you instantiate a `SubmenuCore` you pass the parent menu plus the `parentItemId` that should spawn the submenu. Children inherit the same `MenuTree` so they know when siblings open or close.

## The Menu Tree

`MenuTree` is a lightweight observer that keeps two derived arrays:

| Field | Meaning |
| --- | --- |
| `openPath` | Ordered list of menu IDs that are currently open from the root down. |
| `activePath` | Ordered list describing which submenu-triggering items are highlighted, allowing parents to keep the visual chain hot. |

You never mutate the tree directly. Each `MenuCore` registers itself and calls:

- `tree.updateOpenState(menuId, open)` whenever a menu opens or closes.
- `tree.updateHighlight(menuId, highlightedItemId)` whenever a submenu trigger item gets focus.
- `tree.subscribe(menuId, listener)` to react to upstream changes (the `SubmenuCore` uses this to auto-close when the parent dismisses).

Because the tree lives outside component render loops, you can create multiple channels (desktop vs. context menu) that share intent state even if they render in different parts of the DOM.

## Channels, Reasons, And Timers

`MenuCore` inherits `open(reason)`/`close(reason)` from `SurfaceCore`. Reasons are simple strings (`"pointer"`, `"keyboard"`, `"programmatic"`) that bubble through the callbacks you pass to the constructor (`onOpen`, `onClose`, `onHighlight`, `onSelect`). They allow adapters to decide whether to focus elements, play sounds, or persist analytics depending on how a menu changed state.

The bundled timers (`openDelay`, `closeDelay`) ensure the entire tree feels cohesive: hovering a submenu trigger schedules an open, leaving schedules a close, and pointer metadata (`event.meta.isWithinTree`, `enteredChildPanel`, `relatedMenuId`) tells the machine whether the leave should be ignored. You almost never need to manage `setTimeout` manually.

## Geometry + Pointer Intent

Submenus must understand whether the pointer is moving toward the child panel so that diagonal movements do not instantly close the menu. `SubmenuCore` exposes three imperative methods you should wire up in your adapter:

| Method | When to call it |
| --- | --- |
| `setTriggerRect(rect)` | Whenever the trigger element reflows (ResizeObserver, layout effect, etc.). Pass `null` when unmounted. |
| `setPanelRect(rect)` | Run after the submenu panel renders or moves so the predictor knows the destination. |
| `recordPointer({ x, y })` | Call on every pointer move that happens while the tree is hovered. The helper tolerates being called with high frequency. |

Those three values feed into the `MousePrediction` heuristic shown below. Even if you ignore prediction, still call `recordPointer` so future features (like heatmap tooling) have data.

## Mouse Prediction Configuration

The `mousePrediction` option lets you customize how aggressively the tree waits before collapsing. Defaults match macOS menu behaviour and live in `MousePrediction.ts`.

| Option | Default | Effect |
| --- | --- | --- |
| `history` | `8` | Number of pointer samples kept in memory. Increase for smoother movement at the cost of responsiveness. |
| `verticalTolerance` | `48` | Corridor padding in pixels when moving horizontally toward a submenu. Larger values forgive bigger vertical swings. |
| `headingThreshold` | `0.2` | Minimum cosine similarity before we consider the pointer "aimed" at the submenu. Lower values make prediction more permissive. |
| `samplingOffset` | `2` | How many samples back we compare against to determine direction. Useful when pointer events fire very rapidly. |
| `horizontalThreshold` | `6` | How far the pointer can drift backward before we consider it moving away. |
| `driftBias` | `0.4` | Favors movement along the dominant axis to filter tiny diagonal jitters. |

```ts
import { MenuCore } from "@affino/menu-core"

const menu = new MenuCore({
  closeDelay: 120,
  mousePrediction: {
    history: 10,
    verticalTolerance: 64,
    driftBias: 0.6,
  },
})
```

When tuning, run your app with `DEBUG_MENU=1` (or set `globalThis.__MENU_DEBUG__ = true`) before constructing menus. This enables verbose console logs inside `SubmenuCore` and lets you attach a `MousePrediction` debug callback if you instantiate the class manually.

## Vanilla Wiring Example

The snippet below shows the minimum wiring required to use `MenuCore` without any framework. It highlights how geometry, pointer data, and DOM events tie together.

```ts
import { MenuCore, SubmenuCore } from "@affino/menu-core"

const root = new MenuCore({ openDelay: 80, closeDelay: 120 })
const submenu = new SubmenuCore(root, { parentItemId: "file" })

const triggerEl = document.querySelector("[data-file]")!
const panelEl = document.querySelector("[data-file-panel]")!

const cleanupTrigger = attachProps(triggerEl, root.getTriggerProps())
const cleanupPanel = attachProps(panelEl, root.getPanelProps())

const observer = new ResizeObserver(() => {
  const triggerRect = triggerEl.getBoundingClientRect()
  const panelRect = panelEl.getBoundingClientRect()
  submenu.setTriggerRect(triggerRect)
  submenu.setPanelRect(panelRect)
})
observer.observe(triggerEl)
observer.observe(panelEl)

window.addEventListener("pointermove", (event) => {
  if (!root.getSnapshot().open) return
  submenu.recordPointer({ x: event.clientX, y: event.clientY })
})

function attachProps(node, props) {
  Object.entries(props).forEach(([key, value]) => {
    if (typeof value === "function" && key.startsWith("on")) {
      node.addEventListener(key.slice(2).toLowerCase(), value)
      return
    }
    node.setAttribute(key, value as string)
  })
  return () => { /* remove listeners + attributes */ }
}
```

Adapters typically wrap this boilerplate in components/hooks so end users never see it, but the underlying responsibilities remain the same.

## createMenuTree Helper

When you do not want to juggle raw `SubmenuCore` instances, call `createMenuTree`. It instantiates the root menu and gives you typed handles for every submenu, including geometry + pointer adapters.

```ts
import { createMenuTree } from "@affino/menu-core"

const tree = createMenuTree({
  options: { openDelay: 60, closeDelay: 90 },
  callbacks: { onSelect: (id) => console.log("selected", id) },
})

tree.root.registerItem("file")

const fileMenu = tree.createSubmenu({
  parent: tree.root,
  parentItemId: "file",
})

const cleanup = fileMenu.registerItem("file:new")

window.addEventListener("pointermove", (event) => {
  fileMenu.pointer?.record({ x: event.clientX, y: event.clientY })
})

syncRects()

function syncRects() {
  fileMenu.geometry?.sync({
    trigger: document.querySelector("[data-file]")?.getBoundingClientRect() ?? null,
    panel: document.querySelector("[data-file-panel]")?.getBoundingClientRect() ?? null,
  })
}

// Later → tear everything down with a single call
tree.destroy()
cleanup()
```

Every branch exposes the standard menu API (`open`, `close`, `getTriggerProps`, etc.) plus:

- `branch.pointer.record(point)` – pushes pointer samples for diagonal prediction.
- `branch.geometry.setTriggerRect(rect)` / `.setPanelRect(rect)` – single-target setters for adapters that already track individual rectangles.
- `branch.geometry.sync({ trigger, panel })` – convenience helper for updating both in one pass.

## Testing Checklist

- Use `root.highlight(id)` and `root.select(id)` inside tests to simulate keyboard flows without firing DOM events.
- Subscribe to `root.subscribe(state => { ... })` to assert `activeItemId`, timers, and open/close cascades.
- Mount a `SubmenuCore` in the same test to verify `MenuTree` interactions. Push fabricated pointer samples into `submenu.recordPointer` and call `submenu.shouldHoldPointer` indirectly by firing the pointer leave handlers.

## Where To Go Next

- [Context menus](./context-menu.md) expands on right-click channels built on top of this core.
- [Virtualization](./virtualization.md) explains how to stream large item sets into `MenuCore` while staying keyboard-friendly.
- The adapters (`menu-react`, `menu-vue`) are small by design—browse their source to see production-ready wiring patterns.
