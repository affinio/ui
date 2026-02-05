# Laravel Adapter Checklist (Affino)

Use this checklist for every `packages/*-laravel` adapter.

## 1. Bootstrap
- [ ] Guard for non-browser runtime: `if (typeof document === "undefined") return`.
- [ ] Bootstrap is idempotent (repeated calls do not duplicate global listeners/observers).
- [ ] Bootstrap order is consistent: `scan(document)` -> `setupMutationObserver()` -> `setupLivewireHooks(...)`.

## 2. Hydration and Cleanup
- [ ] `hydrate*` starts with teardown of existing instance for the same root.
- [ ] Cleanup removes all event listeners and observers.
- [ ] Cleanup releases overlay/scroll/focus resources.
- [ ] Removed/disconnected roots are cleaned up deterministically.

## 3. Mutation Observer Policy
- [ ] Observer scope is minimal (`childList + subtree` by default).
- [ ] `characterData` is disabled unless explicitly justified.
- [ ] Rehydrate is gated by structure checks (key nodes/options changed).
- [ ] Text-only updates do not trigger full rehydrate.

## 4. Livewire Integration
- [ ] Works without Livewire present (no runtime errors).
- [ ] Late Livewire load is supported (`livewire:load` retry pattern or equivalent).
- [ ] Livewire hooks are deduplicated and never rebound twice.
- [ ] `livewire:navigated` behavior is explicit (scan/restart observer/cleanup).

## 5. Overlay and Scroll Lock
- [ ] Overlay stack interactions go through `@affino/overlay-kernel`.
- [ ] Scroll lock uses centralized kernel API with source key.
- [ ] Multiple overlay types interoperate without premature unlock.

## 6. Performance
- [ ] Avoid O(n*m) root scans in hot observer paths where possible.
- [ ] Avoid unnecessary `querySelectorAll` in tight loops; cache or gate updates.
- [ ] Relayout listeners are attached only when surface is open.

## 7. Module Structure
- [ ] Entry `index.ts` is thin (bootstrap/exports only).
- [ ] Core concerns are split (types, hydrate, livewire, options, registry, dom/guards).
- [ ] No debug globals in production runtime.

## 8. Tests (minimum)
- [ ] Public API exports.
- [ ] Non-Livewire runtime test.
- [ ] Idempotent hydrate.
- [ ] Mutation observer + structure-gated rehydrate.
- [ ] Livewire integration (late load + navigation).
- [ ] Cleanup/disconnect regression test.
