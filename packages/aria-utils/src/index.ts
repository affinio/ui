const DEFAULT_DESCRIPTION_SELECTORS = ["[data-dialog-description]", ".dialog-description"]
const DEFAULT_DESCRIPTION_ID_PREFIX = "dialog-description"

let descriptionCounter = 0

export function normalizeKey(event: KeyboardEvent): string {
  const key = event.key
  if (key === " " || key === "Spacebar") {
    return "Space"
  }
  if (key === "Left") {
    return "ArrowLeft"
  }
  if (key === "Right") {
    return "ArrowRight"
  }
  if (key === "Up") {
    return "ArrowUp"
  }
  if (key === "Down") {
    return "ArrowDown"
  }
  const legacyIdentifier = (event as KeyboardEvent & { keyIdentifier?: string }).keyIdentifier
  if (legacyIdentifier === "U+0020") {
    return "Space"
  }
  if (legacyIdentifier === "U+000D") {
    return "Enter"
  }
  if (legacyIdentifier === "Left") {
    return "ArrowLeft"
  }
  if (legacyIdentifier === "Right") {
    return "ArrowRight"
  }
  if (legacyIdentifier === "Up") {
    return "ArrowUp"
  }
  if (legacyIdentifier === "Down") {
    return "ArrowDown"
  }
  return key
}

export interface EnsureDialogAriaOptions {
  surface: HTMLElement | null | undefined
  labelId?: string
  fallbackLabel?: string
  warn?: boolean
  descriptionSelectors?: string[]
  descriptionIdPrefix?: string
  console?: Pick<Console, "warn">
}

export function ensureDialogAria(options: EnsureDialogAriaOptions): void {
  const surface = options.surface ?? null
  if (!surface) {
    return
  }

  ensureRole(surface)
  ensureModal(surface)
  ensureLabel(surface, options.labelId, options.fallbackLabel)
  ensureDescription(surface, {
    selectors: options.descriptionSelectors ?? DEFAULT_DESCRIPTION_SELECTORS,
    idPrefix: options.descriptionIdPrefix ?? DEFAULT_DESCRIPTION_ID_PREFIX,
    warn: options.warn ?? false,
    console: options.console ?? console,
  })
}

export interface DescriptionDiscoveryOptions {
  selectors?: string[]
}

export function discoverDescription(
  surface: HTMLElement,
  options: DescriptionDiscoveryOptions = {}
): HTMLElement | null {
  const selectors = options.selectors ?? DEFAULT_DESCRIPTION_SELECTORS
  for (const selector of selectors) {
    const node = surface.querySelector<HTMLElement>(selector)
    if (node) {
      return node
    }
  }
  return null
}

function ensureRole(surface: HTMLElement) {
  if (!surface.hasAttribute("role")) {
    surface.setAttribute("role", "dialog")
  }
}

function ensureModal(surface: HTMLElement) {
  if (!surface.hasAttribute("aria-modal")) {
    surface.setAttribute("aria-modal", "true")
  }
}

function ensureLabel(surface: HTMLElement, labelId?: string, fallbackLabel?: string) {
  if (labelId && !surface.getAttribute("aria-labelledby")) {
    surface.setAttribute("aria-labelledby", labelId)
  }
  if (!surface.getAttribute("aria-labelledby") && fallbackLabel && !surface.getAttribute("aria-label")) {
    surface.setAttribute("aria-label", fallbackLabel)
  }
}

interface EnsureDescriptionOptions {
  selectors: string[]
  idPrefix: string
  warn: boolean
  console: Pick<Console, "warn">
}

function ensureDescription(surface: HTMLElement, options: EnsureDescriptionOptions) {
  if (surface.getAttribute("aria-describedby")) {
    return
  }
  const description = discoverDescription(surface, { selectors: options.selectors })
  if (description) {
    if (!description.id) {
      description.id = `${options.idPrefix}-${++descriptionCounter}`
    }
    surface.setAttribute("aria-describedby", description.id)
    return
  }
  if (options.warn) {
    options.console.warn(
      "[aria-utils] No dialog description found. Provide data-dialog-description or aria-describedby to improve announcements.",
      surface
    )
  }
}
