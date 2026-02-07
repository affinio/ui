# @affino/surface-core

Headless interaction kernel for floating surfaces.

`surface-core` provides deterministic state transitions, timer orchestration primitives, and positioning utilities used by menu/tooltip/popover/dialog adapters.

## Installation

```bash
pnpm add @affino/surface-core
```

## Core timing semantics

`open`, `close`, and `toggle` are immediate state transitions.

- `open()` sets `open: true` immediately.
- `close()` sets `open: false` immediately.
- `toggle()` flips state immediately.

Configured delays (`openDelay`, `closeDelay`) are used only when adapters explicitly schedule timers through `SurfaceTimers`-backed flows (for example pointer-leave hover behavior).

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

## Reason mapping guidance

Use `SurfaceReason` consistently in adapters:

- `"pointer"`: pointer-enter/leave or outside pointer dismiss
- `"keyboard"`: Escape/keyboard initiated close/open
- `"programmatic"`: external imperative control

Avoid mixing synthetic reason aliases; keep one reason contract through all adapter layers.

## API

- `open(reason?)`
- `close(reason?)`
- `toggle()`
- `getSnapshot()`
- `subscribe(listener)`
- `cancelPendingClose()`
- `computePosition(anchorRect, surfaceRect, options?)`
- `destroy()`

## Snapshot guarantees

- `getSnapshot()` returns a runtime-frozen object.
- Snapshot reference remains stable across no-op transitions (`open` on open, `close` on closed).

## Adapter guardrails

- Keep one canonical surface state source in adapter state.
- Treat snapshots as immutable outputs.
- If delayed behavior is needed, schedule timers in adapter/derived controller explicitly.
- Always clear/destroy controllers on unmount to avoid leaked timers/subscribers.
