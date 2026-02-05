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

  registry.get(root)?.()

  const core = new DisclosureCore(readBoolean(root.dataset.affinoDisclosureDefaultOpen, false))
  const subscription = core.subscribe((state) => {
    content.hidden = !state.open
    content.dataset.state = state.open ? "open" : "closed"
    root.dataset.affinoDisclosureState = state.open ? "open" : "closed"
  })

  const onClick = () => core.toggle()
  trigger.addEventListener("click", onClick)

  root.affinoDisclosure = {
    open: () => core.open(),
    close: () => core.close(),
    toggle: () => core.toggle(),
    getSnapshot: () => core.getSnapshot(),
  }

  registry.set(root, () => {
    trigger.removeEventListener("click", onClick)
    subscription.unsubscribe()
    core.destroy()
    if (root.affinoDisclosure) {
      delete root.affinoDisclosure
    }
    registry.delete(root)
  })
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
