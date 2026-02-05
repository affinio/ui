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

const registry = new WeakMap<RootEl, Cleanup>()

export function bootstrapAffinoTabs(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
}

export function hydrateTabs(root: RootEl): void {
  const triggers = Array.from(root.querySelectorAll<HTMLElement>("[data-affino-tabs-trigger]"))
  const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-affino-tabs-content]"))
  if (triggers.length === 0 || panels.length === 0) {
    return
  }

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
  })
}

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches("[data-affino-tabs-root]")) {
    hydrateTabs(node as RootEl)
  }
  node.querySelectorAll<RootEl>("[data-affino-tabs-root]").forEach((root) => {
    hydrateTabs(root)
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
          scan(node)
        }
      })
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scope[key] = observer
}
