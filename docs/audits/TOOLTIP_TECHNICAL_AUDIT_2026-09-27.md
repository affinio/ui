# Tooltip packages: technical audit

**Date:** 2026-09-27
**Scope:** `@affino/tooltip-core`, `@affino/tooltip-vue`, `@affino/tooltip-laravel` (Livewire browser adapter).
**Method:** static review of implementation, public documentation, package metadata, and existing focused tests. Runtime tests, browser/assistive-technology checks, and performance measurements were not run.

## Assessment

The shared core is a sensible small state/timer layer, but the tooltip product is not yet at a “works like clockwork” reliability level. Most material risks sit in the browser adapters: document-global listeners retain the first bootstrap's callbacks and are only installed against the ambient `document`/`window`; Laravel positioning misses some geometry changes and its close/focus semantics need stronger contract coverage; Vue positioning awaits a tick and then uses captured element references without checking that the component is still live. There are also accessibility/API mismatches in the Laravel markup and Vue/Core descriptions.

**Overall:** Core — good foundation, needs edge-case hardening; Vue — usable, with lifecycle/positioning race risk; Laravel — explicitly experimental and should not be represented as production-reliable yet. No evidence of a core timer/state defect was found in the reviewed tests, but the present tests do not establish full cross-adapter reliability.

## Findings

### High

