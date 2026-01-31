# Core-Level Priorities (Menu / Tooltip / Modal)

> Goal: take the kernel packages to "10/10" quality before layering adapters. This file collects the gaps and concrete next steps for each core surface.

## Shared Baseline (all core packages)

1. **Release artifacts**
   - Ship ESM + CJS bundles plus `*.d.ts` for every core package.
   - Add `pnpm --filter @affino/* build && pnpm --filter @affino/* test` to CI to guarantee artifacts stay green.
2. **Docs & changelog**
   - Each package needs a README with overview, install, API table, and recipes.
   - Publish a central "Core Concepts" page linking to surface, menu, tooltip, dialog internals.
3. **Test coverage**
   - Contract tests for timers, pointer heuristics, guards, and focus orchestration.
   - Snapshot tests for public controller state so adapters cannot regress silently.
4. **Debuggability**
   - Consistent `DEBUG_*` env names and runtime toggles (e.g., `controller.setDebug(true)`).
   - Structured logging (grouped console output or leveled logger) so large apps are debuggable.

## @affino/surface-core (shared engine)

- **Missing pieces**: Public docs only exist inside menu write-ups; no standalone spec for timers, anchors, or viewport math.
- **Blockers**:
  1. No runtime validation for malformed Rect/placement input → NaN cascades.
  2. Scroll-lock + keydown helpers live elsewhere; need a clear story for consumers who only install surface-core.
- **Action items**:
  - Add `SurfaceDiagnostics` helper that asserts valid geometry and emits warnings in dev.
  - Document `SurfaceCore` lifecycle (open → settle → close) with ASCII diagrams.
  - Export TypeScript types for guards (`SurfaceOptions`, `SurfaceCallbacks`) from dist.

## @affino/menu-core (menu kernel)

- **Identified gaps**:
  1. Mouse prediction config undocumented outside tsdoc.
  2. Internal setters (`setTriggerRect`, `recordPointer`) are the only way adapters sync geometry; third parties can’t build adapters confidently.
  3. No high-level tests for tree coordination (multi-root, nested close guards).
- **Plan**:
  - Publish `MenuCore Guide` covering tree structure, channels, `mousePrediction` schema + defaults.
  - Expose a `createMenuTree(options)` helper that returns the core + typed API, hiding raw setters.
  - Add Playwright suite: diagonal pointer travel, cascading closeOnSelect, optimistic close.
  - Emit structured debug events (`core.on("position", payload)`) so devtools could subscribe.

## @affino/tooltip-core

- **Identified gaps**:
  1. Positioning defaults (`strategy: "fixed"`) break inside scrollable containers; docs don’t mention trade-offs.
  2. No arrow/aria-live helpers for announcement tooltips.
  3. Limited regression tests around open/close delay interplay.
- **Plan**:
  - Expand README with "Layering inside overlays" + `strategy` decision tree.
  - Expose `getArrowProps()` + `getAriaDescription()` helpers for adapters.
  - Add contract tests for `openDelay/closeDelay` and pointer re-entry scenarios.
  - Publish canonical examples (Vanilla JS, Vue, React) consuming only tooltip-core to prove adapter-less usage.

## @affino/dialog-core (modal kernel)

- **Identified gaps**:
  1. Guarded close flows lack race-condition tests (pending guard resolves while user retries close).
  2. No React adapter or documented interop plan.
  3. Focus orchestration primitives aren’t documented outside demo code.
- **Plan**:
  - Create `dialog-core` README with guard timeline diagrams and focus orchestration recipes.
  - Add contract tests for optimistic close: guard denies, guard resolves, `maxPendingAttempts` enforcement.
  - Publish adapter-agnostic `createDialogController` usage snippet (Vanilla + headless example) to show React integration path.

## Timeline Suggestion

| Phase | Focus | Deliverables |
| --- | --- | --- |
| 1 | Surface + Menu core hardening | Diagnostics helper, menu-core guide, tree tests |
| 2 | Tooltip + Dialog core polish | Positioning docs, arrow helpers, guard tests |
| 3 | Cross-package DX | Unified docs, release automation, debug tooling |

Track completion via GitHub issues linked from this file; update status per phase during weekly review.
