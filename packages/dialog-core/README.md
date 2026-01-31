# @affino/dialog-core

Headless dialog engine that orchestrates overlays, focus scopes, and async close guards consistently across frameworks.

## Status
- 🚧 Work in progress.
- Tracking plan: see `docs/dialog-implementation-plan.md`.

## Scripts
- `pnpm build` — compile TypeScript output.
- `pnpm test` — run Vitest suite with coverage.

## Goals
1. Deterministic state machine for `idle → opening → open → closing → closed`.
2. Overlay interaction matrix (nested dialogs, sheets, ESC priority) backed by tests.
3. Async close guards with optimistic vs blocking behavior and telemetry hooks.
4. Mobile keyboard resilience (iOS Safari viewport resize, scroll restoration, focus return).

## State Machine Contract
- `idle` means the overlay has never reached `open` (useful for SSR + first render). `closed` indicates it opened at least once and completed a close transition.
- Lifecycle hooks (`beforeOpen`, `afterOpen`, `beforeClose`, `afterClose`) fire in that order and wrap the `opening/closing` phases.
- Focus orchestration hooks receive the same context payload so adapters can restore focus, scope tabbables, or manage mobile keyboards.

## Guard Handling & ESC Storms
- Blocking vs optimistic close strategies are caller-controlled, and close guards can surface denial messages plus pending navigation copy.
- Repeated close attempts while a guard is pending increment `pendingCloseAttempts`. Set `maxPendingAttempts` and `onPendingCloseLimitReached` to react to ESC spam (e.g., force-close after N attempts or show stronger UX messaging).
- `optimisticCloseInFlight` now carries `optimisticCloseReason`, enabling analytics and UI copy like “Saving changes…” vs “Leaving view…”.

## Overlay Registration
- `registerOverlay` relays information to the provided registrar and emits telemetry events, but enforcement is up to the consumer. Use `canStackOver()` / `closeStrategyFor()` before opening additional overlays to respect your stacking policy.
