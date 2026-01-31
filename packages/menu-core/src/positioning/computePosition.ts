import type { Alignment, Placement, PositionOptions, PositionResult, Rect } from "../types"
import { ALIGNMENTS, clamp, crossAxis, sideAxis, SIDES } from "./geometry"
import type { Side } from "./geometry"

const DEFAULT_VIEWPORT = 10_000

type ResolvedPlacement = Exclude<Placement, "auto">
type ResolvedAlignment = Exclude<Alignment, "auto">

interface NormalizedOptions {
  gutter: number
  viewportPadding: number
  placement: Placement
  align: Alignment
  viewportWidth: number
  viewportHeight: number
}

export function computePosition(
  anchor: Rect,
  panel: Rect,
  options: PositionOptions = {}
): PositionResult {
  const config: NormalizedOptions = {
    gutter: options.gutter ?? 6,
    viewportPadding: options.viewportPadding ?? 8,
    placement: options.placement ?? "auto",
    align: options.align ?? "auto",
    viewportWidth: options.viewportWidth ?? DEFAULT_VIEWPORT,
    viewportHeight: options.viewportHeight ?? DEFAULT_VIEWPORT,
  }

  const candidateSides: Side[] = config.placement === "auto" ? [...SIDES] : [config.placement as Side]

  let best: {
    overflow: number
    left: number
    top: number
    placement: Side
    align: ResolvedAlignment
  } | null = null

  for (const side of candidateSides) {
    const alignments: ResolvedAlignment[] =
      config.align === "auto" ? [...ALIGNMENTS] : [config.align as ResolvedAlignment]
    for (const alignment of alignments) {
      const { left, top } = resolvePosition(anchor, panel, side, alignment, config.gutter)
      const overflow = measureOverflow(left, top, panel, config)
      if (!best || overflow < best.overflow) {
        best = { overflow, left, top, placement: side, align: alignment }
      }
      if (overflow === 0 && config.placement !== "auto" && config.align !== "auto") {
        break
      }
    }
    if (best && best.overflow === 0 && config.placement !== "auto") {
      break
    }
  }

  if (!best) {
    best = { left: anchor.x, top: anchor.y, placement: "right", align: "start", overflow: Number.POSITIVE_INFINITY }
  }

  return {
    left: clamp(best.left, config.viewportPadding, config.viewportWidth - config.viewportPadding - panel.width),
    top: clamp(best.top, config.viewportPadding, config.viewportHeight - config.viewportPadding - panel.height),
    placement: best.placement,
    align: best.align,
  }
}

function resolvePosition(
  anchor: Rect,
  panel: Rect,
  side: Side,
  alignment: Alignment,
  gutter: number
) {
  const axis = sideAxis(side)
  const cross = crossAxis(side)

  const main = axis === "x" ? "left" : "top"
  const crossProp = cross === "x" ? "left" : "top"

  const coords: { left: number; top: number } = { left: 0, top: 0 }

  if (axis === "x") {
    coords.left = side === "right" ? anchor.x + anchor.width + gutter : anchor.x - panel.width - gutter
  } else {
    coords.top = side === "bottom" ? anchor.y + anchor.height + gutter : anchor.y - panel.height - gutter
  }

  const anchorSize = cross === "x" ? anchor.width : anchor.height
  const panelSize = cross === "x" ? panel.width : panel.height

  let offset: number
  switch (alignment) {
    case "center":
      offset = anchorSize / 2 - panelSize / 2
      break
    case "end":
      offset = anchorSize - panelSize
      break
    default:
      offset = 0
  }

  coords[crossProp] = (cross === "x" ? anchor.x : anchor.y) + offset

  return coords
}

function measureOverflow(left: number, top: number, panel: Rect, config: NormalizedOptions) {
  const { viewportPadding, viewportWidth, viewportHeight } = config
  const overflowLeft = Math.max(0, viewportPadding - left)
  const overflowTop = Math.max(0, viewportPadding - top)
  const overflowRight = Math.max(0, left + panel.width + viewportPadding - viewportWidth)
  const overflowBottom = Math.max(0, top + panel.height + viewportPadding - viewportHeight)
  return overflowLeft + overflowTop + overflowRight + overflowBottom
}
