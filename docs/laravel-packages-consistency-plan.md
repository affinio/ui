# TODO Plan: 10/10 Consistency for Affino Laravel Packages

## Scope
Packages in scope:
- `packages/dialog-laravel`
- `packages/menu-laravel`
- `packages/popover-laravel`
- `packages/combobox-laravel`
- `packages/listbox-laravel`
- `packages/tooltip-laravel`

Goal:
- Eliminate identified bottlenecks.
- Bring all packages to a single, predictable adapter contract.
- Reach 10/10 on idempotency, performance, maintainability, testability, and integration reliability.

---

## North-Star Definition (10/10)
A package is 10/10 only if all are true:
- Bootstrap is safe in non-browser contexts (`typeof document/window` guards everywhere needed).
- Package works fully without Livewire present (Livewire is optional, no runtime errors, degraded behavior is documented).
- Hydration is idempotent and structure-aware (no unnecessary rehydrate on text-only updates).
- Mutation observer policy is minimal and consistent (no `characterData: true` unless justified).
- Livewire binding is resilient (late-load safe, no duplicate hooks, clear unbind/rebind strategy on navigation).
- Overlay interactions are centralized via `@affino/overlay-kernel` where applicable.
- Cleanup is deterministic for removed/disconnected nodes.
- File/module structure is consistent across packages.
- Tests cover behavior (not only public API shape), including regression tests for bottlenecks.

---

## Phase 0: Baseline and Guardrails
- [x] Create a shared checklist document in repo for adapter rules (bootstrap, observer, livewire, cleanup, tests).
- [x] Add temporary benchmark script for mutation-heavy scenarios (Livewire morph simulation).
- [x] Capture baseline metrics:
  - [x] rehydrate count per package under repeated DOM updates.
  - [x] average bootstrap cost.
  - [x] open/close latency for each primitive.

Deliverable:
- [x] Baseline report committed to `docs/`.

---

## Phase 1: Unified Adapter Contract (Cross-Package)

### 1. Bootstrap Consistency
- [x] Ensure every package has the same bootstrap pattern:
  - `if (typeof document === "undefined") return`
  - `scan(document)`
  - `setupMutationObserver()`
  - `setupLivewireHooks(...)`
- [x] Ensure all packages tolerate delayed Livewire load.

### 2. Observer Consistency
- [x] Standardize observer defaults to:
  - `childList: true`
  - `subtree: true`
  - no `characterData` by default
- [x] Introduce shared helper for observer setup to avoid drift.

### 3. Structure-Aware Rehydrate
- [x] Introduce shared structural diff helper:
  - compare key nodes (trigger/surface/content)
  - compare option-count or keyed identity where relevant (listbox/combobox/menu)
- [x] Only rehydrate when structure actually changed.

### 4. Livewire Contract
- [x] Standardize hooks/events matrix (`morph.added`, `message.processed`, `livewire:navigated`, etc.).
- [x] Standardize late-load retry strategy (`livewire:load`).
- [x] Standardize navigation behavior (observer disconnect/restart if needed).
- [x] Ensure explicit non-Livewire path in every package (no-op hooks + identical core behavior where possible).

### 5. Overlay and Scroll Lock Policy
- [x] Use centralized `overlay-kernel` lock API everywhere lock is relevant.
- [x] Ensure source-key usage per primitive (`dialog`, `popover`, `menu`, etc.).
- [x] Add regression tests for multi-overlay lock scenarios.

Deliverable:
- `adapter-contract` utilities module + package migrations.

---

## Phase 2: Per-Package TODOs

## 2.1 `tooltip-laravel` (highest priority)
- [ ] Split monolith into modules (like menu/dialog/popover style):
  - `tooltip/types.ts`
  - `tooltip/registry.ts`
  - `tooltip/hydrate.ts`
  - `tooltip/livewire.ts`
  - `tooltip/guards.ts`
  - `tooltip/options.ts`
- [ ] Remove/guard debug globals on `window` (`__affino*`) behind explicit dev flag or remove entirely.
- [ ] Remove `characterData: true` unless hard requirement is documented and tested.
- [ ] Add structure-aware `maybeHydrateTooltip` gate.
- [ ] Minimize global pointer/focus guard overhead and ensure proper cleanup.
- [ ] Add deterministic focus restore tests around Livewire morph.

