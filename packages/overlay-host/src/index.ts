const DEFAULT_HOST_ID = "affino-overlay-host"
const DEFAULT_HOST_ATTRIBUTE = "data-affino-overlay-host"
const DEFAULT_SCROLL_LOCK_ATTR = "affinoScrollLock"
const DEFAULT_FLOATING_GUTTER_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }
const DEFAULT_FLOATING_RELAYOUT_METRICS_FLAG = "__affinoFloatingRelayoutMetricsEnabled"
const DEFAULT_FLOATING_RELAYOUT_METRICS_STORE = "__affinoFloatingRelayoutMetrics"

export interface EnsureOverlayHostOptions {
  id?: string
  attribute?: string
  document?: Document
}

export type FloatingStrategy = "fixed" | "absolute"

export interface FloatingHostTarget {
  id: string
  attribute: string
}

export interface FloatingRelayoutController {
  activate(): void
  deactivate(): void
  destroy(): void
  isActive(): boolean
}

export interface FloatingRelayoutControllerOptions {
  onRelayout: () => void
  window?: Window
  metrics?: FloatingRelayoutMetricsOptions
}

export interface FloatingRelayoutMetricsOptions {
  source?: string
  flagKey?: string
  storeKey?: string
}

export interface FloatingRelayoutMetricsEntry {
  activations: number
  deactivations: number
  relayouts: number
}

export interface FloatingRelayoutMetricsSnapshot {
  enabled: boolean
  sources: Record<string, FloatingRelayoutMetricsEntry>
}

export function ensureOverlayHost(options: EnsureOverlayHostOptions = {}): HTMLElement | null {
  const doc = options.document ?? getDocument()
  if (!doc) {
    return null
  }
  const id = options.id ?? DEFAULT_HOST_ID
  const attribute = options.attribute ?? DEFAULT_HOST_ATTRIBUTE
  let host = doc.getElementById(id)
  if (!host) {
    host = doc.createElement("div")
    host.id = id
    host.setAttribute(attribute, "true")
    doc.body?.appendChild(host)
  }
  return host
}

export function createFloatingHiddenStyle(
  strategy: FloatingStrategy,
  zIndex?: string,
): Record<string, string> {
  const style: Record<string, string> = {
    position: strategy,
    left: "-9999px",
    top: "-9999px",
    transform: "translate3d(0, 0, 0)",
  }
  if (zIndex) {
    style.zIndex = zIndex
  }
  return style
}

export function formatFloatingZIndex(value?: number | string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return typeof value === "number" ? `${value}` : value
}

export function resolveFloatingTeleportTarget(
  teleportTo: string | HTMLElement | false | undefined,
  host: FloatingHostTarget,
  doc?: Document,
): string | HTMLElement | null {
  if (teleportTo === false) {
    return null
  }
  if (teleportTo) {
    return teleportTo
  }
  return ensureOverlayHost({ id: host.id, attribute: host.attribute, document: doc }) ?? "body"
}

export function createFloatingRelayoutController(
  options: FloatingRelayoutControllerOptions,
): FloatingRelayoutController {
  const targetWindow = options.window ?? getWindow()
  const handleRelayout = () => {
    if (!targetWindow) {
      options.onRelayout()
      return
    }
    recordFloatingRelayoutMetric(targetWindow, "relayouts", options.metrics)
    options.onRelayout()
  }
  let active = false

  return {
    activate() {
      if (!targetWindow || active) {
        return
      }
      targetWindow.addEventListener("resize", handleRelayout)
      targetWindow.addEventListener("scroll", handleRelayout, DEFAULT_FLOATING_GUTTER_LISTENER_OPTIONS)
      recordFloatingRelayoutMetric(targetWindow, "activations", options.metrics)
      active = true
    },
    deactivate() {
      if (!targetWindow || !active) {
        return
      }
      targetWindow.removeEventListener("resize", handleRelayout)
      targetWindow.removeEventListener("scroll", handleRelayout, DEFAULT_FLOATING_GUTTER_LISTENER_OPTIONS)
      recordFloatingRelayoutMetric(targetWindow, "deactivations", options.metrics)
      active = false
    },
    destroy() {
      this.deactivate()
    },
    isActive() {
      return active
    },
  }
}

export function setFloatingRelayoutMetricsEnabled(enabled: boolean, target?: Window): void {
  const win = target ?? getWindow()
  const storeHost = getStoreHost(win)
  if (!storeHost) {
    return
  }
  storeHost[DEFAULT_FLOATING_RELAYOUT_METRICS_FLAG] = enabled
}

export function resetFloatingRelayoutMetrics(target?: Window): void {
  const win = target ?? getWindow()
  const storeHost = getStoreHost(win)
  if (!storeHost) {
    return
  }
  storeHost[DEFAULT_FLOATING_RELAYOUT_METRICS_STORE] = {}
}

export function getFloatingRelayoutMetrics(target?: Window): FloatingRelayoutMetricsSnapshot {
  const win = target ?? getWindow()
  const storeHost = getStoreHost(win)
  if (!storeHost) {
    return {
      enabled: false,
      sources: {},
    }
  }
  const enabled = Boolean(storeHost[DEFAULT_FLOATING_RELAYOUT_METRICS_FLAG] === true)
  const rawStore = storeHost[DEFAULT_FLOATING_RELAYOUT_METRICS_STORE]
  const sources = isMetricsStore(rawStore) ? rawStore : {}
  return {
    enabled,
    sources: { ...sources },
  }
}

