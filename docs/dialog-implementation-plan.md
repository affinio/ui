# Dialog Implementation Plan

## Milestone 0 · Alignment & Spec Freeze
- Finalize experience flows, overlay interaction matrix, and mobile keyboard contract; capture sign-off from Design, Accessibility, and QA.
- Produce state-machine spec covering idle → opening → open → closing → closed transitions, interruption policy, and async guard semantics.
- Deliverables: updated Figma flows, interaction spec appendix, finalized API RFC in `packages/dialog-core/docs`.

## Milestone 1 · Foundations
1. **Overlay Manager Enhancements**
   - Extend existing overlay manager (or introduce a new service) with stacking queue, inert background toggling, and escape delegation.
   - Add unit tests for nested overlays and ESC priority resolution.
2. **Focus & Scroll Utilities**
   - Build focus scope helper, restore-target tracker, and body scroll lock with iOS touchmove guards.
   - Provide soft-keyboard adapters: viewport resize observer, keyboard overlap mitigation utilities.
3. **Animation & Token Prep**
   - Define motion tokens, reduced-motion variants, and baseline backdrop tokens shared via `@affino/surface-core`.

## Milestone 2 · `@affino/dialog-core`
1. **Package Scaffolding (current task)**
   - Create TypeScript package with exports, build/test scripts, Vitest config, and README.
2. **State Machine & Controller**
   - Implement `DialogController` with lifecycle hooks, event emitters, focus orchestration contracts, and overlay registration.
   - Support controlled + uncontrolled APIs plus optimistic/blocking close guards with pending-state notifications.
3. **Overlay Interaction Policies**
   - Encode overlay matrix (dialog-on-dialog, sheet precedence) into deterministic rules exposed via config/telemetry events.
4. **Test Suite**
   - Cover state transitions, guard handling, concurrent dialogs, and mobile viewport adapters; maintain ≥90% coverage.

## Milestone 3 · Framework Bindings
1. **React Package**
   - Deliver headless components (`Dialog`, `DialogTrigger`, `DialogClose`) using portals + focus scope.
   - Add Storybook examples for nested stacks, async guards, mobile keyboard handling.
2. **Vue Package**
   - Mirror API using Teleport and Composition API; integrate with existing stores.
3. **Docs & Recipes**
   - Author migration guide, accessibility checklist, and overlay debugging tips inside `docs-site/menu/dialog`.

## Milestone 4 · Polishing & Release
- Visual regression matrix (Chromatic/Playwright) including soft-keyboard scenarios.
- Performance audit (RAIL) and stress tests (rapid open/close, guard storms).
- Beta rollout with telemetry dashboards and feedback triage, followed by GA checklist.

### Tracking & Ownership
- Project board columns: Backlog → Spec Ready → In Progress → In Review → Done.
- Owners: Core Engineering (controller + overlays), Framework Teams (React/Vue bindings), DX (docs/testing), QA (mobile keyboard matrix).
