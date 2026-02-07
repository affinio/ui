import type { PopoverArrowOptions, PopoverContentOptions, PositionOptions } from "@affino/popover-core"
import type { PopoverOptions, RootEl } from "./types"

export function resolveOptions(root: RootEl): PopoverOptions {
  return {
    placement: resolvePlacement(root.dataset.affinoPopoverPlacement),
    align: resolveAlign(root.dataset.affinoPopoverAlign),
    gutter: readNonNegativeNumber(root.dataset.affinoPopoverGutter, 12),
    viewportPadding: readNonNegativeNumber(root.dataset.affinoPopoverViewportPadding, 20),
    strategy: resolveStrategy(root.dataset.affinoPopoverStrategy),
    role: resolveRole(root.dataset.affinoPopoverRole),
    modal: readBoolean(root.dataset.affinoPopoverModal, false),
    closeOnEscape: readBoolean(root.dataset.affinoPopoverCloseEscape, true),
    closeOnInteractOutside: readBoolean(root.dataset.affinoPopoverCloseOutside, true),
    returnFocus: readBoolean(root.dataset.affinoPopoverReturnFocus, true),
    lockScroll: readBoolean(root.dataset.affinoPopoverLockScroll, false),
    arrow: resolveArrowOptions(root),
    pinned: readBoolean(root.dataset.affinoPopoverPinned, false),
    defaultOpen: readBoolean(root.dataset.affinoPopoverDefaultOpen, false),
    teleportTarget: resolveTeleportTarget(root.dataset.affinoPopoverTeleport),
  }
}

function resolveArrowOptions(root: RootEl): PopoverArrowOptions | null {
  const size = readOptionalNumber(root.dataset.affinoPopoverArrowSize)
  const inset = readOptionalNumber(root.dataset.affinoPopoverArrowInset)
  const offset = readOptionalNumber(root.dataset.affinoPopoverArrowOffset)
  const normalizedSize = typeof size === "number" ? Math.max(1, size) : undefined
  const normalizedInset = typeof inset === "number" ? Math.max(0, inset) : undefined
  const normalizedOffset = typeof offset === "number" ? offset : undefined
  if (
    normalizedSize === undefined &&
    normalizedInset === undefined &&
    normalizedOffset === undefined
  ) {
    return null
  }
  return {
    size: normalizedSize,
    inset: normalizedInset,
    staticOffset: normalizedOffset,
  }
}

function resolveStrategy(strategy?: string): "fixed" | "absolute" {
  return strategy === "absolute" ? "absolute" : "fixed"
}

function resolveTeleportTarget(value?: string): string | null {
  const candidate = value?.trim()
  if (!candidate || candidate === "inline") {
    return null
  }
  if (candidate === "body") {
    return "body"
  }
  return candidate
}

function resolvePlacement(value?: string): NonNullable<PositionOptions["placement"]> {
  switch (value) {
    case "left":
    case "right":
    case "top":
    case "bottom":
    case "auto":
      return value
    default:
      return "bottom"
  }
}

function resolveAlign(value?: string): NonNullable<PositionOptions["align"]> {
  switch (value) {
    case "start":
    case "center":
    case "end":
    case "auto":
      return value
    default:
      return "center"
  }
}

function resolveRole(value?: string): NonNullable<PopoverContentOptions["role"]> {
  switch (value) {
    case "dialog":
    case "menu":
    case "listbox":
    case "tree":
    case "grid":
    case "region":
      return value
    default:
      return "dialog"
  }
}

function readOptionalNumber(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readNonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = readOptionalNumber(value)
  if (parsed === undefined) {
    return fallback
  }
  return Math.max(parsed, 0)
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
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
