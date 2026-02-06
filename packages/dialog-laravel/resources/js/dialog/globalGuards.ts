import { acquireDocumentScrollLock, getDocumentOverlayManager, releaseDocumentScrollLock } from "@affino/overlay-kernel"
import { createGlobalKeydownManager } from "@affino/overlay-host"
import { trapFocus } from "@affino/focus-utils"
import type { DialogBinding } from "./types"
import type { OverlayRegistration, OverlayRegistrar } from "@affino/dialog-core"

type ExtendedOverlayRegistrar = OverlayRegistrar & {
  getTopMostId: () => string | null
  hasEntries: () => boolean
}

const overlayBindings = new Map<string, DialogBinding>()
const keydownManager = createGlobalKeydownManager(handleGlobalKeydown)
const globalOverlayRegistrar: ExtendedOverlayRegistrar = createGlobalOverlayRegistrar()

function registerBinding(binding: DialogBinding): void {
  overlayBindings.set(binding.overlayId, binding)
}

function unregisterBinding(binding: DialogBinding): void {
  if (overlayBindings.get(binding.overlayId) === binding) {
    overlayBindings.delete(binding.overlayId)
  }
}

function acquireScrollLock(ownerDocument: Document): void {
  acquireDocumentScrollLock(ownerDocument, "dialog")
}

function releaseScrollLock(ownerDocument: Document): void {
  releaseDocumentScrollLock(ownerDocument, "dialog")
}

function ensureGlobalGuardsActive(): void {
  if (!keydownManager.isActive()) {
    keydownManager.activate()
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const topEntry = getTopMostBinding(event)
  if (!topEntry) {
    return
  }
  if (event.key === "Escape") {
    if (!topEntry.options.closeOnEscape) {
      return
    }
    event.preventDefault()
    topEntry.controller.close("escape-key")
    return
  }
  if (event.key === "Tab") {
    if (!topEntry.options.modal) {
      return
    }
    if (!topEntry.surface.contains(event.target as Node)) {
      return
    }
    trapFocus(event, topEntry.surface)
  }
}

function getTopMostBinding(event: KeyboardEvent): DialogBinding | null {
  const ownerDocument = resolveEventDocument(event)
  const managerBinding = resolveTopMostBindingFromManager(ownerDocument)
  if (managerBinding) {
    return managerBinding
  }

  const seenDocuments = new Set<Document>()
  seenDocuments.add(ownerDocument)
  for (const binding of overlayBindings.values()) {
    const candidateDocument = binding.root.ownerDocument
    if (!candidateDocument || seenDocuments.has(candidateDocument)) {
      continue
    }
    seenDocuments.add(candidateDocument)
    const candidate = resolveTopMostBindingFromManager(candidateDocument)
    if (candidate) {
      return candidate
    }
  }

  const topId = globalOverlayRegistrar.getTopMostId()
  if (!topId) {
    return null
  }
  const candidate = overlayBindings.get(topId)
  if (!candidate) {
    return null
  }
  return isBindingVisible(candidate) ? candidate : null
}

function resolveTopMostBindingFromManager(ownerDocument: Document): DialogBinding | null {
  const manager = getDocumentOverlayManager(ownerDocument)
  const stack = manager.getStack()
  if (!stack.length) {
    return null
  }
  const topEntry = stack[stack.length - 1]
  if (!topEntry) {
    return null
  }
  const candidate = overlayBindings.get(topEntry.id)
  if (!candidate) {
    return null
  }
  return isBindingVisible(candidate) ? candidate : null
}

function resolveEventDocument(event: KeyboardEvent): Document {
  const target = event.target
  if (target instanceof Node && target.ownerDocument) {
    return target.ownerDocument
  }
  return document
}

function isBindingVisible(binding: DialogBinding): boolean {
  const snapshot = binding.controller.snapshot
  const visible =
    snapshot.isOpen || snapshot.phase === "opening" || snapshot.phase === "closing" || snapshot.optimisticCloseInFlight
  return visible
}

function createGlobalOverlayRegistrar(): ExtendedOverlayRegistrar {
  let stack: OverlayRegistration[] = []
  const syncGuardState = () => {
    if (stack.length) {
      ensureGlobalGuardsActive()
      return
    }
    if (keydownManager.isActive()) {
      keydownManager.deactivate()
    }
  }
  return {
    register(registration: OverlayRegistration) {
      stack = [...stack.filter((entry) => entry.id !== registration.id), registration]
      syncGuardState()
      return () => {
        stack = stack.filter((entry) => entry.id !== registration.id)
        syncGuardState()
      }
    },
    isTopMost(id: string) {
      if (!stack.length) {
        return false
      }
      return stack[stack.length - 1]?.id === id
    },
    getTopMostId() {
      if (!stack.length) {
        return null
      }
      return stack[stack.length - 1]?.id ?? null
    },
    hasEntries() {
      return stack.length > 0
    },
  }
}

export {
  registerBinding,
  unregisterBinding,
  acquireScrollLock,
  releaseScrollLock,
  ensureGlobalGuardsActive,
  globalOverlayRegistrar,
}
export type { ExtendedOverlayRegistrar }
