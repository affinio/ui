# Dialog + Livewire Adapter Plan

The `@affino/dialog-core` controller already encapsulates guard handling, lifecycle hooks, and stacking logic. A Livewire adapter must expose that contract to server-driven UIs without forcing teams to write custom JavaScript for every modal. This document captures the design targets and the work sequence for the upcoming `dialog-livewire` package.

## Goals
- Ship a Blade-friendly API that keeps Livewire components declarative while letting `DialogController` stay authoritative over state.
- Support async guards, optimistic closes, and telemetry hooks just like the Vue adapter.
- Keep the integration framework-agnostic: no direct dependency on Alpine, Stimulus, or other helper libraries.
- Provide escape hatches so product teams can opt into custom focus or stacking strategies when needed.

## Architecture Overview
1. **Bridge Controller**
   - Build a tiny JavaScript helper (`createLivewireDialogBridge`) that instantiates `DialogController`, mirrors its snapshot into Livewire props via `@this.set`, and listens for Livewire events (`open`, `close`, `set-guard`).
   - The bridge emits Livewire events (`dialog-opened`, `dialog-closed`, `close-denied`) so PHP code can hook in.
2. **Blade Components**
   - Deliver `<x-affino-dialog>` and `<x-affino-dialog-trigger>` components that:
     - Render semantic markup (dialog/backdrop) with the proper data attributes for the JS bridge to latch onto.
     - Accept guard/focus options via attributes (e.g. `focus="first"`, `return-focus="trigger"`).
   - Provide slots for header, body, footer, and actions.
3. **Livewire Trait**
   - Ship a `UsesDialogController` trait exposing helpers like `$this->dialog('profile-editor')->open()`.
   - Trait maps trait methods to emitted browser events that the JS bridge consumes.
4. **Focus + Stacking**
   - Reuse the `createDialogFocusOrchestrator` logic from the Vue package inside the bridge to manage focus targets.
   - Allow Livewire to declare `overlayKind` per dialog so nested sheets/dialogs can coexist.
5. **Testing Strategy**
   - PHP: Pest tests to ensure the trait emits the right browser events and guard callbacks fire.
   - JS: Vitest unit tests for the bridge plus Playwright e2e coverage inside a demo Livewire app.

## Event Flow
1. Blade renders the dialog component with data attributes (id, kind, focus targets).
2. On load, the JS bridge scans for `[data-affino-dialog]`, instantiates a `DialogController`, wires `subscribe` updates into `@this.set('dialogSnapshots.' + id, snapshot)`, and registers listeners for `wire:click="openDialog('id')"` actions.
3. When the user clicks a trigger:
   - Livewire emits `open-dialog`.
   - Bridge receives the event and calls `controller.open(reason)`.
4. When `controller.close()` requests a guard decision:
   - Bridge invokes `Livewire.dispatch('dialog-close-requested', { id, reason })`.
   - PHP listener runs guard logic, calls `$this->allowDialogClose($id)` or `$this->denyDialogClose($id, message)`.

## Deliverables & Sequence
1. **Bridge Prototype** (JS) – mirror of the Vue `useDialogController` but storing snapshot in DOM dataset and dispatching custom events.
2. **Blade Components + Trait** – PHP scaffolding that emits events consumed by the bridge.
3. **Demo App** – Minimal Laravel + Livewire example under `demo-livewire/` for manual QA.
4. **Documentation** – Usage guide covering optimistic closes, guard hooks, and stacking behavior.

## Outstanding Questions
- How should we package the PHP + JS combo (single Composer package with bundled assets vs. split npm/composer packages)?
- Do we enforce a specific focus style (e.g., always autofocus the dialog) or expose an attribute-based contract so teams can hook their own refs?
- Should guard callbacks live exclusively on the PHP side, or do we allow inline JS guards for hybrid apps?

Resolving these questions will shape the final ergonomics, but this plan is concrete enough to begin prototyping the Livewire bridge alongside the new Vue adapter.
