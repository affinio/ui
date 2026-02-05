# @affino/tooltip-laravel

## 0.1.0

### Minor Changes

Release summary:

This release advances the Affino ecosystem to a broader, production-focused minor across core primitives and framework adapters.

Core Primitives:
- Added first-class `tabs` and `disclosure` primitives (`@affino/tabs-core`, `@affino/disclosure-core`) with framework-aligned state contracts and controller lifecycles.
- Continued consistency work across overlay-related cores (`dialog`, `menu`, `popover`, `tooltip`, `surface`) to keep semantics aligned for open/close, focus, outside interaction, and stacking.
- Improved cross-primitive interoperability through `@affino/overlay-kernel` integration patterns and clearer ownership/stack behavior.

Laravel Ecosystem:
- Added and integrated `tabs-laravel` and `disclosure-laravel` packages.
- Expanded `@affino/laravel-adapter` into the canonical runtime entrypoint for all Laravel primitives, including manual control events for tabs/disclosure.
- Strengthened hydration behavior and idempotent bootstrap patterns for Livewire and non-Livewire environments.
- Refined structure-gated rehydrate behavior and observer contracts to reduce unnecessary re-hydration under morph/update pressure.

Vue Ecosystem:
- Added and integrated `tabs-vue` and `disclosure-vue` packages.
- Continued alignment of Vue surface adapters (`dialog`, `menu`, `popover`, `tooltip`) around shared overlay host/kernel behavior.
- Improved `@affino/vue-adapter` as the app-level runtime facade for overlay bootstrap and diagnostics exposure.

Tooling, Quality, and Performance:
- Added/expanded benchmark assertions for Laravel and Vue adapter layers to enforce directional performance budgets in CI.
- Improved synthetic benchmark stability and measurement methodology to reduce one-off timing noise in budget checks.
- Expanded test coverage and integration checks across adapters and newly added primitives.
- Upgraded CI workflow structure: separated verify, performance assertions, docs/storybook builds, e2e, and changeset status checks.

Documentation and Developer Experience:
- Refreshed `docs-site` architecture and navigation for current package topology, including adapter pages and tabs/disclosure sections.
- Standardized core reference pages for consistency (overview, install, quick start, API, related packages, stability marker).
- Expanded Storybook coverage in `visual-workbench` with dedicated stories and controls for overlay and primitive adapters.

Notes for Consumers:
- This is a **minor** release across packages: new capabilities are introduced while preserving existing public contracts.
- Consumers should still review package-specific changelogs for integration details and adapter-specific behavior notes.

### Patch Changes

- Updated dependencies
  - @affino/overlay-kernel@0.2.0
  - @affino/tooltip-core@1.1.0
