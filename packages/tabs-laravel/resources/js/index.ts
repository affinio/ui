import { normalizeKey } from "@affino/aria-utils"
import { TabsCore, type TabsState } from "@affino/tabs-core"

type TabsHandle = {
  select: (value: string) => void
  clear: () => void
  getSnapshot: () => TabsState
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoTabsRoot?: string
    affinoTabsDefaultValue?: string
    affinoTabsUid?: string
  }
  affinoTabs?: TabsHandle
}

type Cleanup = () => void

type TabsStructure = {
  triggers: HTMLElement[]
  panels: HTMLElement[]
}

type TriggerModel = {
  trigger: HTMLElement
  value: string
  panel: HTMLElement
}

const TABS_ROOT_SELECTOR = "[data-affino-tabs-root]"
const TABS_TRIGGER_SELECTOR = "[data-affino-tabs-trigger]"
const TABS_PANEL_SELECTOR = "[data-affino-tabs-content]"
const registry = new WeakMap<RootEl, Cleanup>()
const structureRegistry = new WeakMap<RootEl, TabsStructure>()
const pendingScanScopes = new Set<ParentNode>()
const pendingRemovedRoots = new Set<RootEl>()
let scanFlushScheduled = false
let removedCleanupScheduled = false
let tabsUidCounter = 0

export function bootstrapAffinoTabs(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
}

export function hydrateTabs(root: RootEl): void {
  const structure = collectTabsStructure(root)
  if (!structure) {
    registry.get(root)?.()
    structureRegistry.delete(root)
    return
  }
  hydrateResolvedTabs(root, structure)
}

function hydrateResolvedTabs(root: RootEl, structure: TabsStructure): void {
  const { triggers, panels } = structure
  registry.get(root)?.()

  const uid = ensureTabsUid(root)
  const models = resolveTriggerModels(uid, triggers, panels)
  if (!models.length) {
    root.dataset.affinoTabsState = "closed"
    root.dataset.affinoTabsValue = ""
    return
  }

  root.setAttribute("role", "tablist")
  root.setAttribute("aria-orientation", "horizontal")

  const defaultValue = resolveDefaultValue(root.dataset.affinoTabsDefaultValue, models)
  const validValues = new Set(models.map((model) => model.value))
  const core = new TabsCore<string>(defaultValue)
  const subscription = core.subscribe((state) => {
    const value = state.value
    root.dataset.affinoTabsValue = value ?? ""
    root.dataset.affinoTabsState = value ? "open" : "closed"
    const activeValue = value ?? models[0]?.value ?? null
    models.forEach((model, index) => {
      const active = activeValue != null && model.value === activeValue
      const { trigger, panel } = model
      trigger.setAttribute("aria-selected", active ? "true" : "false")
      trigger.classList.toggle("is-active", active)
      trigger.dataset.state = active ? "active" : "inactive"
      trigger.tabIndex = active ? 0 : -1
      panel.hidden = !active
      panel.dataset.state = active ? "active" : "inactive"
      if (activeValue == null && index === 0) {
        trigger.tabIndex = 0
      }
    })
  })

  const listeners = models.map((model) => {
    const trigger = model.trigger
    const onClick = () => {
      core.select(model.value)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = normalizeKey(event)
      if (key === "Space" || key === "Enter") {
        event.preventDefault()
        core.select(model.value)
        return
      }

      const currentIndex = models.findIndex((item) => item.trigger === trigger)
      if (currentIndex === -1) {
        return
      }

      if (key === "ArrowRight" || key === "ArrowDown") {
        event.preventDefault()
        const next = models[(currentIndex + 1) % models.length]
        if (!next) {
          return
        }
        core.select(next.value)
        next.trigger.focus()
        return
      }

      if (key === "ArrowLeft" || key === "ArrowUp") {
        event.preventDefault()
        const next = models[(currentIndex - 1 + models.length) % models.length]
        if (!next) {
          return
        }
        core.select(next.value)
        next.trigger.focus()
        return
      }

      if (key === "Home") {
        event.preventDefault()
        const next = models[0]
        if (!next) {
          return
        }
        core.select(next.value)
        next.trigger.focus()
        return
      }

      if (key === "End") {
        event.preventDefault()
        const next = models[models.length - 1]
        if (!next) {
          return
        }
        core.select(next.value)
        next.trigger.focus()
      }
    }
    trigger.addEventListener("click", onClick)
    trigger.addEventListener("keydown", onKeyDown)
    return () => {
      trigger.removeEventListener("click", onClick)
      trigger.removeEventListener("keydown", onKeyDown)
    }
  })

  root.affinoTabs = {
    select: (value: string) => {
      if (!validValues.has(value)) {
        return
      }
      core.select(value)
    },
    clear: () => core.clear(),
    getSnapshot: () => core.getSnapshot(),
  }

  registry.set(root, () => {
    listeners.forEach((cleanup) => cleanup())
    subscription.unsubscribe()
    core.destroy()
    if (root.affinoTabs) {
      delete root.affinoTabs
    }
    registry.delete(root)
    structureRegistry.delete(root)
  })
  structureRegistry.set(root, structure)
}

function resolveDefaultValue(defaultValue: string | undefined, models: TriggerModel[]): string {
  if (defaultValue && models.some((model) => model.value === defaultValue)) {
    return defaultValue
  }
  return models[0]?.value ?? ""
}

