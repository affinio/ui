import type { PopoverArrowOptions } from "@affino/popover-core"
import type { PopoverOptions, RootEl } from "./types"

export function resolveOptions(root: RootEl): PopoverOptions {
  return {
    placement: (root.dataset.affinoPopoverPlacement as any) ?? "bottom",
    align: (root.dataset.affinoPopoverAlign as any) ?? "center",
    gutter: readNumber(root.dataset.affinoPopoverGutter, 12),
    viewportPadding: readNumber(root.dataset.affinoPopoverViewportPadding, 20),
    strategy: resolveStrategy(root.dataset.affinoPopoverStrategy),
    role: (root.dataset.affinoPopoverRole as any) ?? "dialog",
    modal: readBoolean(root.dataset.affinoPopoverModal, false),
    closeOnEscape: readBoolean(root.dataset.affinoPopoverCloseEscape, true),
    closeOnInteractOutside: readBoolean(root.dataset.affinoPopoverCloseOutside, true),
    returnFocus: readBoolean(root.dataset.affinoPopoverReturnFocus, true),
    lockScroll: readBoolean(root.dataset.affinoPopoverLockScroll, false),
    arrow: resolveArrowOptions(root),
    pinned: readBoolean(root.dataset.affinoPopoverPinned, false),
    defaultOpen: readBoolean(root.dataset.affinoPopoverDefaultOpen, false),
  }
}

function resolveArrowOptions(root: RootEl): PopoverArrowOptions | null {
  const size = readNumber(root.dataset.affinoPopoverArrowSize, Number.NaN)
  const inset = readNumber(root.dataset.affinoPopoverArrowInset, Number.NaN)
  const offset = readNumber(root.dataset.affinoPopoverArrowOffset, Number.NaN)
  if (Number.isNaN(size) && Number.isNaN(inset) && Number.isNaN(offset)) {
    return null
  }
  return {
    size: Number.isNaN(size) ? undefined : size,
    inset: Number.isNaN(inset) ? undefined : inset,
    staticOffset: Number.isNaN(offset) ? undefined : offset,
  }
}

function resolveStrategy(strategy?: string): "fixed" | "absolute" {
  if (!strategy) {
    return "fixed"
  }
  return strategy === "absolute" ? "absolute" : "fixed"
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
