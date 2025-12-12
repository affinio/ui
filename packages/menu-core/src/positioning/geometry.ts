import type { Alignment, Rect } from "../Types"

export type Axis = "x" | "y"

export const SIDES = ["bottom", "top", "right", "left"] as const
export type Side = (typeof SIDES)[number]

export const ALIGNMENTS = ["start", "center", "end"] as const satisfies readonly Alignment[]

export function clamp(value: number, min: number, max: number) {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}

export function sizeOnAxis(rect: Rect, axis: Axis) {
  return axis === "x" ? rect.width : rect.height
}

export function minOnAxis(rect: Rect, axis: Axis) {
  return axis === "x" ? rect.x : rect.y
}

export function maxOnAxis(rect: Rect, axis: Axis) {
  return axis === "x" ? rect.x + rect.width : rect.y + rect.height
}

export function oppositeSide(side: Side): Side {
  switch (side) {
    case "left":
      return "right"
    case "right":
      return "left"
    case "top":
      return "bottom"
    case "bottom":
      return "top"
  }
}

export function sideAxis(side: Side): Axis {
  return side === "left" || side === "right" ? "x" : "y"
}

export function crossAxis(side: Side): Axis {
  return sideAxis(side) === "x" ? "y" : "x"
}