function ensureTabsUid(root: RootEl): string {
  const existing = root.dataset.affinoTabsUid
  if (existing) {
    return existing
  }
  tabsUidCounter += 1
  const uid = `affino-tabs-${tabsUidCounter}`
  root.dataset.affinoTabsUid = uid
  return uid
}

function resolveTriggerModels(uid: string, triggers: HTMLElement[], panels: HTMLElement[]): TriggerModel[] {
  const panelByValue = new Map<string, HTMLElement>()
  panels.forEach((panel, index) => {
    panel.setAttribute("role", "tabpanel")
    const value = panel.dataset.affinoTabsValue ?? ""
    if (!panel.id) {
      panel.id = `${uid}-panel-${index + 1}`
    }
    if (value && !panelByValue.has(value)) {
      panelByValue.set(value, panel)
    }
  })

  const models: TriggerModel[] = []
  triggers.forEach((trigger, index) => {
    trigger.setAttribute("role", "tab")
    trigger.setAttribute("aria-disabled", "false")
    if (!trigger.id) {
      trigger.id = `${uid}-trigger-${index + 1}`
    }

    const value = trigger.dataset.affinoTabsValue ?? ""
    if (!value) {
      trigger.tabIndex = -1
      trigger.setAttribute("aria-selected", "false")
      trigger.dataset.state = "inactive"
      return
    }

    const panel = panelByValue.get(value)
    if (!panel) {
      trigger.tabIndex = -1
      trigger.setAttribute("aria-selected", "false")
      trigger.dataset.state = "inactive"
      return
    }

    trigger.setAttribute("aria-controls", panel.id)
    panel.setAttribute("aria-labelledby", trigger.id)

    models.push({ trigger, value, panel })
  })

  return models
}

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches(TABS_ROOT_SELECTOR)) {
    maybeHydrateTabs(node as RootEl)
  }
  node.querySelectorAll<RootEl>(TABS_ROOT_SELECTOR).forEach((root) => {
    maybeHydrateTabs(root)
  })
}

function setupMutationObserver(): void {
  if (typeof window === "undefined") {
    return
  }
  const scope = window as unknown as Record<string, unknown>
  const key = "__affinoTabsObserver"
  if (scope[key]) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          if (hasTabsRoot(node)) {
            scheduleScan(node)
          }
        }
      })
      mutation.removedNodes.forEach((node) => scheduleRemovedCleanup(node))
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scope[key] = observer
}

function maybeHydrateTabs(root: RootEl): void {
  const nextStructure = collectTabsStructure(root)
  if (!nextStructure) {
    registry.get(root)?.()
    structureRegistry.delete(root)
    return
  }
  const previous = structureRegistry.get(root)
  if (registry.has(root) && previous && isSameStructure(previous, nextStructure)) {
    return
  }
  hydrateResolvedTabs(root, nextStructure)
}

function collectTabsStructure(root: RootEl): TabsStructure | null {
  const triggers = Array.from(root.querySelectorAll<HTMLElement>(TABS_TRIGGER_SELECTOR))
  const panels = Array.from(root.querySelectorAll<HTMLElement>(TABS_PANEL_SELECTOR))
  if (!triggers.length || !panels.length) {
    return null
  }
  return { triggers, panels }
}

function isSameStructure(previous: TabsStructure, next: TabsStructure): boolean {
  if (previous.triggers.length !== next.triggers.length || previous.panels.length !== next.panels.length) {
    return false
  }
  for (let index = 0; index < previous.triggers.length; index += 1) {
    if (previous.triggers[index] !== next.triggers[index]) {
      return false
    }
  }
  for (let index = 0; index < previous.panels.length; index += 1) {
    if (previous.panels[index] !== next.panels[index]) {
      return false
    }
  }
  return true
}

function scheduleScan(scope: ParentNode): void {
  pendingScanScopes.add(scope)
  if (scanFlushScheduled) {
    return
  }
  scanFlushScheduled = true
  enqueueMicrotask(flushPendingScans)
}

function flushPendingScans(): void {
  scanFlushScheduled = false
  const scopes = Array.from(pendingScanScopes)
  pendingScanScopes.clear()
  scopes.forEach((scope) => {
    if (scope instanceof Element && !scope.isConnected) {
      return
    }
    if (scope instanceof DocumentFragment && !scope.isConnected) {
      return
    }
    scan(scope)
  })
}

function scheduleRemovedCleanup(node: Node): void {
  const roots = collectTabsRoots(node)
  if (!roots.length) {
    return
  }
  roots.forEach((root) => pendingRemovedRoots.add(root))
  if (removedCleanupScheduled) {
    return
  }
  removedCleanupScheduled = true
  enqueueMicrotask(flushRemovedRoots)
}

function flushRemovedRoots(): void {
  removedCleanupScheduled = false
  const roots = Array.from(pendingRemovedRoots)
  pendingRemovedRoots.clear()
  roots.forEach((root) => {
    if (!root.isConnected) {
      registry.get(root)?.()
      structureRegistry.delete(root)
    }
  })
}

function collectTabsRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(TABS_ROOT_SELECTOR)) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(TABS_ROOT_SELECTOR).forEach((root) => roots.push(root))
  }
  return roots
}

function hasTabsRoot(scope: ParentNode): boolean {
  if (scope instanceof Element && scope.matches(TABS_ROOT_SELECTOR)) {
    return true
  }
  return scope.querySelector(TABS_ROOT_SELECTOR) !== null
}

function enqueueMicrotask(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task)
    return
  }
  Promise.resolve().then(task)
}
