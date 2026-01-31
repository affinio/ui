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

  return {
    activate: () => {
      if (!isBrowser()) return
      previousActive = getActiveElement()
      focusWithRetry(() => resolveElement(options.initialFocus) ?? resolveElement(options.dialog))
    },
    deactivate: () => {
      if (!isBrowser()) return
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

function focusWithRetry(resolveTarget: () => HTMLElement | null, attempts = 3): void {
  if (!attempts) return
  const target = resolveTarget()
  if (focusElement(target)) {
    return
  }
  if (!isBrowser()) return
  queueMicrotask(() => focusWithRetry(resolveTarget, attempts - 1))
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
