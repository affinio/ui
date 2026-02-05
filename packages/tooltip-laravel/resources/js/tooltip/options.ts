import type { RootEl, TriggerMode } from "./types"

const DEFAULT_TRIGGER_MODE: TriggerMode = "hover-focus"
const ALLOWED_TRIGGER_MODES = new Set<TriggerMode>(["hover", "focus", "hover-focus", "click", "manual"])

export function resolveTriggerMode(value?: string): TriggerMode {
  if (!value) {
    return DEFAULT_TRIGGER_MODE
  }

  const normalized = value.toLowerCase() as TriggerMode
  return ALLOWED_TRIGGER_MODES.has(normalized) ? normalized : DEFAULT_TRIGGER_MODE
}

export function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function isFocusMode(mode: TriggerMode): boolean {
  return mode === "focus" || mode === "hover-focus"
}

export function isPinnedTooltip(root: RootEl): boolean {
  return root.dataset.affinoTooltipPinned === "true"
}

export function isManualTooltip(root: RootEl): boolean {
  return resolveTriggerMode(root.dataset.affinoTooltipTriggerMode) === "manual"
}

export function isPersistentTooltip(root: RootEl): boolean {
  return isPinnedTooltip(root) || isManualTooltip(root)
}
