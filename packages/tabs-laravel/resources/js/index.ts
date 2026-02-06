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
  }
  affinoTabs?: TabsHandle
}

type Cleanup = () => void

type TabsStructure = {
  triggers: HTMLElement[]
  panels: HTMLElement[]
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

  const core = new TabsCore<string>(root.dataset.affinoTabsDefaultValue ?? null)
  const subscription = core.subscribe((state) => {
    const value = state.value
    root.dataset.affinoTabsValue = value ?? ""
    root.dataset.affinoTabsState = value ? "open" : "closed"
    triggers.forEach((trigger) => {
      const triggerValue = trigger.dataset.affinoTabsValue ?? ""
      const active = value != null && triggerValue === value
      trigger.setAttribute("aria-selected", active ? "true" : "false")
      trigger.dataset.state = active ? "active" : "inactive"
    })
    panels.forEach((panel) => {
      const panelValue = panel.dataset.affinoTabsValue ?? ""
      const active = value != null && panelValue === value
      panel.hidden = !active
      panel.dataset.state = active ? "active" : "inactive"
    })
  })

  const listeners = triggers.map((trigger) => {
    const onClick = () => {
      const value = trigger.dataset.affinoTabsValue ?? ""
      if (value) {
        core.select(value)
      }
    }
    trigger.addEventListener("click", onClick)
    return () => trigger.removeEventListener("click", onClick)
  })

  root.affinoTabs = {
    select: (value: string) => core.select(value),
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
