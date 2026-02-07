# @affino/overlay-kernel

Shared overlay interaction kernel that coordinates stacking, focus, pointer, and scroll policies across Affino primitives.

## Installation

```bash
pnpm add @affino/overlay-kernel
```

## What it provides

- Overlay manager with deterministic stack ordering.
- Close/open request routing (`escape`, pointer outside, owner-close, programmatic).
- Ownership model for nested overlays (`ownerId`).
- Focus/scroll policy metadata per overlay entry.
- Livewire/DOM observer helpers used by adapter runtimes.

## Core API (high-level)

- `createOverlayManager()`
- `getDocumentOverlayManager(document)`
- `createOverlayIntegration(...)`
- `bindLivewireHooks(...)`
- `ensureDocumentObserver(...)`
- `registerDocumentScrollLock(...)` / `releaseDocumentScrollLock(...)`

## Guardrails

- Keep one overlay manager per document scope.
- Use stable overlay ids.
- Ensure `destroy()` is called for every integration on teardown.
- Route close reasons through the manager for consistent stack behavior.

## Related packages

- `@affino/surface-core`
- `@affino/overlay-host`
- `@affino/dialog-core`
- `@affino/menu-core`
