import {
  activateListboxIndex,
  createListboxState,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"
import type { ComboboxMode, InputEl, OptionEl, RootEl, SurfaceEl } from "./types"

export function collectOptions(scope: ParentNode): OptionEl[] {
  return Array.from(scope.querySelectorAll<OptionEl>("[data-affino-listbox-option]"))
}

export function applyInputAria(input: InputEl, surface: SurfaceEl, open: boolean, mode: ComboboxMode): void {
  input.setAttribute("role", "combobox")
  input.setAttribute("aria-autocomplete", "list")
  input.setAttribute("aria-haspopup", "listbox")
  input.setAttribute("aria-expanded", open ? "true" : "false")
  if (!surface.id) {
    surface.id = generateId("affino-combobox-surface")
  }
  surface.dataset.affinoComboboxSurface = surface.id
  input.setAttribute("aria-controls", surface.id)
  surface.setAttribute("role", "listbox")
  if (!surface.hasAttribute("tabindex")) {
    surface.tabIndex = -1
  }
  if (mode === "multiple") {
    surface.setAttribute("aria-multiselectable", "true")
  } else {
    surface.removeAttribute("aria-multiselectable")
  }
}

export function primeStateFromDom(options: OptionEl[], context: ListboxContext): ListboxState {
  let state = createListboxState()
  options.forEach((option, index) => {
    if (option.dataset.affinoListboxOptionSelected === "true") {
      state = activateListboxIndex({
        state,
        context,
        index,
        toggle: state.selection.ranges.length > 0,
      })
    }
  })
  return state
}

export function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}

export function resolveMode(value?: string): ComboboxMode {
  return value === "multiple" ? "multiple" : "single"
}

export function linearSelectionsEqual(a: ListboxState["selection"], b: ListboxState["selection"]): boolean {
  if (a === b) {
    return true
  }
  if (a.activeRangeIndex !== b.activeRangeIndex) {
    return false
  }
  if (a.anchor !== b.anchor || a.focus !== b.focus) {
    return false
  }
  if (a.ranges.length !== b.ranges.length) {
    return false
  }
  for (let index = 0; index < a.ranges.length; index += 1) {
    const rangeA = a.ranges[index]
    const rangeB = b.ranges[index]
    if (!rangeA || !rangeB) {
      continue
    }
    if (rangeA.start !== rangeB.start || rangeA.end !== rangeB.end) {
      return false
    }
  }
  return true
}

export function normalizeFilter(value: string): string {
  return value.trim().toLowerCase()
}

export function optionMatches(option: OptionEl, normalizedQuery: string): boolean {
  const label = option.dataset.affinoListboxLabel ?? option.textContent ?? ""
  return label.toLowerCase().includes(normalizedQuery)
}

export function isOptionDisabled(option?: OptionEl): boolean {
  if (!option) {
    return true
  }
  if (option.hidden) {
    return true
  }
  if (option.dataset.affinoListboxDisabled === "true") {
    return true
  }
  if (option.dataset.affinoComboboxHidden === "true") {
    return true
  }
  return false
}

export function ensureOptionId(option: OptionEl, rootId?: string): string {
  if (option.id) {
    return option.id
  }
  const value = option.dataset.affinoListboxValue
  if (value && rootId) {
    const escaped = escapeIdentifier(value)
    const stableId = `affino-combobox-option-${escapeIdentifier(rootId)}-${escaped}`
    option.id = stableId
    return stableId
  }
  const generated = generateId("affino-combobox-option")
  option.id = generated
  return generated
}

export function escapeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `-${char.charCodeAt(0).toString(16)}-`)
}

export function shouldIgnoreOutsideEvent(rootId: string, target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false
  }
  const sticky = target.closest<HTMLElement>("[data-affino-combobox-sticky]")
  if (!sticky) {
    return false
  }
  const attr = sticky.getAttribute("data-affino-combobox-sticky")?.trim()
  if (!attr) {
    return true
  }
  if (!rootId) {
    return false
  }
  const candidates = attr
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  return candidates.includes(rootId)
}

export function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}

export function generateComboboxOverlayId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `affino-combobox-${Math.random().toString(36).slice(2)}`
}

export type StructureCache = {
  input: InputEl
  surface: SurfaceEl
  optionCount: number
}

// Cache invalidation rules: rehydrate only when identity of key nodes changes or
// option cardinality changes. Text/content updates should not invalidate cache.
export function hasStructureChanged(root: RootEl, cache: StructureCache): boolean {
  const nextInput = root.querySelector<InputEl>("[data-affino-combobox-input]")
  const nextSurface = root.querySelector<SurfaceEl>("[data-affino-combobox-surface]")
  if (!nextInput || !nextSurface) {
    return true
  }
  if (nextInput !== cache.input || nextSurface !== cache.surface) {
    return true
  }
  const nextOptionCount = nextSurface.querySelectorAll("[data-affino-listbox-option]").length
  return nextOptionCount !== cache.optionCount
}

export const testing = {
  readBoolean,
  resolveMode,
  normalizeFilter,
  optionMatches,
  escapeIdentifier,
  hasStructureChanged,
}
