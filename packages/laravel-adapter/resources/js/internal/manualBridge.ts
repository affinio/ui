import type {
  AffinoAdapterComponent,
  AffinoManualEventMap,
  AffinoManualEventName,
  ManualDetailOf,
} from "../contracts"
import type { DiagnosticsRuntime } from "./diagnostics"

type ManualBridgeConfig<EventName extends AffinoManualEventName, Handle> = {
  component: AffinoAdapterComponent
  eventName: EventName
  rootAttribute: string
  handleProperty: string
  rehydrate?: () => void
  retryLimit?: number
  invoke: (handle: Handle, detail: ManualDetailOf<EventName>) => void
  diagnostics?: DiagnosticsRuntime | null
}

const DEFAULT_RETRY_LIMIT = 10
const handledMarker = Symbol("affino.manual.bridge.handled") // Prevents double-handling across adapters
const boundEvents = new Set<string>()

export function bindManualBridge<EventName extends AffinoManualEventName, Handle>(
  config: ManualBridgeConfig<EventName, Handle>,
): void {
  if (typeof document === "undefined") {
    return
  }
  if (boundEvents.has(config.eventName)) {
    return
  }

  const handler = (nativeEvent: Event) => {
    if (!(nativeEvent instanceof CustomEvent)) {
      return
    }
    const event = nativeEvent as CustomEvent<AffinoManualEventMap[EventName]> & Record<symbol, unknown>
    if (event[handledMarker]) {
      return
    }
    event[handledMarker] = true

    const detail = event.detail
    if (!detail || !("id" in detail) || !detail.id || !("action" in detail) || !detail.action) {
      return
    }

    config.rehydrate?.()
    invokeHandle(detail, config, 0)
  }

  document.addEventListener(config.eventName, handler)
  boundEvents.add(config.eventName)
}

function invokeHandle<EventName extends AffinoManualEventName, Handle>(
  detail: ManualDetailOf<EventName>,
  config: ManualBridgeConfig<EventName, Handle>,
  attempt: number,
): void {
  const handle = resolveHandle<Handle>(config.rootAttribute, config.handleProperty, detail.id)
  if (!handle) {
    const retryLimit = config.retryLimit ?? DEFAULT_RETRY_LIMIT
    if (attempt >= retryLimit) {
      return
    }
    requestAnimationFrame(() => invokeHandle(detail, config, attempt + 1))
    return
  }

  try {
    config.invoke(handle, detail)
    config.diagnostics?.recordManualInvocation(config.component)
  } catch {
    // Swallow to avoid surfacing manual bridge errors to the host app
  }
}

function resolveHandle<Handle>(
  rootAttribute: string,
  handleProperty: string,
  id: string,
): Handle | null {
  if (typeof document === "undefined") {
    return null
  }
  const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
  const selector = `[${rootAttribute}="${escapedId}"]`
  const root = document.querySelector<HTMLElement>(selector)
  if (!root) {
    return null
  }
  return ((root as HTMLElement & Record<string, unknown>)[handleProperty] as Handle | undefined) ?? null
}
