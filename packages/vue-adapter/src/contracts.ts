import type { OverlayEntry, OverlayManager } from "@affino/overlay-kernel"
import type { VueDiagnosticsRuntime } from "./diagnostics"

export interface AffinoVueHostTarget {
  id: string
  attribute: string
}

export interface AffinoVueAdapterOptions {
  document?: Document | null
  hostTargets?: ReadonlyArray<AffinoVueHostTarget>
  exposeManagerOnWindow?: boolean
  windowDebugKey?: string
  diagnostics?: boolean
  diagnosticsWindowKey?: string
}

export interface AffinoVueBootstrapOptions extends AffinoVueAdapterOptions {
  bootstrapOnce?: boolean
}

export interface AffinoVueAdapterRuntime {
  manager: OverlayManager | null
  diagnostics: VueDiagnosticsRuntime | null
  subscribeToOverlayStack: (subscriber: (stack: readonly OverlayEntry[]) => void) => () => void
}
