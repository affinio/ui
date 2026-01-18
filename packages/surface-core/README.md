# @affino/surface-core

Headless interaction kernel for any floating surface: menus, tooltips, contextual panels, or popovers.

The package centralizes the primitives that every surface needs:

- Deterministic open/close state machine
- Shared timer orchestration (delayed open/close)
- Pointer-aware helpers for hover/focus driven workflows
- Geometry utilities (`computePosition`) for viewport-safe anchoring
- Callback plumbing with predictable ordering

Adapters like `@affino/menu-core` or the upcoming tooltip primitives build on top of this package so they can focus on domain-specific behavior (selection, tree coordination, etc.) while sharing the interaction basics.

```bash
pnpm add @affino/surface-core
# or
npm install @affino/surface-core
```

## Quick start

```ts
import { SurfaceCore } from "@affino/surface-core"

class TooltipCore extends SurfaceCore {
  protected composeState(surface) {
    return surface
  }

  getTriggerProps() {
    return {
      onPointerEnter: () => this.open("pointer"),
      onPointerLeave: () => this.close("pointer"),
    }
  }
}
```

See `packages/menu-core` for a full example of composing `SurfaceCore` with richer selection logic.

## API reference

| Method | Description |
| --- | --- |
| `open(reason?)` / `close(reason?)` / `toggle()` | Transition the surface with consistent timer semantics. |
| `getSnapshot()` | Returns `{ open: boolean }` or your extended state. |
| `subscribe(listener)` | Receive snapshot updates (returns `{ unsubscribe }`). |
| `computePosition(anchorRect, surfaceRect, options?)` | Resolves `{ left, top, placement, align }` while emitting `onPositionChange`. |
| `destroy()` | Clears timers + subscriptions; call when disposing custom controllers.

### Position options

| Option | Type | Notes |
| --- | --- | --- |
| `gutter` | `number` | Gap between anchor and surface in px (defaults to `4`). |
| `viewportPadding` | `number` | Minimum space to keep from viewport edges. |
| `placement` | `"top" | "bottom" | "left" | "right" | "auto"` | Preferred side; `auto` picks the best fit. |
| `align` | `"start" | "center" | "end" | "auto"` | Horizontal/vertical alignment depending on placement. |

Surface primitives (menus, tooltips, contextual panels) can now share identical timing and pointer semantics while layering on their own domain logic.
