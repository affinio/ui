type LivewireComponent = {
  call: (method: string, ...args: unknown[]) => void
  set?: (property: string, value: unknown) => void
  $wire?: Record<string, unknown>
  $set?: (property: string, value: unknown) => void
  $call?: (method: string, ...args: unknown[]) => void
}

type LivewireRuntime = {
  find?: (id: string) => LivewireComponent | null
}

type LivewireBridgeOptions = {
  root?: Document | HTMLElement
  ownerAttribute?: string
  methodAttribute?: string
  argAttribute?: string
  argsAttribute?: string
  modelAttribute?: string
  modelEventAttribute?: string
}

const DEFAULTS = {
  ownerAttribute: "data-affino-livewire-owner",
  methodAttribute: "data-affino-livewire-call",
  argAttribute: "data-affino-livewire-arg",
  argsAttribute: "data-affino-livewire-args",
  modelAttribute: "data-affino-livewire-model",
  modelEventAttribute: "data-affino-livewire-model-event",
}

export function bindLivewireActionBridge(options: LivewireBridgeOptions = {}): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return
  }

  const root = options.root ?? document
  const ownerAttribute = options.ownerAttribute ?? DEFAULTS.ownerAttribute
  const methodAttribute = options.methodAttribute ?? DEFAULTS.methodAttribute
  const argAttribute = options.argAttribute ?? DEFAULTS.argAttribute
  const argsAttribute = options.argsAttribute ?? DEFAULTS.argsAttribute
  const modelAttribute = options.modelAttribute ?? DEFAULTS.modelAttribute
  const modelEventAttribute = options.modelEventAttribute ?? DEFAULTS.modelEventAttribute
  const selector = `[${methodAttribute}]`
  const modelSelector = `[${modelAttribute}]`

  root.addEventListener("click", (event) => {
    const eventTarget = resolveEventTargetElement(event.target)
    const target = eventTarget?.closest(selector) ?? null
    if (!target) {
      return
    }

    const method = target.getAttribute(methodAttribute)
    if (!method) {
      return
    }

    const owner = target.getAttribute(ownerAttribute)?.trim() ?? ""
    const component = resolveLivewireComponent(target, owner)
    if (!component) {
      console.warn("Affino Livewire action bridge: component not found", { owner, method })
      return
    }

    const argsRaw = target.getAttribute(argsAttribute)
    const arg = target.getAttribute(argAttribute)

    if (argsRaw) {
      try {
        const parsed = JSON.parse(argsRaw)
        const args = Array.isArray(parsed) ? parsed : [parsed]
        if (!invokeComponentMethod(component, method, args)) {
          console.warn("Affino Livewire action bridge: unsupported call API", { owner, method })
        }
        return
      } catch (error) {
        console.warn("Affino Livewire action bridge: invalid JSON args", error)
        return
      }
    }

    if (arg !== null) {
      if (!invokeComponentMethod(component, method, [arg])) {
        console.warn("Affino Livewire action bridge: unsupported call API", { owner, method })
      }
      return
    }

    if (!invokeComponentMethod(component, method, [])) {
      console.warn("Affino Livewire action bridge: unsupported call API", { owner, method })
    }
  }, true)

  const syncModelHandler = (event: Event) => {
    const eventTarget = resolveEventTargetElement(event.target)
    const target = eventTarget?.closest(modelSelector) ?? null
    if (!target) {
      return
    }

    const model = target.getAttribute(modelAttribute)?.trim() ?? ""
    if (!model) {
      return
    }

    const configuredEvent = target.getAttribute(modelEventAttribute)?.trim()
    if (configuredEvent && configuredEvent !== event.type) {
      return
    }

    const owner = target.getAttribute(ownerAttribute)?.trim() ?? ""
    const component = resolveLivewireComponent(target, owner)
    if (!component || !setComponentModel(component, model, readModelValue(target))) {
      console.warn("Affino Livewire action bridge: model owner not found", { owner, model })
      return
    }
  }

  root.addEventListener("input", syncModelHandler, true)
  root.addEventListener("change", syncModelHandler, true)
}

