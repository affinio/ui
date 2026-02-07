# Overengineering / UX Max Pipeline

Baseline audit date: `2026-02-07`  
Goal: raise every component to `>= 9.0` on developer UX quality.

Scoring dimensions:
- API clarity and consistency
- setup friction
- workaround debt
- runtime predictability
- docs completeness
- failure transparency
- customization ergonomics

## Rule of execution

- Close exactly one item at a time (worst score first).
- After each item: mark checkbox, add short done note, stop for review.
- Target state for each item: `>= 9.0`.

## Ordered TODO (Worst -> Best)

- [x] `menu-laravel` (`3.8 -> 9.0`): done (`2026-02-07`) - fixed DOM-close deadlock when focus stayed on trigger, enforced a11y-safe close sequencing (`focus handoff -> aria-hidden/hidden + inert`) to avoid hidden-focus traps, added regression coverage for close-sync/inert behavior, and replaced placeholder README with full API/markup/config contract.
- [x] `combobox-laravel` (`4.2 -> 9.1`): done (`2026-02-07`) - removed focus-steal on outside close, stabilized a11y close sequence (`aria-hidden` + `inert` + pre-hide focus handoff), scoped option collection to surface, removed false-negative structural rehydrate gate, and locked behavior with new integration regressions.
- [x] `listbox-laravel` (`4.4 -> 9.1`): done (`2026-02-07`) - replaced fallback close chain with deterministic single close path, removed focus-steal on outside close, scoped option cardinality checks/collection to the listbox surface, gated global scans to listbox-containing mutations only, and locked behavior with integration regressions.
- [x] `popover-laravel` (`4.8 -> 9.1`): done (`2026-02-07`) - removed outside-close focus steal, switched guard listeners to owner-document scope, gated scan/livewire hooks to popover-related nodes only, unified open-state persistence contract for pinned/manual/modal + state-sync-off flows, and locked behavior with regression tests.
- [x] `tooltip-laravel` (`5.1 -> 9.0`): done (`2026-02-07`) - reduced focus-restore indirection with stricter tracked-focus release/restore guards (no external focus steal), reduced observer fan-out by gating livewire + scan scheduling to tooltip-containing scopes only, and locked behavior with regression tests.
- [x] `dialog-laravel` (`5.4 -> 9.0`): done (`2026-02-07`) - reduced morph/observer orchestration fan-out by batching + root-gating scans/cleanups, narrowed Livewire rescans to dialog-containing scopes with safe fallback for missing component scope payloads, and locked behavior with regression tests.
- [x] `laravel-adapter` (`5.8 -> 9.0`): done (`2026-02-07`) - removed internal `bindLivewireActionBridge` from public exports, added API-surface/idempotency runtime tests, and unified Laravel package setup docs around `bootstrapAffinoLaravelAdapters` (dropped duplicate per-package manual bridge recipes across dialog/listbox/combobox/popover/tooltip).
- [x] `menu-core` (`6.6 -> 9.0`): done (`2026-02-07`) - replaced overextended README with contract-first API reference (MenuCore/SubmenuCore/createMenuTree), aligned docs-site around a single adapter flow, added explicit guardrails to prevent item-id lifecycle leaks/duplicate state ownership, and documented strict submenu parent-item failure contract (`createSubmenu` throws for unregistered `parentItemId`).
- [x] `dialog-core` (`6.8 -> 9.0`): done (`2026-02-07`) - added standard modal profile helpers (`createStandardModalDialogOptions` / `createStandardModalDialogController`) with safe defaults, added explicit `canHandleClose(reason?)` preflight API (removing docs/runtime mismatch), and split docs between baseline profile and advanced matrix/kernel orchestration.
- [x] `tabs-core` (`7.0 -> 9.1`): done (`2026-02-07`) - replaced scaffold README/docs with full API contract, behavioral guarantees, and concrete Vue/Laravel adapter usage (including manual `affino-tabs:manual` flows), then hardened runtime immutability by returning frozen snapshots from `getSnapshot()` with regression tests.
- [x] `disclosure-core` (`7.2 -> 9.1`): done (`2026-02-07`) - replaced scaffold README/docs with full API contract + Vue/Laravel integration examples, tightened runtime predictability (`isOpen`, duplicate open/close no-op guarantees), and hardened snapshot contract to runtime-frozen immutable objects with stable references across no-op calls.
- [x] `treeview-core` (`7.2 -> 9.1`): done (`2026-02-07`) - added deterministic result-returning `request*` API for focus/select/expand flows (with typed failure reasons), kept legacy methods as compatibility wrappers, and hardened snapshot contract to runtime-frozen immutable output (including frozen `expanded`) with stable references across no-op/failure requests.
- [x] `surface-core` (`8.2 -> 9.1`): done (`2026-02-07`) - rewrote core/docs-site reference with explicit timing semantics (`open/close/toggle` immediate, delays only via schedulers/hooks), standardized `SurfaceReason` mapping guidance, and hardened runtime snapshot contract to frozen immutable output with stable references across no-op transitions (regression-locked).
- [x] `listbox-core` (`8.3 -> 9.0`): done (`2026-02-07`) - added explicit adapter contract in package/docs-site (context invariants, state ownership rules, DOM/event mapping, anti-patterns) to reduce wrapper misuse and ad-hoc workaround logic.
- [x] `combobox-core` (`8.4 -> 9.0`): done (`2026-02-07`) - documented explicit filter lifecycle and adapter boundaries in package/docs-site (filtered-context contract, responsibility split, anti-patterns), and added reducer regression test to lock `open`/`filter` transition isolation.
- [x] `virtualization-core` (`8.5 -> 9.0`): done (`2026-02-07`) - added end-to-end adapter scroll recipe and guardrails in package/docs-site (state-reference semantics, purity boundaries, range/count contracts), plus axis virtualizer regression test locking state-reference reuse behavior.
- [x] `grid-selection-core` (`8.7 -> 9.0`): done (`2026-02-07`) - added facade-first table integration docs in package/docs-site (click/shift/cmd-ctrl/row/clear handler patterns), expanded operation surface references, and documented guardrails to prevent direct range mutation and context drift.
- [x] `selection-core` (`8.8 -> 9.0`): done (`2026-02-07`) - added explicit migration playbook and package-boundary guidance in package/docs-site, documented linear usage guardrails and anti-misuse rules, and added compatibility regression test proving grid API re-export remains stable during migration.