Acceptance:
- No unnecessary tooltip rehydrate on text-only changes.
- No global debug leakage in production runtime.

## 2.2 `listbox-laravel`
- [ ] Add structure gate before `hydrateListbox(root)` from structure observer.
- [ ] Add explicit bootstrap browser guard.
- [ ] Align livewire strategy with shared contract.
- [ ] Reduce repeated full `collectOptions` cost where possible.

Acceptance:
- Rehydrate only on relevant structure change.
- Stable behavior under rapid option list updates.

## 2.3 `combobox-laravel`
- [ ] Modularize monolith into subfiles (same style as menu/popover).
- [ ] Add explicit bootstrap browser guard.
- [ ] Replace ad-hoc observer/livewire bits with shared helpers.
- [ ] Cache invalidation rules for option collection documented and tested.

Acceptance:
- Maintains current behavior with lower complexity and clearer ownership.

## 2.4 `popover-laravel`
- [ ] Add explicit bootstrap browser guard in `index.ts`.
- [ ] Add behavior tests (not only API export tests):
  - [ ] idempotent hydrate
  - [ ] structure-gated rehydrate
  - [ ] lock interop with dialog/menu
- [ ] Align livewire late-load behavior with shared contract.

Acceptance:
- No regressions after modularization.

## 2.5 `menu-laravel`
- [ ] Add structural no-op path so unchanged roots are not fully re-instantiated on refresh.
- [ ] Profile `mutationTouchesMenu` for large registries and optimize root intersection checks.
- [ ] Add tests for portal + refresh + livewire navigation interactions.

Acceptance:
- Lower re-instantiation frequency under heavy DOM churn.

## 2.6 `dialog-laravel`
- [ ] Align Livewire late-load behavior with contract (currently no retry if Livewire is absent at bootstrap).
- [ ] Move remaining custom global guard logic to shared utilities where possible.
- [ ] Add tests for removed-node cleanup and teleport edge cases.

Acceptance:
- Fully resilient livewire attach lifecycle.

---

## Phase 3: Testing Upgrade (Mandatory for 10/10)

## 3.1 Test Coverage Targets
- [ ] Each package must have:
  - [ ] API exposure tests
  - [ ] non-Livewire runtime tests (no `window.Livewire`)
  - [ ] idempotent hydrate tests
  - [ ] mutation observer/re-hydrate tests
  - [ ] livewire integration tests (late load + navigation)
  - [ ] cleanup/disconnect tests
- [ ] Add cross-package integration tests for overlay lock interactions.

## 3.2 Regression Matrix
- [ ] text-only mutations do not trigger unnecessary rehydrate.
- [ ] structural change triggers exactly one rehydrate.
- [ ] repeated bootstrap calls do not duplicate global hooks/listeners.
- [ ] multiple overlays keep scroll lock stable until all release.

Deliverable:
- CI-required test matrix for all `*-laravel` packages.

---

## Phase 4: Performance Hardening
- [ ] Add lightweight instrumentation toggles (dev-only): rehydrate counters and observer events.
- [ ] Add perf budget assertions in tests for synthetic mutation runs.
- [ ] Optimize hot paths identified by baseline diff.

Deliverable:
- Post-optimization report showing measurable improvements vs Phase 0.

---

## Definition of Done (Ecosystem 10/10)
- [ ] All 6 Laravel packages follow same adapter contract.
- [ ] All bottlenecks from audit resolved or documented with justified exceptions.
- [ ] No package below 10/10 by checklist scoring.
- [ ] Cross-package integration tests green.
- [ ] Docs updated with architecture and extension rules.

---

## Suggested Execution Order
1. `tooltip-laravel`
2. `listbox-laravel`
3. `combobox-laravel`
4. `popover-laravel`
5. `menu-laravel`
6. `dialog-laravel`
7. Cross-package tests + performance hardening

Reason:
- Start with highest complexity/risk modules and observer-heavy packages first.
- Finish with convergence and contract-level validation.
