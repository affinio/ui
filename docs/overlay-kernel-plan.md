# Overlay Interaction Kernel Plan

## Guiding principles
- Overlay is an interaction context, not an isolated widget; stacking, focus, pointer, and scroll behaviors must be orchestrated globally.
- Each primitive (dialog, tooltip, popover, combobox, etc.) declares capabilities/needs and delegates policy decisions to the kernel.
- No cross-overlay heuristics or timers owned by individual primitives; the kernel owns stacking order, guards, and close orchestration.

## Current constraints
1. Dialogs already expose `OverlayRegistrar` and focus orchestration, but live in isolation inside `packages/dialog-*`.
2. Tooltips/popovers manage their own global state (`activeTooltipRoot`, `activePopoverRoot`) and pointer guards.
3. Livewire/Vue demos rely on DOM scanning auto-hydration, so the kernel must support DOM-registered overlays (no framework-specific singletons).
4. Playwright and Vitest suites must continue to run headless; kernel needs SSR guards similar to existing packages.

## Step-by-step implementation

### Phase 0 — Inventory + abstraction boundary
- [ ] Document the minimal life-cycle hooks each primitive already uses (open/close, requestClose, focus restore, pointer guards).
- [ ] Decide on the lowest common denominator we can depend on across packages: vanilla DOM + controller APIs (no framework coupling).

### Phase 1 — Define kernel contract
- [ ] Create `packages/overlay-kernel` (or extend `overlay-host`) exporting:
  - `OverlayManager` singleton (configurable per document) with `register`, `unregister`, `requestOpen`, `requestClose`.
  - `OverlayEntry` type describing `id`, `kind`, `root`, `modal`, `trapsFocus`, `blocksPointerOutside`, `priority`, `closeStrategies`, `owner` (parent overlay ID).
  - Events/callbacks for `onStackChanged`, `onTopMostChanged`, `onPointerIntent`, `onFocusIntent`.
- [ ] Provide environment guards so packages can import safely both in browser and SSR/test contexts.

### Phase 2 — Shared guard services
- [ ] Move global keydown, pointerdown/outside-click, scroll-lock, and focus-trap helpers behind the kernel.
- [ ] Kernel tracks `activeStack: OverlayEntry[]`, activates guards (keydown, pointer, scroll) only when needed, and notifies registered overlays whether they may receive events.
- [ ] Implement pointer mediation: only the top-most pointer-blocking overlay receives outside-click, and subordinate overlays ask kernel before closing.

### Phase 3 — Dialog integration (pilot client)
- [ ] Refactor dialog controller (`packages/dialog-core` + Laravel/Vue adapters) to register overlays with the kernel instead of the local registrar.
- [ ] Map existing dialog snapshots to `OverlayEntry` fields (modal, trapsFocus, lockScroll, etc.).
- [ ] Ensure manual bridge (`affino-dialog:manual`) now enqueues operations through the kernel so nested overlays remain consistent.
- [ ] Update Livewire/Vue bootstrap scripts to initialize the kernel once per document and inject it into dialog hydration.
- [ ] Add regression tests (unit + e2e) covering stacked dialogs and pinned modal interactions.

### Phase 4 — Tooltip + popover integration
- [ ] Replace `activeTooltipRoot`/`activePopoverRoot` singletons with kernel registration; tooltips become lightweight clients asking the kernel whether they may remain open.
- [ ] When focus/pointer leaves the triggering context, tooltips call `OverlayManager.requestClose` with a reason; the kernel decides based on stack state.
- [ ] Ensure tooltips inherit dialog-owned scroll lock and guard state (no direct document listeners).
- [ ] Update demos to remove tooltip-specific mutation observers if the kernel can rescan.

### Phase 5 — Combobox/listbox & surface primitives
- [ ] Identify combobox/listbox overlays (dropdown surfaces) and migrate them to the kernel so pointer/focus mediation matches dialogs/tooltips.
- [ ] Implement owner-child relationships for overlays (e.g., tooltip owned by dialog content) to permit closing a subtree without affecting ancestors.
- [ ] Align focus restoration: kernel tracks `focusReturnTargets` and delegates to owning overlay on close.

### Phase 6 — Policy consolidation + cleanup
- [ ] Delete redundant global state (`focusedTooltipIds`, `pinnedOpenRegistry`, `activePopoverRoot`, etc.) now modeled inside the kernel.
- [ ] Coalesce guard utilities (pointer intent windows, focus sentinels) into kernel-provided helpers re-used by clients.
- [ ] Ensure TypeScript configs map `@affino/overlay-kernel` path; update build + lint configs.
- [ ] Expand Playwright coverage for mixed overlay scenarios (dialog + tooltip + combobox) to validate the stack model.

### Phase 7 — Documentation + migration notes
- [ ] Author developer guide describing the kernel contract and how primitives integrate.
- [ ] Provide upgrade instructions for downstream consumers (if any) who instantiate overlays manually.
- [ ] Record testing strategy (unit, integration, e2e) and rollout plan (feature flag vs. direct replacement).

## Immediate next actions
1. Perform Phase 0 inventory focusing on dialog + tooltip codepaths currently running in the failing Livewire focus lab scenario.
2. Begin Phase 1 by scaffolding `packages/overlay-kernel` with type definitions and a no-op manager so clients can start wiring against the new API incrementally.

## Phase 0 findings (focus lab scenario)
- Dialogs already centralize async guards, focus orchestration, and overlay registration inside [packages/dialog-core/src/dialogController.ts](packages/dialog-core/src/dialogController.ts), but the registrar they talk to (`overlayBindings` in the Laravel adapter) is local to dialogs and carries its own global keydown + scroll-lock policies.
- Tooltips ship their own universe in [demo-laravel/resources/vendor/tooltip-laravel/js/index.ts](demo-laravel/resources/vendor/tooltip-laravel/js/index.ts): they track `activeTooltipRoot`, pointer intent windows, focus restorers, and global mutation observers without any awareness of dialog stack state.
- Because both systems subscribe directly to document-level pointer/focus events, the Livewire focus lab ends up with three competing “top-most” notions (dialog overlay registrar, tooltip focus tracker, combobox dropdown), confirming we need the shared kernel to own those responsibilities.
