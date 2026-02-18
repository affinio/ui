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
  resetScopeAttribute?: string
}

const DEFAULTS = {
  ownerAttribute: "data-affino-livewire-owner",
  methodAttribute: "data-affino-livewire-call",
  argAttribute: "data-affino-livewire-arg",
  argsAttribute: "data-affino-livewire-args",
  modelAttribute: "data-affino-livewire-model",
  modelEventAttribute: "data-affino-livewire-model-event",
  resetScopeAttribute: "data-affino-livewire-reset-scope",
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
  const resetScopeAttribute = options.resetScopeAttribute ?? DEFAULTS.resetScopeAttribute
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
        maybeResetInputs(target, resetScopeAttribute, ownerAttribute)
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
      maybeResetInputs(target, resetScopeAttribute, ownerAttribute)
      return
    }

    if (!invokeComponentMethod(component, method, [])) {
      console.warn("Affino Livewire action bridge: unsupported call API", { owner, method })
    }
    maybeResetInputs(target, resetScopeAttribute, ownerAttribute)
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

function maybeResetInputs(trigger: Element, resetScopeAttribute: string, ownerAttribute: string): void {
  const scopeSelector = trigger.getAttribute(resetScopeAttribute)?.trim()
  if (!scopeSelector) {
    return
  }
  const ownerId = trigger.getAttribute(ownerAttribute)?.trim()
  const scopes: HTMLElement[] = []
  const scope = trigger.closest<HTMLElement>(scopeSelector)
  if (scope) {
    scopes.push(scope)
  }
  if (typeof document !== "undefined") {
    if (ownerId) {
      const ownerScopeSelector = `${scopeSelector} [${ownerAttribute}="${ownerId}"]`
      const ownerTargets = Array.from(document.querySelectorAll<HTMLElement>(ownerScopeSelector))
      ownerTargets.forEach((target) => {
        const ownerScope = target.closest<HTMLElement>(scopeSelector)
        if (ownerScope && !scopes.includes(ownerScope)) {
          scopes.push(ownerScope)
        }
      })
      const ownerFields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        `${scopeSelector} input[${ownerAttribute}="${ownerId}"], ${scopeSelector} textarea[${ownerAttribute}="${ownerId}"]`,
      )
      clearFields(ownerFields)
    }
  }
  scopes.forEach((targetScope) => {
    const fields = targetScope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")
    clearFields(fields)
  })
}

function clearFields(fields: NodeListOf<HTMLInputElement | HTMLTextAreaElement>): void {
  fields.forEach((field) => {
    if (field instanceof HTMLInputElement) {
      const type = field.type.toLowerCase()
      if (type === "checkbox" || type === "radio") {
        field.checked = false
      } else {
        field.value = ""
      }
    } else {
      field.value = ""
    }
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  })
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
  let result = ""
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    const char = value.charAt(index)
    const isDigit = codePoint >= 48 && codePoint <= 57
    const isUpper = codePoint >= 65 && codePoint <= 90
    const isLower = codePoint >= 97 && codePoint <= 122
    const isAsciiAlphaNum = isDigit || isUpper || isLower
    const isAllowedPunctuation = char === "-" || char === "_"
    const isControl = codePoint === 0 || (codePoint >= 1 && codePoint <= 31) || codePoint === 127

    if (isControl) {
      const escapedCode = codePoint === 0 ? "fffd" : codePoint.toString(16)
      result += `\\${escapedCode} `
      continue
    }

    if ((index === 0 && isDigit) || (index === 1 && isDigit && value.charAt(0) === "-")) {
      result += `\\${codePoint.toString(16)} `
      continue
    }

    if (index === 0 && char === "-" && value.length === 1) {
      result += "\\-"
      continue
    }

    if (isAsciiAlphaNum || isAllowedPunctuation || codePoint >= 128) {
      result += char
      continue
    }

    result += `\\${char}`
  }

  return result
}
