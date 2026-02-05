import type { RootCleanup, RootEl } from "./types"

export const registry = new WeakMap<RootEl, RootCleanup>()
export const arrowStyleRegistry = new WeakMap<HTMLElement, Set<string>>()
const activeByDocument = new WeakMap<Document, RootEl | null>()
export const structureRegistry = new WeakMap<RootEl, { trigger: HTMLElement; content: HTMLElement }>()

export function getActivePopoverRoot(ownerDocument: Document): RootEl | null {
  return activeByDocument.get(ownerDocument) ?? null
}

export function setActivePopoverRoot(ownerDocument: Document, root: RootEl | null): void {
  activeByDocument.set(ownerDocument, root)
}
