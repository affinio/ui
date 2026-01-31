const DEFAULT_HOST_ID = "affino-overlay-host"
const DEFAULT_HOST_ATTRIBUTE = "data-affino-overlay-host"
const DEFAULT_SCROLL_LOCK_ATTR = "affinoScrollLock"

export interface EnsureOverlayHostOptions {
  id?: string
  attribute?: string
  document?: Document
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
