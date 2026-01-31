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
      const target = resolveElement(options.initialFocus) ?? resolveElement(options.dialog)
      focusElement(target)
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

function focusElement(element: HTMLElement | null | undefined): void {
  if (!element) return
  if (!isBrowser()) return
  if (typeof element.focus !== "function") return
  if ("isConnected" in element && !element.isConnected) return
  element.focus({ preventScroll: true })
}

function getActiveElement(): HTMLElement | null {
  if (!isBrowser()) return null
  const active = document.activeElement
  return active instanceof HTMLElement ? active : null
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}
