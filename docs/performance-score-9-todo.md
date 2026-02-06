# Performance TODO to Reach >= 9.0

Baseline from technical audit (2026-02-06): we are closing packages from lowest score to highest until every package is `>= 9.0`.

## Ordered TODO (Hard -> Simple)

- [x] `menu-laravel` (5.9 -> target 9.0): remove full-document refresh on every relevant mutation, switch to scoped refresh with full-scan fallback only when needed.
  Done: introduced scoped refresh queue in `packages/menu-laravel/resources/js/menu/hydrate.ts`.
- [x] `listbox-laravel` (6.7 -> target 9.0): reduce repeated `querySelectorAll`/rehydrate churn and isolate structure checks to changed subtrees.
  Done: document-observer scan/cleanup now batched + deduplicated (single microtask flush for added scopes and removed roots) in `packages/listbox-laravel/resources/js/index.ts`.
- [x] `combobox-laravel` (6.8 -> target 9.0): optimize option refresh/filter path and reduce layout reads (`getBoundingClientRect`) under typing.
  Done: removed per-keystroke DOM option recount (`querySelectorAll`) by introducing `optionsDirty` refresh, plus batched/deduplicated mutation scan/cleanup in `packages/combobox-laravel/resources/js/combobox/hydrate.ts`.
- [x] `tooltip-laravel` (6.8 -> target 9.0): narrow pointer/focus guards and mutation work to active roots only.
  Done: switched document observer to batched/deduplicated scan+cleanup and now schedule tracked-focus sync only for tooltip-relevant mutations in `packages/tooltip-laravel/resources/js/tooltip/hydrate.ts`.
- [x] `laravel-adapter` (6.9 -> target 9.0): optimize scroll guards to avoid global `querySelectorAll` on each scroll tick.
  Done: rewired scroll guards to cached target-root sets with mutation-driven invalidation, so global selector scans happen on relevant DOM changes instead of every scroll frame (`packages/laravel-adapter/resources/js/internal/scrollGuards.ts`), plus regression coverage in `packages/laravel-adapter/resources/js/internal/scrollGuards.spec.ts`.
- [x] `popover-laravel` (6.9 -> target 9.0): reduce relayout/observer overhead and deduplicate refresh triggers.
  Done: added batched/deduplicated mutation scan+cleanup and relayout-frame dedupe under scroll/resize bursts in `packages/popover-laravel/resources/js/popover/hydrate.ts`; added coverage for relayout dedupe in `packages/popover-laravel/resources/js/index.spec.ts`.
- [x] `menu-core` (7.0 -> target 9.0): remove repeated sort/hot-path recomputation in item registry/state transitions.
  Done: `ItemRegistry` now uses cached ordered/enabled snapshots with targeted invalidation (no per-call sort/filter/map), plus `MenuCore` now consumes cached enabled snapshot in hot paths and skips no-op item-change recomputation (`packages/menu-core/src/core/ItemRegistry.ts`, `packages/menu-core/src/core/MenuCore.ts`).
- [x] `surface-core` (7.2 -> target 9.0): remove generated artifacts from `src` and align TS/JS source-of-truth to lower maintenance risk.
  Done: removed generated artifacts (`*.js`, `*.d.ts`, `*.d.ts.map`) from `packages/surface-core/src` and tightened compilation input to TS sources only in `packages/surface-core/tsconfig.json`.
- [x] `grid-selection-core` (7.4 -> target 9.0): optimize range merge/remove algorithms to avoid `O(n^2)` behavior on large selections.
  Done: replaced naive repeated full-scan merging with row-bucketed overlap merge (candidate-scoped comparisons) and removed redundant normalization work in remove-subtract path in `packages/grid-selection-core/src/geometry.ts`; added transitive-merge regression in `packages/grid-selection-core/src/__tests__/grid-selection-core.test.ts`.
- [x] `selection-core` (7.8 -> target 9.0): optimize linear merge/toggle update paths and reduce repeated normalization/sorting.
  Done: rewired linear selection hot paths to avoid repeated merge/sort cycles in `toggle/remove/add` by operating on a single merged snapshot and using linear insert/subtract helpers (`packages/selection-core/src/linear.ts`); added unsorted-input regression coverage in `packages/selection-core/src/__tests__/linear.test.ts`.
- [x] `dialog-core` (8.0 -> target 9.0): split monolithic controller paths and trim close-guard overhead in hot transitions.
  Done: extracted shared close preflight gate (`canAttemptClose`), reused a single guard outcome promise across repeated close attempts during pending guard states, and replaced kernel close resolver array churn with `Set`-based resolution in `packages/dialog-core/src/dialogController.ts`.
- [x] `tabs-laravel` (8.1 -> target 9.0): replace global document observer with scoped/managed hydration strategy.
  Done: switched tabs runtime from eager global rescans to managed hydration with structure-aware rehydrate skip, batched scoped scans, and batched removed-root cleanup in `packages/tabs-laravel/resources/js/index.ts`; added cleanup regression coverage in `packages/tabs-laravel/resources/js/index.spec.ts`.
- [x] `combobox-core` (8.2 -> target 9.0): optimize selected-index expansion paths for large ranges.
  Done: optimized selected-index expansion by adding count/map helpers and preallocated index expansion to avoid dynamic push growth and repeated normalization overhead in `packages/combobox-core/src/index.ts`; added coverage in `packages/combobox-core/src/__tests__/combobox-core.test.ts`.
- [x] `listbox-core` (8.3 -> target 9.0): optimize navigation across disabled-heavy option sets.
  Done: replaced repeated step-by-step disabled scans with single-pass enabled-index snapshot navigation (binary-search + arithmetic jump for large deltas/looping), and added disabled-heavy regression coverage in `packages/listbox-core/src/__tests__/listboxCore.test.ts`.
- [x] `popover-core` (8.4 -> target 9.0): micro-optimize overlay mediation and positioning helper overhead.
  Done: added close fast-path to skip overlay mediation when already closed, replaced reason `switch` mapping with constant lookup tables, reduced default-option allocations in props/arrow helpers, and added regression coverage in `packages/popover-core/src/__tests__/popoverCore.test.ts`.
- [x] `tooltip-core` (8.4 -> target 9.0): micro-optimize close/open mediation and shared positioning helpers.
  Done: added close fast-path to skip overlay mediation when already closed, switched close-reason mapping from `switch` to constant lookup tables, reduced default-option allocations/cached ids in props helpers, and added regression coverage in `packages/tooltip-core/src/__tests__/TooltipCore.test.ts`.
- [x] `virtualization-core` (8.7 -> target 9.0): final tuning of overscan update computations and state update allocations.
  Done: optimized axis overscan distribution with cached `(available,direction)` bucket reuse, removed sort/array allocation from bucket resolution hot path, and reduced dynamic overscan reset allocations by reusing controller state objects; added regression coverage in `packages/virtualization-core/src/__tests__/overscan.test.ts`.

## Rule of Work

- Complete exactly one item at a time.
- After each completed item: mark checkbox, leave short implementation note, stop for review.
