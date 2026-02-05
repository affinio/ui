import type { TooltipReason } from "@affino/tooltip-core"
import type { RootEl } from "./types"

let pointerGuardsBound = false
let pointerGuardTicking = false
let pointerIntentBound = false
let lastExternalPointerDown = 0
let pendingFocusSync = false

export function wasRecentExternalPointerDown(windowMs: number): boolean {
  return performance.now() - lastExternalPointerDown < windowMs
}

export function scheduleFocusSync(sync: () => void): void {
  if (pendingFocusSync) {
    return
  }

  pendingFocusSync = true
  requestAnimationFrame(() => {
    pendingFocusSync = false
    sync()
  })
}

export function setupPointerIntentTracker(options: {
  findOwningRoot(target: Element): RootEl | null
  isFocusedTooltipId(id: string): boolean
}): void {
  if (pointerIntentBound) {
    return
  }

  const recordPointerDown = (event: PointerEvent) => {
    const target = event.target
    if (target instanceof Element) {
      const owningRoot = options.findOwningRoot(target)
      if (owningRoot) {
        const id = owningRoot.dataset.affinoTooltipRoot
        if (id && options.isFocusedTooltipId(id)) {
          return
        }
      }
    }
    lastExternalPointerDown = performance.now()
  }

  document.addEventListener("pointerdown", recordPointerDown, true)
  pointerIntentBound = true
}

export function setupPointerGuards(options: {
  getActiveRoot(ownerDocument: Document): RootEl | null
  isGuardSkipped(root: RootEl): boolean
  closeRoot(root: RootEl, reason: TooltipReason): void
}): void {
  if (pointerGuardsBound) {
    return
  }

  const evaluatePointerMove = (target: EventTarget | null) => {
    const ownerDocument = target instanceof Node ? target.ownerDocument ?? document : document
    const activeTooltipRoot = options.getActiveRoot(ownerDocument)
    if (!activeTooltipRoot) {
      return
    }
    if (target instanceof Element) {
      const owningRoot = target.closest<RootEl>("[data-affino-tooltip-root]")
      if (owningRoot && owningRoot === activeTooltipRoot) {
        return
      }
    }
    maybeCloseActiveTooltip(ownerDocument, "pointer")
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerGuardTicking) {
      return
    }
    pointerGuardTicking = true
    const target = event.target
    requestAnimationFrame(() => {
      pointerGuardTicking = false
      evaluatePointerMove(target)
    })
  }

  const handleDocumentLeave = () => {
    maybeCloseActiveTooltip(document, "pointer")
  }

  const maybeCloseActiveTooltip = (ownerDocument: Document, reason: TooltipReason) => {
    const activeTooltipRoot = options.getActiveRoot(ownerDocument)
    if (!activeTooltipRoot) {
      return
    }

    if (options.isGuardSkipped(activeTooltipRoot)) {
      return
    }

    const activeElement = ownerDocument.activeElement
    if (activeElement instanceof Element && activeTooltipRoot.contains(activeElement)) {
      return
    }

    options.closeRoot(activeTooltipRoot, reason)
  }

  document.addEventListener("pointermove", handlePointerMove, { passive: true })
  document.addEventListener("mouseleave", handleDocumentLeave)
  window.addEventListener("blur", handleDocumentLeave)

  pointerGuardsBound = true
}
