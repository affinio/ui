import { createGlobalKeydownManager, createScrollLockController } from "@affino/overlay-host"
import { trapFocus } from "@affino/focus-utils"
import type { DialogBinding } from "./types"
import type { OverlayRegistration, OverlayRegistrar } from "@affino/dialog-core"

type ExtendedOverlayRegistrar = OverlayRegistrar & {
  getTopMostId: () => string | null
  hasEntries: () => boolean
}

const overlayBindings = new Map<string, DialogBinding>()
const scrollLocker = createScrollLockController()
const keydownManager = createGlobalKeydownManager(handleGlobalKeydown)
const globalOverlayRegistrar: ExtendedOverlayRegistrar = createGlobalOverlayRegistrar()
let scrollLockRefs = 0

function registerBinding(binding: DialogBinding): void {
  overlayBindings.set(binding.overlayId, binding)
}

function unregisterBinding(binding: DialogBinding): void {
  if (overlayBindings.get(binding.overlayId) === binding) {
    overlayBindings.delete(binding.overlayId)
  }
}

function acquireScrollLock(): void {
  if (scrollLockRefs === 0) {
    scrollLocker.lock()
  }
  scrollLockRefs += 1
}

function releaseScrollLock(): void {
  if (scrollLockRefs === 0) {
    return
  }
  scrollLockRefs -= 1
  if (scrollLockRefs === 0) {
    scrollLocker.unlock()
  }
}

function ensureGlobalGuardsActive(): void {
  if (!keydownManager.isActive()) {
    keydownManager.activate()
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const topEntry = getTopMostBinding()
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

function getTopMostBinding(): DialogBinding | null {
  const topId = globalOverlayRegistrar.getTopMostId()
  if (!topId) {
    return null
  }
  const candidate = overlayBindings.get(topId)
  if (!candidate) {
    return null
  }
  const snapshot = candidate.controller.snapshot
  const visible =
    snapshot.isOpen || snapshot.phase === "opening" || snapshot.phase === "closing" || snapshot.optimisticCloseInFlight
  return visible ? candidate : null
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
