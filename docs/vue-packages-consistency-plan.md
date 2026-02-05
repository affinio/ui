# TODO Plan: 10/10 Consistency for Affino Vue Packages

## Scope
Packages in scope:
- `packages/dialog-vue`
- `packages/menu-vue`
- `packages/popover-vue`
- `packages/tooltip-vue`
- `packages/selection-vue`
- `packages/grid-selection-vue`

Goal:
- Eliminate identified bottlenecks.
- Align all Vue adapters to one explicit contract.
- Reach 10/10 on runtime safety, interop, testability, performance, and DX.

---

## North-Star Definition (10/10)
A package is 10/10 only if all are true:
- SSR-safe and hydration-safe with deterministic cleanup.
- Unified composable contract and predictable exported API surface.
- Overlay stack + scroll lock behavior consistent across all surface adapters.
- No duplicated floating/interaction pipelines where shared utilities can be used.
- Build/test configuration is consistent and free from artifact pollution.
- Test matrix includes SSR, interop, dispose/cleanup, and regression scenarios.
- Performance baselines and budgets exist for hot paths.

---

## Phase 0: Baseline and Contract
- [x] Add shared checklist for Vue adapters (`docs/vue-adapter-checklist.md`).
- [x] Create baseline report for Vue package health (test status, build mode, interop risks).
- [x] Add synthetic benchmark script for Vue hot paths (floating relayout and controller churn).

Deliverable:
- [x] Baseline report committed to `docs/`.

---

## Phase 1: Ecosystem-Level Convergence

### 1. Unified Integration API
- [x] Introduce `@affino/vue-adapter` (or equivalent) facade for common setup.
- [x] Keep advanced APIs opt-in while default app integration remains minimal.
- [x] Ensure facade is tree-shake friendly and SSR-safe.

### 2. Overlay/Scroll Contract
- [x] Standardize overlay manager resolution in all surface adapters.
- [x] Standardize scroll lock source-key policy (through `overlay-kernel` contract).
- [x] Add cross-package regression tests: dialog + menu + popover + tooltip interplay.

### 3. Build/Test Hygiene
- [x] Stop test discovery in `dist` outputs.
- [x] Align packaging strategy and build scripts where possible.
- [x] Document justified exceptions (e.g., `menu-vue` CSS pipeline).

Deliverable:
- [x] Shared adapter contract doc + migrated package configs.

---

## Phase 2: Per-Package TODOs

## 2.1 `dialog-vue`
- [x] Prevent `dist/__tests__` from being executed by Vitest.
- [x] Expand SSR + overlay registrar tests for hydration edge paths.
- [x] Add tests for repeated mount/unmount with overlay manager reuse.

Acceptance:
- Only source tests run; no artifact duplication.
- Stable behavior under repeated SSR/client transitions.

## 2.2 `menu-vue`
- [x] Add regression tests for submenu pointer prediction under fast pointer movement.
- [x] Add interop tests with overlay stack priority and nested surfaces.
- [x] Profile/optimize positioning watchers under high-frequency relayout.

Acceptance:
- No focus/pointer regressions in nested submenu stress scenarios.
- Measurable reduction in unnecessary relayout work.

## 2.3 `popover-vue`
- [x] Extract shared floating/guard logic with `tooltip-vue` into reusable utility module.
- [x] Standardize scroll-lock strategy with ecosystem policy.
- [x] Add tests for sticky zones + outside interaction + return-focus edge cases.

Acceptance:
- Reduced code duplication and unified behavior contract.

## 2.4 `tooltip-vue`
- [x] Reuse shared floating utility (with popover).
- [x] Add tests for teleport target fallback and relayout stress.
- [x] Validate outside/pointer transitions during rapid open/close cycles.

Acceptance:
- Tooltip floating logic is consistent with popover and covered by stress tests.

## 2.5 `selection-vue`
- [x] Add SSR/no-scope tests and reactivity stress tests (high-frequency snapshots).
- [x] Add integration test with listbox-core edge selection behavior.
- [x] Validate memory safety under repeated subscribe/unsubscribe cycles.

Acceptance:
- Deterministic state bridge behavior in long-lived views.

## 2.6 `grid-selection-vue`
- [x] Expand matrix tests for range selection + anchor movement + sparse datasets.
- [x] Add performance-oriented snapshot churn test.
- [x] Align docs/contracts with `selection-vue` for parity.

Acceptance:
- Predictable behavior on large grid interaction patterns.

---

## Phase 3: Testing Upgrade (Mandatory for 10/10)

## 3.1 Test Coverage Targets
- [x] Each package must include:
  - [x] API export tests.
  - [x] SSR safety tests.
  - [x] Lifecycle cleanup/dispose tests.
  - [x] Hot-path behavior regression tests.
- [x] Add cross-package Vue interop suite for overlay-capable adapters.

## 3.2 Regression Matrix
- [x] No duplicate test execution from `dist` artifacts.
- [x] Repeated mount/unmount cycles leave no leaked listeners/observers.
- [x] Nested overlay scenarios preserve correct top-layer/focus behavior.
- [x] Scroll/resize storms do not cause unnecessary relayout loops.

Deliverable:
- [x] CI-required Vue matrix with package + interop jobs.

---

## Phase 4: Performance Hardening
- [x] Add instrumentation toggles for floating relayout counters (dev-only).
- [x] Add benchmark budget assertions for Vue surface adapters.
- [x] Track pre/post optimization reports in docs.

Deliverable:
- [x] `docs/vue-post-optimization-report.md` with budget pass status.

---

## Definition of Done (Ecosystem 10/10)
- [x] All 6 Vue packages follow the same adapter contract.
- [x] All bottlenecks from audit are resolved or justified/documented.
- [x] No package below 10/10 by checklist scoring.
- [x] Cross-package interop suite is green.
- [x] Docs cover architecture + extension + performance budgets.

---

## Suggested Execution Order
1. `dialog-vue` (test/artifact hygiene)
2. `popover-vue` + `tooltip-vue` (shared floating refactor)
3. `menu-vue` (interop + perf)
4. `selection-vue`
5. `grid-selection-vue`
6. Ecosystem interop/perf/reporting

Reason:
- Remove highest-risk structural issues first (test pollution + duplicated floating pipeline).
- Then converge interop/performance with measurable budgets.
