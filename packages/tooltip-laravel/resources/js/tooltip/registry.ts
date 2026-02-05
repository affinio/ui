import type { TooltipReason } from "@affino/tooltip-core"
import type { Cleanup, RootEl } from "./types"

export const registry = new WeakMap<RootEl, Cleanup>()
export const structureRegistry = new WeakMap<RootEl, { trigger: HTMLElement; surface: HTMLElement }>()

const activeByDocument = new WeakMap<Document, RootEl | null>()

export const focusedTooltipIds = new Set<string>()
export const focusRestorers = new Map<string, () => void>()

export function getActiveTooltipRoot(ownerDocument: Document): RootEl | null {
  return activeByDocument.get(ownerDocument) ?? null
}

export function setActiveTooltipRoot(ownerDocument: Document, root: RootEl | null): void {
  activeByDocument.set(ownerDocument, root)
}

export function closeTooltipRoot(root: RootEl, reason: TooltipReason = "programmatic"): void {
  const handle = root.affinoTooltip
  if (handle) {
    handle.close(reason)
  }
  const ownerDocument = root.ownerDocument ?? document
  if (getActiveTooltipRoot(ownerDocument) === root) {
    setActiveTooltipRoot(ownerDocument, null)
  }
}

export function clearTrackedFocus(): void {
  focusedTooltipIds.clear()
  focusRestorers.clear()
}
