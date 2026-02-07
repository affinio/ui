import { DisclosureCore, type DisclosureState } from "@affino/disclosure-core"

type DisclosureHandle = {
  open: () => void
  close: () => void
  toggle: () => void
  getSnapshot: () => DisclosureState
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoDisclosureRoot?: string
    affinoDisclosureDefaultOpen?: string
  }
  affinoDisclosure?: DisclosureHandle
}

type Cleanup = () => void

const registry = new WeakMap<RootEl, Cleanup>()
const structureRegistry = new WeakMap<RootEl, { trigger: HTMLElement; content: HTMLElement }>()
const openStateRegistry = new Map<string, boolean>()

export function bootstrapAffinoDisclosure(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
}

export function hydrateDisclosure(root: RootEl): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-disclosure-trigger]")
  const content = root.querySelector<HTMLElement>("[data-affino-disclosure-content]")
  if (!trigger || !content) {
    return
  }

  const previous = structureRegistry.get(root)
  if (registry.has(root) && previous && previous.trigger === trigger && previous.content === content) {
    return
  }

  registry.get(root)?.()

  const rootId = root.dataset.affinoDisclosureRoot?.trim() ?? ""
  const persistedOpen = rootId ? openStateRegistry.get(rootId) : undefined
  const defaultOpen = readBoolean(root.dataset.affinoDisclosureDefaultOpen, false)
  const core = new DisclosureCore(typeof persistedOpen === "boolean" ? persistedOpen : defaultOpen)
  const applyState = (state: DisclosureState) => {
    const nextState = state.open ? "open" : "closed"
    const nextHidden = !state.open

    if (content.hidden !== nextHidden) {
      content.hidden = nextHidden
    }
    if (content.dataset.state !== nextState) {
      content.dataset.state = nextState
    }
    if (root.dataset.affinoDisclosureState !== nextState) {
      root.dataset.affinoDisclosureState = nextState
    }
    if (rootId && openStateRegistry.get(rootId) !== state.open) {
      openStateRegistry.set(rootId, state.open)
    }
  }
  const subscription = core.subscribe((state) => {
    applyState(state)
  })

  const onClick = () => core.toggle()
  trigger.addEventListener("click", onClick)

  root.affinoDisclosure = {
    open: () => core.open(),
    close: () => core.close(),
    toggle: () => core.toggle(),
    getSnapshot: () => core.getSnapshot(),
  }

  const observer = new MutationObserver(() => {
    const nextTrigger = root.querySelector<HTMLElement>("[data-affino-disclosure-trigger]")
    const nextContent = root.querySelector<HTMLElement>("[data-affino-disclosure-content]")
    if (!nextTrigger || !nextContent) {
      return
    }
    if (nextTrigger !== trigger || nextContent !== content) {
      hydrateDisclosure(root)
    }
  })
  observer.observe(root, { childList: true, subtree: true })

  const stateObserver = new MutationObserver(() => {
    applyState(core.getSnapshot())
  })
  stateObserver.observe(content, { attributes: true, attributeFilter: ["hidden", "data-state"] })

  registry.set(root, () => {
    trigger.removeEventListener("click", onClick)
    observer.disconnect()
    stateObserver.disconnect()
    subscription.unsubscribe()
    core.destroy()
    if (root.affinoDisclosure) {
      delete root.affinoDisclosure
    }
    registry.delete(root)
    structureRegistry.delete(root)
  })

  structureRegistry.set(root, { trigger, content })
}

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches("[data-affino-disclosure-root]")) {
    hydrateDisclosure(node as RootEl)
  }
  node.querySelectorAll<RootEl>("[data-affino-disclosure-root]").forEach((root) => {
    hydrateDisclosure(root)
  })
}

function setupMutationObserver(): void {
  if (typeof window === "undefined") {
    return
  }
  const scope = window as unknown as Record<string, unknown>
  const key = "__affinoDisclosureObserver"
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

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}
