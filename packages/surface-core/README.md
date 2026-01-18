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
