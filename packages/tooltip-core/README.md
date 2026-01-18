# @affino/tooltip-core

Deterministic tooltip controller that reuses the shared primitives from `@affino/surface-core`:

- Predictable open/close state machine with hover + focus orchestration
- Delayed show/hide timers for forgiving intent
- Pointer-aware guards so nested surfaces can keep chains alive
- Geometry helpers (`computePosition`) without external deps

```bash
pnpm add @affino/tooltip-core
```

## Usage

```ts
import { TooltipCore } from "@affino/tooltip-core"

const tooltip = new TooltipCore({ id: "field-help", openDelay: 80, closeDelay: 150 })

const triggerProps = tooltip.getTriggerProps()
const contentProps = tooltip.getTooltipProps()
```

Render `triggerProps` on the element that owns the tooltip (usually an icon or label) and `contentProps` on the floating panel. The controller keeps ARIA wiring, hover/focus coordination, and timers consistent so adapters (React, Vue, etc.) can stay thin.
