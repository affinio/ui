import { describe, expect, it } from "vitest"
import { MousePrediction, predictMouseDirection } from "../prediction/MousePrediction"
import type { Point, Rect } from "../types"

describe("MousePrediction", () => {
  const origin: Rect = { x: 0, y: 0, width: 100, height: 30 }
  const target: Rect = { x: 140, y: -40, width: 120, height: 180 }

  it("keeps submenu intent when pointer cuts diagonally across sibling rows", () => {
    const predictor = new MousePrediction({ history: 4, horizontalThreshold: 4 })
    const points: Point[] = [
      { x: 92, y: 8, time: 0 },
      { x: 108, y: 28, time: 16 },
      { x: 126, y: 52, time: 32 },
      { x: 146, y: 72, time: 48 },
    ]

    points.forEach((point) => predictor.push(point))
    expect(predictor.isMovingToward(target, origin)).toBe(true)
  })

  it("returns false when moving away", () => {
    const predictor = new MousePrediction({ history: 4 })
    const points: Point[] = [
      { x: 10, y: 10 },
      { x: 6, y: 60 },
      { x: 4, y: 120 },
      { x: 2, y: 180 },
    ]

    points.forEach((point, index) => predictor.push({ ...point, time: index }))
    expect(predictor.isMovingToward(target, origin)).toBe(false)
  })

  it("expires stale pointer history", () => {
    const predictor = new MousePrediction({ history: 4, maxAge: 80 })
    predictor.push({ x: 90, y: 8, time: 0 })
    predictor.push({ x: 126, y: 52, time: 200 })

    expect(predictor.isMovingToward(target, origin)).toBe(false)
  })

  it("predicts direction via helper function", () => {
    const path: Point[] = [
      { x: 5, y: 5 },
      { x: 90, y: 8 },
      { x: 150, y: 12 },
    ]

    expect(predictMouseDirection(path, target, origin)).toBe(true)
  })
})
