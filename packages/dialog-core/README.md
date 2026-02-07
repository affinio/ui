# @affino/dialog-core

Headless dialog engine that coordinates lifecycle hooks, focus scopes, async close guards, and overlay stacking across frameworks.

## Highlights

- Deterministic state machine (`idle → opening → open → closing → closed`).
- Blocking **and** optimistic guard strategies with pending-attempt telemetry.
- Plugs directly into `@affino/overlay-kernel` or into legacy registrars.
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
await controller.requestClose("programmatic")
```

## Standard modal profile helpers

Use helper factories when you want a conventional modal contract without repeating options:

```ts
import {
  createStandardModalDialogController,
  createStandardModalDialogOptions,
} from "@affino/dialog-core"

const controller = createStandardModalDialogController()
const options = createStandardModalDialogOptions({
  pendingNavigationMessage: "Saving changes...",
})
```

The helper profile applies:

- `overlayKind: "dialog"`
- `closeStrategy: "blocking"`
- `overlayEntryTraits.modal = true`
- `overlayEntryTraits.trapsFocus = true`
- `overlayEntryTraits.blocksPointerOutside = true`
- `overlayEntryTraits.inertSiblings = true`
- `overlayEntryTraits.returnFocus = true`

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
await controller.requestClose("programmatic", { strategy: "blocking" })

// Optimistic: play close animation immediately, reopen if guard denies.
await controller.requestClose("programmatic", { strategy: "optimistic" })
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
- Repeated `requestClose()` calls while a guard is pending increment `pendingCloseAttempts`. Hook `onPendingCloseAttempt` or `onPendingCloseLimitReached` to respond to ESC storms.

## Overlay kernel integration

```ts
import { DialogController } from "@affino/dialog-core"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"

const manager = getDocumentOverlayManager(document)

const dialog = new DialogController({
	id: "settings-dialog",
	overlayManager: manager,
	overlayEntryTraits: {
		ownerId: "root-modal",
		modal: true,
		blocksPointerOutside: true,
	},
})

dialog.open()

// Respond to owner-close cascades or pointer-outside decisions from the kernel.
manager.requestClose("settings-dialog", "pointer-outside")

// Escape/backdrop/pointer closes must route through the kernel:
await dialog.requestClose("escape-key") // internally calls manager.requestClose(...)

// Dialogs intentionally ignore kernel "focus-loss" close requests so routine focus churn
// (e.g., moving between inputs or portals) never dismisses a modal.
```

- `overlayManager` — injects a ready manager instance (per document or per host application).
- `getOverlayManager` — lazy resolver invoked once; useful when the controller runs before DOM is available.
- `overlayEntryTraits` — overrides structural metadata (`ownerId`, `modal`, `priority`, etc.) that the controller passes to the kernel on each phase transition.
- `overlayRegistrar` — remains as a fallback bridge for legacy stacks. When both are provided, the kernel path wins and the registrar is only used for manual `registerOverlay()` calls.

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
| `overlayRegistrar` | `OverlayRegistrar` | Legacy bridge into custom overlay managers (still used for `registerOverlay`). |
| `overlayManager` | `OverlayManager` | Inject an `@affino/overlay-kernel` manager to drive stacking, close requests, and ordering. |
| `getOverlayManager` | `() => OverlayManager \\| null` | Lazy resolver invoked on first need (SSR or dependency injection scenarios). |
| `overlayEntryTraits` | `DialogOverlayTraits` | Override kernel traits such as `ownerId`, `modal`, `priority`, `root`, or custom `data`. |
| `onSnapshot` | `(snapshot) => void` | Shortcut subscription invoked immediately + on change. |
| `onPendingCloseAttempt` | `(info) => void` | Called every time a guard is already pending and a new request arrives. |
| `onPendingCloseLimitReached` | `(info) => void` | Fired once per pending cycle when attempts reach the configured limit. |

### Methods

| Method | Description |
| --- | --- |
| `open(reason?)` | Transition to `opening → open`, run lifecycle hooks, and activate focus orchestration. |
| `requestClose(reason?, options?)` | Ask the controller (and kernel, when attached) to close. Kernel-managed reasons (`"escape-key"`, `"backdrop"`, `"pointer"`) are always arbitrated by the overlay manager before the controller executes guards. Returns `Promise<boolean>`. |
| `close(reason?, options?)` | Alias for `requestClose()` retained for backward compatibility. |
| `setCloseGuard(fn)` | Provide async/sync guard logic (resolve `{ outcome: "allow" }` or `{ outcome: "deny", message }`). |
| `subscribe(listener)` | Receive snapshots; returns an unsubscribe function. |
| `on(event, listener)` | Listen to `phase-change`, `open`, `close`, `overlay-registered`, `overlay-unregistered`. |
| `registerOverlay(registration)` | Relay to an external registrar and emit overlay events; returns disposer. |
| `canHandleClose(reason)` | Returns `true` if the controller is allowed to process the close request (top-most checks happen automatically). |
| `canStackOver(kind)` / `closeStrategyFor(kind)` | Consult interaction matrix before stacking new overlays. |
| `getPendingCloseAttempts()` | Inspect how many retries happened during the active guard. |
| `destroy(reason?)` | Clear subscribers, event listeners, guard state, and deactivate focus orchestration. |

Preflight example:

```ts
if (controller.canHandleClose("escape-key")) {
  await controller.requestClose("escape-key")
}
```

## Scripts

- `pnpm build` — compile TypeScript output.
- `pnpm test` — run Vitest suite with coverage.

## Supporting docs

- Implementation notes live in [`docs/dialog-implementation-plan.md`](../../docs/dialog-implementation-plan.md).
- Livewire adapter ideas live in [`docs/dialog-livewire.md`](../../docs/dialog-livewire.md).