export interface ScrollLockController {
  lock(): void
  unlock(): void
  isLocked(): boolean
}

export interface ScrollLockOptions {
  document?: Document
  window?: Window
  datasetAttribute?: string
}

type ScrollSnapshot = {
  scrollY: number
  rootTouchAction: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
}

export function createScrollLockController(options: ScrollLockOptions = {}): ScrollLockController {
  const doc = options.document ?? getDocument()
  const win = options.window ?? getWindow()
  const datasetAttribute = options.datasetAttribute ?? DEFAULT_SCROLL_LOCK_ATTR
  let snapshot: ScrollSnapshot | null = null

  return {
    lock() {
      if (!doc || !win) {
        return
      }
      const body = doc.body
      const root = doc.documentElement
      if (!body || !root || snapshot) {
        return
      }
      const scrollY = win.scrollY ?? win.pageYOffset ?? root.scrollTop ?? 0
      snapshot = {
        scrollY,
        rootTouchAction: root.style.touchAction || "",
        bodyPosition: body.style.position || "",
        bodyTop: body.style.top || "",
        bodyWidth: body.style.width || "",
      }
      root.style.touchAction = "none"
      body.dataset[datasetAttribute] = "true"
      body.style.position = "fixed"
      body.style.top = `-${scrollY}px`
      body.style.width = "100%"
    },
    unlock() {
      if (!doc || !win || !snapshot) {
        return
      }
      const body = doc.body
      const root = doc.documentElement
      if (body && root) {
        root.style.touchAction = snapshot.rootTouchAction
        body.style.position = snapshot.bodyPosition
        body.style.top = snapshot.bodyTop
        body.style.width = snapshot.bodyWidth
        if (body.dataset[datasetAttribute]) {
          delete body.dataset[datasetAttribute]
        }
      }
      win.scrollTo(0, snapshot.scrollY)
      snapshot = null
    },
    isLocked() {
      return Boolean(snapshot)
    },
  }
}

export interface GlobalKeydownManager {
  activate(): void
  deactivate(): void
  isActive(): boolean
}

export interface GlobalKeydownOptions {
  target?: KeydownEventTarget
}

export interface KeydownEventTarget {
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void, options?: boolean | EventListenerOptions): void
}

export function createGlobalKeydownManager(
  handler: (event: KeyboardEvent) => void,
  options: GlobalKeydownOptions = {}
): GlobalKeydownManager {
  const defaultTarget = getWindow()
  const target: KeydownEventTarget | undefined = options.target ?? (defaultTarget as KeydownEventTarget | null) ?? undefined
  let active = false

  return {
    activate() {
      if (!target || active) {
        return
      }
      target.addEventListener("keydown", handler)
      active = true
    },
    deactivate() {
      if (!target || !active) {
        return
      }
      target.removeEventListener("keydown", handler)
      active = false
    },
    isActive() {
      return active
    },
  }
}

function getDocument(): Document | null {
  if (typeof document === "undefined") {
    return null
  }
  return document
}

function getWindow(): Window | null {
  if (typeof window === "undefined") {
    return null
  }
  return window
}

function getStoreHost(target: Window | null): Record<string, unknown> | null {
  if (!target) {
    return null
  }
  return target as unknown as Record<string, unknown>
}

function resolveMetricsSource(options?: FloatingRelayoutMetricsOptions): string {
  return options?.source?.trim() || "floating-unknown"
}

function sanitizeMetricsKey(key: string): string | null {
  const trimmed = key.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed === "__proto__" || trimmed === "constructor" || trimmed === "prototype") {
    return null
  }
  return trimmed
}

function isMetricsEnabled(targetWindow: Window, options?: FloatingRelayoutMetricsOptions): boolean {
  const storeHost = getStoreHost(targetWindow)
  if (!storeHost) {
    return false
  }
  const flagKey = options?.flagKey ?? DEFAULT_FLOATING_RELAYOUT_METRICS_FLAG
  return storeHost[flagKey] === true
}

function ensureMetricsStore(
  targetWindow: Window,
  options?: FloatingRelayoutMetricsOptions,
): Record<string, FloatingRelayoutMetricsEntry> {
  const storeHost = getStoreHost(targetWindow)
  if (!storeHost) {
    return {}
  }
  const rawStoreKey = options?.storeKey ?? DEFAULT_FLOATING_RELAYOUT_METRICS_STORE
  const storeKey = sanitizeMetricsKey(rawStoreKey)
  if (!storeKey) {
    return {}
  }
  const existing = storeHost[storeKey]
  if (isMetricsStore(existing)) {
    return existing
  }
  const created: Record<string, FloatingRelayoutMetricsEntry> = {}
  storeHost[storeKey] = created
  return created
}

function recordFloatingRelayoutMetric(
  targetWindow: Window,
  metric: keyof FloatingRelayoutMetricsEntry,
  options?: FloatingRelayoutMetricsOptions,
): void {
  if (!isMetricsEnabled(targetWindow, options)) {
    return
  }
  const rawSource = resolveMetricsSource(options)
  const source = sanitizeMetricsKey(rawSource)
  if (!source) {
    return
  }
  const store = ensureMetricsStore(targetWindow, options)
  const current = store[source] ?? {
    activations: 0,
    deactivations: 0,
    relayouts: 0,
  }
  current[metric] += 1
  store[source] = current
}

function isMetricsStore(value: unknown): value is Record<string, FloatingRelayoutMetricsEntry> {
  if (!value || typeof value !== "object") {
    return false
  }
  return true
}
