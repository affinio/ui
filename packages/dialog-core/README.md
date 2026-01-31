# @affino/dialog-core

Headless dialog engine that coordinates lifecycle hooks, focus scopes, async close guards, and overlay stacking across frameworks.

## Highlights

- Deterministic state machine (`idle → opening → open → closing → closed`).
- Blocking **and** optimistic guard strategies with pending-attempt telemetry.
- Overlay interaction matrix (`dialog` vs `sheet`) plus registrar hooks.
- Focus orchestration contract for portals, scroll locks, or custom traps.
- Pure TypeScript, zero DOM dependencies, easy to adapt to Vue/React/Livewire.

## Installation

```bash
pnpm add @affino/dialog-core
# or
npm install @affino/dialog-core
```

## Quick start

```ts
import { DialogController } from "@affino/dialog-core"

const controller = new DialogController({
	overlayKind: "dialog",
	closeStrategy: "blocking",
	lifecycle: {
		afterOpen: () => console.log("opened"),
		afterClose: () => console.log("closed"),
	},
})

controller.subscribe((snapshot) => {
	console.log(snapshot.phase, snapshot.isGuardPending)
})

controller.open("keyboard")
await controller.close("programmatic")
```

### Snapshot contract

Each subscriber receives a `DialogSnapshot`:

```ts
type DialogSnapshot = {
	phase: "idle" | "opening" | "open" | "closing" | "closed"
	isOpen: boolean
	isGuardPending: boolean
	lastCloseReason?: DialogCloseReason
	guardMessage?: string
	optimisticCloseInFlight: boolean
	optimisticCloseReason?: DialogCloseReason
	pendingCloseAttempts: number
	pendingNavigationMessage?: string
}
```

Use it to drive UI chrome (`data-phase` attributes, overlays, aria messaging) in frameworks or vanilla DOM.

## Guard strategies

`setCloseGuard()` wires custom logic that can allow or deny close requests. Choose the strategy per call:

```ts
controller.setCloseGuard(async ({ reason, metadata }) => {
	const hasUnsavedChanges = await checkDraft(metadata?.draftId)
	return hasUnsavedChanges ? { outcome: "deny", message: "Save draft first" } : { outcome: "allow" }
})

// Blocking (default): keep dialog open until guard resolves.
await controller.close("programmatic", { strategy: "blocking" })

// Optimistic: play close animation immediately, reopen if guard denies.
await controller.close("programmatic", { strategy: "optimistic" })
```

```
open → [close requested]
				│
				├─ blocking ── wait ── allow ── closing ── closed
				│                       └─ deny ── open (message)
				│
				└─ optimistic ─ closing ─ allow ─ closed
																└─ deny ─ open (message)
```

- `pendingNavigationMessage` surfaces copy such as “Saving changes…” whenever a guard is resolving.
- Repeated `close()` calls while a guard is pending increment `pendingCloseAttempts`. Hook `onPendingCloseAttempt` or `onPendingCloseLimitReached` to respond to ESC storms.

## Overlay stacking rules

`OverlayInteractionMatrix` encodes how dialogs and sheets interact by default:

| Source → Target | Can stack? | Close strategy |
| --- | --- | --- |
| dialog → dialog | ✅ | `single` |
| dialog → sheet | ✅ | `single` |
| sheet → dialog | ❌ | `cascade` |
| sheet → sheet | ✅ | `cascade` |

Use the helpers to make open/close decisions before instantiating additional overlays:

```ts
if (!controller.canStackOver("dialog")) {
	// dismiss the sheet first or show a toast
}

const strategy = controller.closeStrategyFor("dialog") // "cascade" for sheet → dialog
```

Provide custom rules or telemetry emitters via `interactionMatrix` when embedding into your own overlay manager.

## Focus orchestration

Inject a `focusOrchestrator` to centralize focus scopes, return targets, or iOS soft-keyboard fixes:

```ts
const controller = new DialogController({
	focusOrchestrator: {
		activate: ({ reason }) => trap.activate(reason),
		deactivate: ({ reason }) => trap.deactivate(reason),
	},
})
```

The controller only calls `activate` once per open cycle and automatically invokes `deactivate` when closing or when `destroy()` is called.

## API surface

### Constructor options

| Option | Type | Description |
| --- | --- | --- |
| `defaultOpen` | `boolean` | Start in the `open` phase (SSR previews/testing). |
| `overlayKind` | `"dialog" \| "sheet"` | Drive stacking decisions for this controller. |
| `interactionMatrix` | `OverlayInteractionMatrixConfig` | Override stacking rules or attach telemetry. |
| `closeStrategy` | `"blocking" \| "optimistic"` | Default guard strategy (per-close overrides allowed). |
| `pendingNavigationMessage` | `string` | Copy shown while a guard is resolving. |
| `maxPendingAttempts` | `number` | ESC spam ceiling before firing `onPendingCloseLimitReached`. |
| `lifecycle` | `DialogLifecycleHooks` | `before/after` open + close callbacks. |
| `focusOrchestrator` | `DialogFocusOrchestrator` | Hook to your focus trap/return target logic. |
| `overlayRegistrar` | `OverlayRegistrar` | Bridge into an external overlay manager. |
| `onSnapshot` | `(snapshot) => void` | Shortcut subscription invoked immediately + on change. |
| `onPendingCloseAttempt` | `(info) => void` | Called every time a guard is already pending and a new request arrives. |
| `onPendingCloseLimitReached` | `(info) => void` | Fired once per pending cycle when attempts reach the configured limit. |

### Methods

| Method | Description |
| --- | --- |
| `open(reason?)` | Transition to `opening → open`, run lifecycle hooks, and activate focus orchestration. |
| `close(reason?, options?)` | Request a close with optional guard metadata/strategy. Returns `Promise<boolean>`. |
| `setCloseGuard(fn)` | Provide async/sync guard logic (resolve `{ outcome: "allow" }` or `{ outcome: "deny", message }`). |
| `subscribe(listener)` | Receive snapshots; returns an unsubscribe function. |
| `on(event, listener)` | Listen to `phase-change`, `open`, `close`, `overlay-registered`, `overlay-unregistered`. |
| `registerOverlay(registration)` | Relay to an external registrar and emit overlay events; returns disposer. |
| `canStackOver(kind)` / `closeStrategyFor(kind)` | Consult interaction matrix before stacking new overlays. |
| `getPendingCloseAttempts()` | Inspect how many retries happened during the active guard. |
| `destroy(reason?)` | Clear subscribers, event listeners, guard state, and deactivate focus orchestration. |

## Scripts

- `pnpm build` — compile TypeScript output.
- `pnpm test` — run Vitest suite with coverage.

## Supporting docs

- Implementation notes live in [`docs/dialog-implementation-plan.md`](../../docs/dialog-implementation-plan.md).
- Livewire adapter ideas live in [`docs/dialog-livewire.md`](../../docs/dialog-livewire.md).
