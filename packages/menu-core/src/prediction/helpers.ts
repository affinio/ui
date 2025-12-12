import type { Point, Rect } from "../Types"

export interface Vector {
  x: number
  y: number
}

export function subtract(a: Point, b: Point): Vector {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function magnitude(vector: Vector): number {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y)
}

export function dotProduct(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y
}

export function center(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}
