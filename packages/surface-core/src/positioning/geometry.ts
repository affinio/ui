import type { Alignment, Rect } from "../types"

export type Axis = "x" | "y"

export const SIDES = ["bottom", "top", "right", "left"] as const
export type Side = (typeof SIDES)[number]

export const ALIGNMENTS = ["start", "center", "end"] as const satisfies readonly Alignment[]

export function clamp(value: number, min: number, max: number) {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}

export function sideAxis(side: Side): Axis {
  return side === "left" || side === "right" ? "x" : "y"
}

export function crossAxis(side: Side): Axis {
  return sideAxis(side) === "x" ? "y" : "x"
}
