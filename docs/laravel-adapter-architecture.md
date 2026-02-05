# Laravel Adapter Architecture and Extension Rules

Date: 2026-02-05

## Contract
All `packages/*-laravel` adapters follow a single lifecycle contract:
1. Guard non-browser runtime (`typeof document/window`).
2. `scan(document)`.
3. `setupMutationObserver()`.
4. `setupLivewireHooks(...)`.

## Observer Rules
- Observer defaults are `childList + subtree`.
- No `characterData` unless explicitly justified by tests.
- Rehydrate is structure-gated (key node identity / option count).
- Removed-node cleanup is deterministic (teardown on disconnect).

## Livewire Rules
- Must work with no Livewire present.
- Must support delayed Livewire attach via `livewire:load` retry strategy.
- Must dedupe bindings via global key guards.
- `livewire:navigated` behavior must be explicit and tested.

## Overlay Rules
- Overlay interactions and scroll lock go through `@affino/overlay-kernel`.
- Locking uses per-source keys (`dialog`, `menu`, `popover`, etc.).
- Interop between overlay types is regression-tested.

## Module Structure
- Thin entrypoint `index.ts` (exports + bootstrap).
- Split concerns under feature folder:
  - `types.ts`
  - `hydrate.ts`
  - `livewire.ts`
  - optional `registry.ts` / `guards.ts` / `options.ts` / `dom.ts`

## Extension Checklist
When adding a new Laravel adapter:
- Copy the contract from an existing 10/10 adapter.
- Implement structure-gated rehydrate before adding advanced behavior.
- Add tests for:
  - API exposure
  - non-Livewire runtime
  - idempotent hydrate
  - mutation/structure gating
  - late-load + navigation Livewire
  - cleanup/disconnect
- Validate perf with `pnpm run bench:laravel-morph:assert`.
