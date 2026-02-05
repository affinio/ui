# Vue Adapter Checklist (Affino)

Use this checklist for every `packages/*-vue` adapter.

## 1. Runtime & SSR Safety
- [ ] Safe in non-browser runtime (`typeof window/document` guards where DOM is touched).
- [ ] Works in SSR + hydration environments (Nuxt/Vite SSR) without runtime leaks.
- [ ] Lifecycle cleanup is deterministic on scope dispose / unmount.

## 2. Core Contract Consistency
- [ ] Package re-exports core primitives intentionally (no accidental API drift).
- [ ] `use*Controller` composables share a consistent contract (`state`, `dispose`, typed actions).
- [ ] Overlay manager resolution is consistent across surface packages.

## 3. Overlay Interop
- [ ] All overlay-capable adapters use `@affino/overlay-kernel` consistently.
- [ ] Scroll lock strategy is centralized and source-aware where needed.
- [ ] Outside-interaction, focus return, and stacking policies do not conflict cross-package.

## 4. Positioning & DOM Policy
- [ ] Floating primitives avoid duplicate relayout work under heavy scroll/resize.
- [ ] Positioning watchers are attached only when required.
- [ ] Teleport/host behavior is consistent and documented.

## 5. Build & Packaging Consistency
- [ ] Build pipeline is consistent (or differences are documented and justified).
- [ ] No stale `dist/__tests__` or test pollution from compiled artifacts.
- [ ] Peer/dependency strategy is consistent across Vue adapters.

## 6. Test Quality (minimum)
- [ ] API export tests.
- [ ] SSR-safety tests.
- [ ] Lifecycle cleanup/dispose tests.
- [ ] Overlay/positioning behavior tests for surface primitives.
- [ ] Cross-package interop tests for overlay stack behavior.

## 7. Performance & DX
- [ ] No avoidable duplicate work in hot paths (scroll, resize, pointer/focus guards).
- [ ] Benchmark/profiling script exists for Vue adapter hot paths.
- [ ] Public integration API is concise for app teams (minimal setup surface).
