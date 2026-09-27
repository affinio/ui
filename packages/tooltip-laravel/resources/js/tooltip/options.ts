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
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function resolvePlacement(value?: string): "top" | "bottom" | "left" | "right" {
  return value === "bottom" || value === "left" || value === "right" ? value : "top"
}

export function resolveAlignment(value?: string): "start" | "center" | "end" {
  return value === "start" || value === "end" ? value : "center"
}

export function resolveCSSPosition(value?: string): "fixed" | "absolute" {
  return value === "absolute" ? "absolute" : "fixed"
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