1. **Laravel global event guards are singletons bound to whichever bootstrap runs first.** `pointerGuardsBound` and `pointerIntentBound` prevent subsequent setup, while the installed closures retain the first call's options. Listeners are attached to global `document`/`window`, not the tooltip root's `ownerDocument` ([guards.ts](../../packages/tooltip-laravel/resources/js/tooltip/guards.ts#L26), [hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L748)). This makes ownership and teardown unclear, and breaks or misroutes events for iframes, multiple documents, or repeated bootstrap with differing callbacks. The existing per-document active-root map does not make the event listeners per-document.

   **Recommendation:** make guard ownership explicitly per `Document` (e.g. a `WeakMap<Document, controller>`), install against that document's `defaultView`, and provide idempotent setup/teardown with stable callbacks. Cover multiple documents and repeated bootstrap.

2. **Laravel auto-close pointer guard can close a tooltip while moving from trigger to floating surface.** The guard treats only descendants of the root as inside ([guards.ts](../../packages/tooltip-laravel/resources/js/tooltip/guards.ts#L61)). The supplied Blade view places the surface under the root today, but consumers can teleport/move content, and the documented API does not establish that containment as a required invariant. The guard also keys close ownership globally by one active tooltip per document, while persistent/manual handling is applied as an exception after identifying the active root ([hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L578)). Define the interaction boundary explicitly and test pointer transit across its edges, including delayed close and pinned/manual cases.

### Medium

3. **Laravel position updates do not cover all geometry changes.** The adapter measures on open and observes trigger size only ([hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L82), [hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L268)). It does not subscribe to scroll/viewport resize here, and a tooltip surface content resize will not cause a `ResizeObserver` callback. A trigger moving without resizing (ancestor scroll/layout shift) or content changing while open can leave the bubble stale or clipped. The Vue adapter does wire relayout on scroll/resize through the shared overlay-host helper, so these adapters currently have different positioning guarantees.

   **Recommendation:** use one bounded, frame-coalesced relayout contract for relevant scroll ancestors, viewport resize, trigger resize, and surface resize; ensure all listeners/observers are torn down. Test nested scroll containers, content growth, and close during a queued frame.

4. **Vue floating update has a stale-reference/unmount race.** `updatePosition()` checks refs and open state, awaits `nextTick()`, then dereferences the same refs without rechecking them ([useFloatingTooltip.ts](../../packages/tooltip-vue/src/useFloatingTooltip.ts#L51)). A close/unmount or ref replacement during that await can measure a detached node or throw. Queued rAF callbacks from relayout likewise have no cancellation token and may run after deactivation/unmount. Existing tests exercise repeated open/close and event cleanup, but do not unmount or replace refs between the await and measurement.

   **Recommendation:** after `nextTick`, re-read and validate refs/state; invalidate pending work on close/dispose and guard scheduled rAF callbacks. Test immediate open-close-unmount and ref replacement.

5. **Core does not fully honor focus-within semantics for nested focus targets.** `getTriggerProps()` sets `focusWithin=false` on any blur from the trigger, then requests keyboard close ([TooltipCore.ts](../../packages/tooltip-core/src/core/TooltipCore.ts#L102)). When focus moves between descendants of a composite trigger, a blur/focusout can close the tooltip despite focus remaining inside; the Laravel adapter adds explicit root-level focus restoration logic, but core's public handler contract lacks related-target containment logic. Current core tests cover one focus/blur pair only.

   **Recommendation:** make focus transition semantics explicit (related target / adapter focusin-focusout ownership), and verify focus movement inside a composite trigger and between trigger and tooltip.

6. **Laravel generated trigger wrapper can undermine focusability and ARIA semantics.** The Blade template always wraps the trigger slot in a plain `<div data-affino-tooltip-trigger>` ([tooltip.blade.php](../../packages/tooltip-laravel/resources/views/livewire/tooltip.blade.php#L20)). The JS derives a tab index but only preserves or adds one if the wrapper already has one ([hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L117)); focus listeners are bound to the wrapper. A naturally focusable button nested inside will bubble focus events, but `aria-describedby` is attached to the wrapper instead of the actual control, and a plain non-focusable trigger is not keyboard reachable. This weakens the package's accessibility claims.

   **Recommendation:** bind to the actual trigger element, or expose a clear contract requiring a focusable trigger node and place ARIA on that node. Add rendered Blade/Livewire accessibility tests for button, input, and non-focusable custom trigger.

7. **Description/live-region helper conflates tooltip description and announcement semantics.** Core's trigger always describes the tooltip content id, while `getDescriptionProps()` defaults to `role="status"` and `aria-live="polite"` ([TooltipCore.ts](../../packages/tooltip-core/src/core/TooltipCore.ts#L85), [TooltipCore.ts](../../packages/tooltip-core/src/core/TooltipCore.ts#L145)). The ordinary tooltip surface correctly has `role="tooltip"`. A live region is a separate semantic pattern; tying the separate status node to open/closed with `aria-hidden` risks duplicate or absent announcements depending on mounting and assistive technology behavior. The API/docs invite use of both mechanisms without an interoperability contract.

   **Recommendation:** document and test tooltip semantics separately from status/error announcements; review the default `aria-describedby` target and live-region state behavior against actual screen readers before treating this helper as a supported accessibility primitive.

8. **Laravel exposes modes/behavior that tests and implementation do not fully specify.** README says close restores focus; implementation only restores tracked focus for focus-mode trigger behavior and only under a set of conditions ([README.md](../../packages/tooltip-laravel/README.md), [hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L313)). README also describes hover/click/manual profiles and a single auto-managed open tooltip, while tests currently concentrate on click/bootstrap and a few hover/focus/morph cases. The package marks itself experimental, appropriately, but its current contract is broader than demonstrated behavior.

   **Recommendation:** narrow claims to verified behavior or build a contract suite across all modes, keyboard Escape/outside close, pointer transit, focus restoration, Livewire morphing, positioning, and cleanup.

### Low

9. **Input validation is inconsistent and can leak invalid values into geometry.** Laravel `readNumber()` accepts any finite number, including negative delays/gutters; placement/align/strategy are cast rather than validated before calling the core ([options.ts](../../packages/tooltip-laravel/resources/js/tooltip/options.ts#L15), [hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L103)). Vue arrow options also clamp only some dimensions, not finite values; `NaN` can propagate through `Math.max` for arrow size/inset/static offset ([TooltipCore.ts](../../packages/tooltip-core/src/core/TooltipCore.ts#L225)). Invalid author-supplied options can produce nonsensical or browser-dependent CSS/geometry.

   **Recommendation:** normalize numeric values to finite, documented ranges and validate enum-like dataset inputs, with safe defaults and tests.

10. **Package quality evidence is uneven.** Core tests directly cover basic timer/state, ARIA string merge, arrow positioning, and overlay close mediation. Vue tests cover exports and some floating relayout behavior, but there is little controller lifecycle/focus mapping coverage. Laravel has useful JSDOM bootstrap/hydration tests but no Laravel-rendered Blade/Pest/Dusk coverage; its README lists those as roadmap work. This leaves emitted markup, framework hydration, and real browser positioning unverified.

   **Recommendation:** keep the shared core unit suite, add adapter-level lifecycle/contract tests, and add a small browser integration matrix for the Laravel view and Vue teleport/scroll behavior. Avoid relying on JSDOM for actual layout or screen-reader assertions.

## Architecture and performance notes

- The dependency direction is generally sound: framework-neutral state and geometry in `tooltip-core`, adapters in Vue and Laravel. Keep DOM/focus management out of core as it is now.
- Core's overlay-kernel integration is optional and close reasons are mapped explicitly. That is a good seam, though having tooltip behavior mediated by a shared overlay stack should remain opt-in/transparent for simple usage.
- Laravel `hydrateTooltip()` owns many concerns at once: state, DOM binding, ARIA, geometry, focus restoration, observers, and Livewire rehydration. This is currently a large implementation surface for a package marked experimental. Keep one owner for each concern and extract only if seams make lifecycle behavior easier to prove; avoid a second generic tooltip manager.
- Vue creates hidden/visible styles through refs and recalculates on relayout. This is appropriate for a small adapter, but must ensure only the latest scheduled measurement can publish a position.
- Laravel schedules a second position read after initial open and schedules zero-size retry frames. Those paths need bounded retry/cancellation guarantees to prevent repeated work for hidden/unmeasurable surfaces.
- No benchmark evidence was reviewed. For a basic component, reliability and low idle overhead matter more than a standalone microbenchmark: confirm listeners are installed once per relevant document, no per-tooltip global listener fan-out occurs, and frames stop after close/unmount.

## Recommended order of work

1. Fix/define Laravel listener ownership per document and close behavior across trigger/surface boundaries.
2. Harden Vue and Laravel scheduled positioning against close/unmount/ref replacement; cover scroll and both element resizes.
3. Settle the trigger DOM/ARIA contract and separate tooltip descriptions from live announcements.
4. Normalize inputs and align README guarantees with tested behavior.
5. Add focused adapter contracts and a real-browser smoke matrix before calling Laravel production-ready.

## Validation status

- Source, package metadata, documentation, and existing tests were reviewed.
- No tests, builds, browser runs, screen-reader checks, or performance measurements were run as this was a static audit request.
- The recommendations above are audit findings, not implemented changes.
