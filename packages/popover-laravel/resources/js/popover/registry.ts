import type { RootCleanup, RootEl } from "./types"

export const registry = new WeakMap<RootEl, RootCleanup>()
export const arrowStyleRegistry = new WeakMap<HTMLElement, Set<string>>()
const activeByDocument = new WeakMap<Document, RootEl | null>()
export const structureRegistry = new WeakMap<RootEl, { trigger: HTMLElement; content: HTMLElement }>()
const popoverOwnersByDocument = new WeakMap<Document, Map<string, RootEl>>()

export function getActivePopoverRoot(ownerDocument: Document): RootEl | null {
  return activeByDocument.get(ownerDocument) ?? null
}

export function setActivePopoverRoot(ownerDocument: Document, root: RootEl | null): void {
  activeByDocument.set(ownerDocument, root)
}

export function claimPopoverOwner(ownerDocument: Document, overlayId: string, nextRoot: RootEl): RootEl | null {
  if (!overlayId) {
    return null
  }
  const owners = getPopoverOwners(ownerDocument)
  const existing = owners.get(overlayId) ?? null
  owners.set(overlayId, nextRoot)
  return existing && existing !== nextRoot ? existing : null
}

export function releasePopoverOwner(ownerDocument: Document, overlayId: string, root: RootEl): void {
  if (!overlayId) {
    return
  }
  const owners = popoverOwnersByDocument.get(ownerDocument)
  if (!owners) {
    return
  }
  if (owners.get(overlayId) === root) {
    owners.delete(overlayId)
  }
  if (!owners.size) {
    popoverOwnersByDocument.delete(ownerDocument)
  }
}

function getPopoverOwners(ownerDocument: Document): Map<string, RootEl> {
  const existing = popoverOwnersByDocument.get(ownerDocument)
  if (existing) {
    return existing
  }
  const created = new Map<string, RootEl>()
  popoverOwnersByDocument.set(ownerDocument, created)
  return created
}
