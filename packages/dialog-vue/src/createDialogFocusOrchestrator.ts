import { isRef, unref } from "vue"
import type { Ref } from "vue"
import type { DialogFocusOrchestrator } from "@affino/dialog-core"

export type MaybeElementAccessor =
  | Ref<HTMLElement | null | undefined>
  | (() => HTMLElement | null | undefined)
  | HTMLElement
  | null
  | undefined

export interface DialogFocusOrchestratorOptions {
  dialog: MaybeElementAccessor
  initialFocus?: MaybeElementAccessor
  returnFocus?: MaybeElementAccessor
}

export function createDialogFocusOrchestrator(
  options: DialogFocusOrchestratorOptions
): DialogFocusOrchestrator {
  let previousActive: HTMLElement | null = null
  let focusGeneration = 0

  return {
    activate: () => {
      if (!isBrowser()) return
      const generation = ++focusGeneration
      previousActive = getActiveElement()
      focusWithRetry(() => resolveElement(options.initialFocus) ?? resolveElement(options.dialog), 3, () => generation === focusGeneration)
    },
    deactivate: () => {
      if (!isBrowser()) return
      focusGeneration += 1
      const fallback = resolveElement(options.dialog)
      const preferred = resolveElement(options.returnFocus)
      const target = preferred ?? previousActive ?? fallback
      focusElement(target)
      previousActive = null
    },
  }
}

function resolveElement(source?: MaybeElementAccessor): HTMLElement | null {
  if (!source) {
    return null
  }
  if (typeof source === "function") {
    return source() ?? null
  }
  if (isRef(source)) {
    return (unref(source as Ref<HTMLElement | null | undefined>) ?? null) as HTMLElement | null
  }
  return source ?? null
}

function focusWithRetry(resolveTarget: () => HTMLElement | null, attempts = 3, isCurrent = () => true): void {
  if (!attempts) return
  if (!isCurrent()) return
  const target = resolveTarget()
  if (focusElement(target)) {
    return
  }
  if (!isBrowser()) return
  queueMicrotask(() => focusWithRetry(resolveTarget, attempts - 1, isCurrent))
}

function focusElement(element: HTMLElement | null | undefined): boolean {
  if (!element) return false
  if (!isBrowser()) return false
  if (typeof element.focus !== "function") return false
  if ("isConnected" in element && !element.isConnected) return false
  element.focus({ preventScroll: true })
  return true
}

function getActiveElement(): HTMLElement | null {
  if (!isBrowser()) return null
  const active = document.activeElement
  return active instanceof HTMLElement ? active : null
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}
