# Vue Adapter Architecture (Affino)

Date: 2026-02-05

## Goal
Define a single integration contract for all `*-vue` adapters built on Affino core primitives.

## Public Integration Surface
Default app-level integration should be minimal:
- `@affino/vue-adapter` provides a facade for shared setup.
- Consumers can use either:
  - `createAffinoVueAdapter(...)` for direct runtime access.
  - `createAffinoVuePlugin(...)` for Vue plugin style integration.

### SSR Safety Contract
- No unconditional DOM access at module scope.
- `document` is always resolved lazily.
- If no `document` is available, adapter functions return safe no-op behavior.

## Overlay Contract
- Overlay hosts are provisioned centrally through `@affino/vue-adapter`.
- Overlay stack subscription is exposed as a single utility.
- Debug exposure to `window` is opt-in (`exposeManagerOnWindow`).
- Non-overlay primitives (for example `tabs` and `disclosure`) are intentionally out of scope for adapter bootstrap and are consumed through their own Vue packages.

## Build/Test Contract
- Shared Vitest config must exclude `dist/**` by default to avoid duplicate test runs.
- Package-specific build differences are allowed only when justified:
  - `menu-vue`: uses `vite + vue-tsc` because it ships Vue SFCs + CSS bundle.
  - Other Vue adapter packages may keep `tsc` / `tsup` when no SFC build pipeline is required.
- Any exception must be documented in this file or package README.

## Phase 1 Migration Notes
- Added `@affino/vue-adapter` package as ecosystem facade.
- Demo Vue overlay utility now delegates to `@affino/vue-adapter`.
- Shared Vitest baseline now excludes `dist/**` to prevent artifact test pollution.

## Status
- Shared floating surface utilities are now centralized via `@affino/overlay-host`.
- Cross-package interop is covered by `packages/vue-adapter/src/__tests__/overlayInterop.test.ts`.
- Vue benchmark budgets are enforced through `bench:vue-adapters:assert`.
- Post-optimization baseline delta is tracked in `docs/vue-post-optimization-report.md`.
- `@affino/vue-adapter` now exposes an idempotent bootstrap contract (`bootstrapAffinoVueAdapters`) and optional diagnostics runtime for production-grade host integration parity.