function resolveLivewireComponent(target: Element, explicitOwner: string): LivewireComponent | null {
  const livewire = resolveLivewireRuntime()
  if (!livewire?.find) {
    return null
  }

  if (explicitOwner) {
    const explicit = livewire.find(explicitOwner)
    if (explicit) {
      return explicit
    }
  }

  const inferredOwner = inferOwnerFromContext(target)
  if (!inferredOwner) {
    return null
  }
  return livewire.find(inferredOwner) ?? null
}

function invokeComponentMethod(component: LivewireComponent, method: string, args: unknown[]): boolean {
  if (typeof component.call === "function") {
    component.call(method, ...args)
    return true
  }
  if (typeof component.$call === "function") {
    component.$call(method, ...args)
    return true
  }
  const wire = component.$wire
  if (!wire) {
    return false
  }
  const wireMethod = wire[method]
  if (typeof wireMethod === "function") {
    ;(wireMethod as (...params: unknown[]) => unknown)(...args)
    return true
  }
  const wireCall = wire.$call
  if (typeof wireCall === "function") {
    ;(wireCall as (name: string, ...params: unknown[]) => unknown)(method, ...args)
    return true
  }
  return false
}

function setComponentModel(component: LivewireComponent, property: string, value: unknown): boolean {
  if (typeof component.set === "function") {
    component.set(property, value)
    return true
  }
  if (typeof component.$set === "function") {
    component.$set(property, value)
    return true
  }
  const wire = component.$wire
  if (!wire) {
    return false
  }
  const wireSet = wire.$set
  if (typeof wireSet === "function") {
    ;(wireSet as (name: string, next: unknown) => unknown)(property, value)
    return true
  }
  return false
}

function resolveLivewireRuntime(): LivewireRuntime | null {
  if (typeof window === "undefined") {
    return null
  }
  return (window as unknown as { Livewire?: LivewireRuntime }).Livewire ?? null
}

function inferOwnerFromContext(target: Element): string | null {
  const direct = findNearestWireId(target)
  if (direct) {
    return direct
  }

  const overlayOwnerCandidates: Array<{ ownerAttr: string; rootAttr: string }> = [
    { ownerAttr: "data-affino-dialog-owner", rootAttr: "data-affino-dialog-root" },
    { ownerAttr: "data-affino-popover-owner", rootAttr: "data-affino-popover-root" },
    { ownerAttr: "data-affino-menu-root-id", rootAttr: "data-affino-menu-root" },
  ]

  for (const candidate of overlayOwnerCandidates) {
    const ownerEl = target.closest<HTMLElement>(`[${candidate.ownerAttr}]`)
    const ownerId = ownerEl?.getAttribute(candidate.ownerAttr)?.trim()
    if (!ownerId) {
      continue
    }
    const roots = Array.from(
      document.querySelectorAll<HTMLElement>(`[${candidate.rootAttr}="${escapeAttributeValue(ownerId)}"]`),
    ).filter((root) => root.isConnected)
    for (const root of roots) {
      const owner = findNearestWireId(root)
      if (owner) {
        return owner
      }
    }
  }

  return null
}

function findNearestWireId(node: Element): string | null {
  let current: Element | null = node
  while (current) {
    const wireId = current.getAttribute("wire:id")?.trim()
    if (wireId) {
      return wireId
    }
    current = current.parentElement
  }
  return null
}

function resolveEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }
  if (target instanceof Node) {
    return target.parentElement
  }
  return null
}

function readModelValue(target: Element): unknown {
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase()
    if (type === "checkbox") {
      return target.checked
    }
    if (type === "radio") {
      return target.checked ? target.value : null
    }
    return target.value
  }

  if (target instanceof HTMLTextAreaElement) {
    return target.value
  }

  if (target instanceof HTMLSelectElement) {
    if (target.multiple) {
      return Array.from(target.selectedOptions).map((option) => option.value)
    }
    return target.value
  }

  return (target as HTMLElement).textContent ?? ""
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}
