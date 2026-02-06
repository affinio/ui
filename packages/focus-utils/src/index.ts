export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const DEFAULT_SENTINEL_CLASS = "focus-sentinel"

export interface FocusableElementsOptions {
  selector?: string
  includeDisabled?: boolean
  includeSentinels?: boolean
  sentinelClassName?: string
}

export function getFocusableElements(container: HTMLElement | null, options: FocusableElementsOptions = {}): HTMLElement[] {
  if (!container || !isBrowserEnvironment()) {
    return []
  }
  const selector = options.selector ?? FOCUSABLE_SELECTOR
  const sentinelClass = options.sentinelClassName ?? DEFAULT_SENTINEL_CLASS
  const includeSentinels = options.includeSentinels ?? false
  const includeDisabled = options.includeDisabled ?? false
  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector))
  return elements.filter((element) => {
    if (!includeSentinels && element.classList.contains(sentinelClass)) {
      return false
    }
    if (!includeDisabled && element.getAttribute("aria-disabled") === "true") {
      return false
    }
    if (!includeDisabled && isNaturallyDisabled(element)) {
      return false
    }
    if (element.getAttribute("tabindex") === "-1") {
      return false
    }
    return isElementVisible(element)
  })
}

export interface TrapFocusOptions {
  focusables?: HTMLElement[]
}

export function trapFocus(event: KeyboardEvent, container: HTMLElement | null, options: TrapFocusOptions = {}): void {
  if (event.key !== "Tab" || !container || !isBrowserEnvironment()) {
    return
  }
  let focusables = options.focusables ?? getFocusableElements(container)
  if (!focusables.length) {
    focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }
  if (!focusables.length) {
    event.preventDefault()
    container.focus()
    return
  }
  const activeElement = document.activeElement as HTMLElement | null
  let index = activeElement ? focusables.indexOf(activeElement) : -1
  if (event.shiftKey) {
    index = index <= 0 ? focusables.length - 1 : index - 1
  } else {
    index = index === focusables.length - 1 ? 0 : index + 1
  }
  event.preventDefault()
  const previous = activeElement
  const nextTarget = focusables[index]
  if (nextTarget) {
    if (nextTarget.tabIndex < 0 && !nextTarget.hasAttribute("tabindex")) {
      nextTarget.tabIndex = 0
    }
    nextTarget.focus()
  }
  if (previous && document.activeElement === previous && focusables.length > 1) {
    const fallback = event.shiftKey ? focusables[focusables.length - 1] : focusables[0]
    if (fallback && fallback !== previous) {
      if (typeof previous.blur === "function") {
        previous.blur()
      }
      if (fallback.tabIndex < 0 && !fallback.hasAttribute("tabindex")) {
        fallback.tabIndex = 0
      }
      fallback.focus()
    }
  }
}

export type FocusEdge = "start" | "end"

export interface FocusEdgeOptions {
  fallbackToContainer?: boolean
  focusables?: HTMLElement[]
}

export function focusEdge(container: HTMLElement, edge: FocusEdge, options: FocusEdgeOptions = {}): void {
  const focusables = options.focusables ?? getFocusableElements(container)
  if (!focusables.length) {
    if (options.fallbackToContainer !== false) {
      container.focus()
    }
    return
  }
  const target = edge === "start" ? focusables[0] : focusables[focusables.length - 1]
  target?.focus()
}

export function hasFocusSentinels(container: HTMLElement | null, selector = `.${DEFAULT_SENTINEL_CLASS}`): boolean {
  if (!container || !isBrowserEnvironment()) {
    return false
  }
  return Boolean(container.querySelector(selector))
}

function isElementVisible(element: HTMLElement): boolean {
  if (!isBrowserEnvironment()) {
    return true
  }
  if (isJsdomEnvironment()) {
    return true
  }
  if (element.hidden) {
    return false
  }
  const style = window.getComputedStyle(element)
  if (!style || (style.visibility === "" && style.display === "")) {
    return true
  }
  return style.visibility !== "hidden" && style.display !== "none"
}

function isNaturallyDisabled(element: HTMLElement): boolean {
  if ("disabled" in element) {
    return Boolean((element as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled)
  }
  return false
}

function isBrowserEnvironment(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function isJsdomEnvironment(): boolean {
  return typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)
}
