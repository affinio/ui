type LivewireComponent = {
  call: (method: string, ...args: unknown[]) => void
}

type LivewireBridgeOptions = {
  root?: Document | HTMLElement
  ownerAttribute?: string
  methodAttribute?: string
  argAttribute?: string
  argsAttribute?: string
}

const DEFAULTS = {
  ownerAttribute: "data-affino-livewire-owner",
  methodAttribute: "data-affino-livewire-call",
  argAttribute: "data-affino-livewire-arg",
  argsAttribute: "data-affino-livewire-args",
}

function getLivewireComponent(owner: string): LivewireComponent | null {
  const scope = typeof window !== "undefined" ? (window as unknown as { Livewire?: { find?: (id: string) => LivewireComponent } }) : null
  return scope?.Livewire?.find?.(owner) ?? null
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
  const selector = `[${ownerAttribute}][${methodAttribute}]`

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null
    if (!target) {
      return
    }

    const owner = target.getAttribute(ownerAttribute)
    const method = target.getAttribute(methodAttribute)
    if (!owner || !method) {
      return
    }

    const component = getLivewireComponent(owner)
    if (!component) {
      return
    }

    const argsRaw = target.getAttribute(argsAttribute)
    const arg = target.getAttribute(argAttribute)

    if (argsRaw) {
      try {
        const parsed = JSON.parse(argsRaw)
        const args = Array.isArray(parsed) ? parsed : [parsed]
        component.call(method, ...args)
        return
      } catch (error) {
        console.warn("Affino Livewire action bridge: invalid JSON args", error)
        return
      }
    }

    if (arg !== null) {
      component.call(method, arg)
      return
    }

    component.call(method)
  })
}
