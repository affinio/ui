import type { OverlayManager } from "@affino/overlay-kernel"
import type { AffinoVueHostTarget } from "./contracts"

const DEFAULT_DIAGNOSTICS_KEY = "__affinoVueDiagnostics"

export interface VueDiagnosticsSnapshot {
  hasManager: boolean
  stackSize: number
  stackUpdates: number
  activeSubscriptions: number
  hostStatus: Readonly<Record<string, boolean>>
}

export interface VueDiagnosticsRuntime {
  getSnapshot: () => VueDiagnosticsSnapshot
  recordStackUpdate: () => void
  recordSubscribe: () => void
  recordUnsubscribe: () => void
  expose: () => void
}

interface CreateDiagnosticsOptions {
  manager: OverlayManager | null
  document: Document | null
  hostTargets: ReadonlyArray<AffinoVueHostTarget>
  windowKey?: string
}

export function createVueDiagnosticsRuntime(options: CreateDiagnosticsOptions): VueDiagnosticsRuntime {
  let stackUpdates = 0
  let activeSubscriptions = 0
  let exposed = false

  const getSnapshot = (): VueDiagnosticsSnapshot => {
    const hosts: Record<string, boolean> = {}
    const doc = options.document
    for (const target of options.hostTargets) {
      hosts[target.id] = Boolean(doc?.getElementById(target.id))
    }
    return Object.freeze({
      hasManager: options.manager !== null,
      stackSize: options.manager?.getStack().length ?? 0,
      stackUpdates,
      activeSubscriptions,
      hostStatus: Object.freeze(hosts),
    })
  }

  const expose = () => {
    const targetWindow = options.document?.defaultView
    if (!targetWindow || exposed) {
      return
    }
    const key = options.windowKey ?? DEFAULT_DIAGNOSTICS_KEY
    try {
      Object.defineProperty(targetWindow as unknown as Record<string, unknown>, key, {
        value: Object.freeze({
          get snapshot() {
            return getSnapshot()
          },
        }),
        configurable: true,
        enumerable: false,
        writable: false,
      })
      exposed = true
    } catch {
      // Ignore defineProperty failures in constrained environments.
    }
  }

  return {
    getSnapshot,
    recordStackUpdate() {
      stackUpdates += 1
    },
    recordSubscribe() {
      activeSubscriptions += 1
    },
    recordUnsubscribe() {
      activeSubscriptions = Math.max(0, activeSubscriptions - 1)
    },
    expose,
  }
}
