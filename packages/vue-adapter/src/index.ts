import { ensureOverlayHost } from "@affino/overlay-host"
import { getDocumentOverlayManager, type OverlayEntry, type OverlayManager } from "@affino/overlay-kernel"
import type { App, Plugin } from "vue"
import type {
  AffinoVueAdapterOptions,
  AffinoVueAdapterRuntime,
  AffinoVueBootstrapOptions,
  AffinoVueHostTarget,
} from "./contracts"
import { createVueDiagnosticsRuntime } from "./diagnostics"

const DEFAULT_HOST_TARGETS = [
  { id: "affino-overlay-host", attribute: "data-affino-overlay-host" },
  { id: "affino-dialog-host", attribute: "data-affino-dialog-host" },
  { id: "affino-popover-host", attribute: "data-affino-popover-host" },
] as const

const RUNTIME_BY_DOCUMENT = new WeakMap<Document, AffinoVueAdapterRuntime>()
const BOOTSTRAP_FLAG = "__affinoVueAdapterBootstrapped"
const RUNTIME_KEY = "__affinoVueAdapterRuntime"

export function createAffinoVueAdapter(options: AffinoVueAdapterOptions = {}): AffinoVueAdapterRuntime {
  const targetDocument = resolveDocument(options.document)
  const hostTargets = options.hostTargets ?? DEFAULT_HOST_TARGETS
  const manager = initializeOverlayKernel({
    document: targetDocument,
    hostTargets,
    exposeManagerOnWindow: options.exposeManagerOnWindow,
    windowDebugKey: options.windowDebugKey,
  })
  const diagnostics = options.diagnostics
    ? createVueDiagnosticsRuntime({
        manager,
        document: targetDocument,
        hostTargets,
        windowKey: options.diagnosticsWindowKey,
      })
    : null
  diagnostics?.expose()

  const subscribeToOverlayStack = (subscriber: (stack: readonly OverlayEntry[]) => void): (() => void) => {
    if (!manager) {
      return () => {}
    }
    diagnostics?.recordSubscribe()
    subscriber(manager.getStack())
    const unsubscribe = manager.onStackChanged((event: { stack: readonly OverlayEntry[] }) => {
      diagnostics?.recordStackUpdate()
      subscriber(event.stack)
    })
    return () => {
      diagnostics?.recordUnsubscribe()
      unsubscribe()
    }
  }

  return {
    manager,
    diagnostics,
    subscribeToOverlayStack,
  }
}

/**
 * Idempotent app-level bootstrap. Preferred entry point for host applications.
 */
export function bootstrapAffinoVueAdapters(options: AffinoVueBootstrapOptions = {}): AffinoVueAdapterRuntime {
  const targetDocument = resolveDocument(options.document)
  if (!targetDocument) {
    return createAffinoVueAdapter(options)
  }

  if (options.bootstrapOnce === false) {
    return createAffinoVueAdapter(options)
  }

  const existing = RUNTIME_BY_DOCUMENT.get(targetDocument)
  if (existing) {
    return existing
  }

  const runtime = createAffinoVueAdapter(options)
  RUNTIME_BY_DOCUMENT.set(targetDocument, runtime)

  const targetWindow = targetDocument.defaultView
  if (targetWindow) {
    const scope = targetWindow as unknown as Record<string, unknown>
    scope[BOOTSTRAP_FLAG] = true
    scope[RUNTIME_KEY] = runtime
  }

  return runtime
}

export function createAffinoVuePlugin(options: AffinoVueAdapterOptions = {}): Plugin {
  return {
    install(app: App) {
      const runtime = bootstrapAffinoVueAdapters(options)
      app.provide(AFFINO_VUE_ADAPTER_KEY, runtime)
    },
  }
}

export function initializeOverlayKernel(options: AffinoVueAdapterOptions = {}): OverlayManager | null {
  const targetDocument = resolveDocument(options.document)
  if (!targetDocument) {
    return null
  }

  const hostTargets = options.hostTargets ?? DEFAULT_HOST_TARGETS
  for (const target of hostTargets) {
    ensureOverlayHost({ ...target, document: targetDocument })
  }

  const manager = getDocumentOverlayManager(targetDocument)

  if (options.exposeManagerOnWindow && typeof window !== "undefined") {
    const key = options.windowDebugKey ?? "__AFFINO_OVERLAY_MANAGER__"
    ;(window as unknown as Record<string, unknown>)[key] = manager
  }

  return manager
}

export const AFFINO_VUE_ADAPTER_KEY = Symbol("affino-vue-adapter")
export { DEFAULT_HOST_TARGETS }
export type { AffinoVueAdapterOptions, AffinoVueAdapterRuntime, AffinoVueBootstrapOptions, AffinoVueHostTarget } from "./contracts"
export type { VueDiagnosticsRuntime, VueDiagnosticsSnapshot } from "./diagnostics"

function resolveDocument(candidate?: Document | null): Document | null {
  if (candidate !== undefined) {
    return candidate
  }
  if (typeof document === "undefined") {
    return null
  }
  return document
}
