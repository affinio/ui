import type {
  MousePredictionConfig,
  MousePredictionDebugCallback,
  MousePredictionDebugPayload,
  Point,
  Rect,
} from "../types"
import { center, dotProduct, magnitude, subtract } from "./helpers"

type Orientation = "horizontal" | "vertical"

const DEFAULT_CONFIG: Required<MousePredictionConfig> = {
  history: 8,
  verticalTolerance: 48,
  headingThreshold: 0.2,
  samplingOffset: 2,
  horizontalThreshold: 6,
  driftBias: 0.4,
}

/**
 * Predicts whether the pointer is travelling toward the child submenu. Consumers push points and
 * query `isMovingToward` with the trigger and panel rects. All thresholds are configurable to make
 * the heuristic easier to tune for different UI densities.
 */
export class MousePrediction {
  private readonly points: Point[] = []
  private readonly config: Required<MousePredictionConfig>
  private debugListener: MousePredictionDebugCallback | null = null

  constructor(config?: MousePredictionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  push(point: Point) {
    const time = point.time ?? (typeof performance !== "undefined" ? performance.now() : Date.now())
    this.points.push({ ...point, time })
    if (this.points.length > this.config.history) {
      this.points.shift()
    }
  }

  clear() {
    this.points.length = 0
  }

  enableDebug(callback?: MousePredictionDebugCallback) {
    this.debugListener = callback ?? null
  }

  isMovingToward(target: Rect, origin: Rect): boolean {
    if (this.points.length < 2) {
      return false
    }

    const last = this.points[this.points.length - 1]
    if (!last) {
      return false
    }
    const sampleIndex = Math.max(0, this.points.length - 1 - this.config.samplingOffset)
    const sample = this.points[sampleIndex]
    if (!sample) {
      return false
    }

    const movement = subtract(last, sample)
    const movementMagnitude = magnitude(movement)
    if (movementMagnitude === 0) {
      return false
    }

    const originCenter = center(origin)
    const targetCenter = center(target)
    const toTarget = subtract(targetCenter, last)
    const targetMagnitude = magnitude(toTarget)
    const headingScore = targetMagnitude === 0 ? 1 : dotProduct(movement, toTarget) / (movementMagnitude * targetMagnitude)

    const orientation = determineOrientation(target, origin)
    const horizontalDirection = determineDirection("horizontal", target, origin, targetCenter, originCenter)
    const verticalDirection = determineDirection("vertical", target, origin, targetCenter, originCenter)

    const withinCorridor = isWithinCorridor({
      orientation,
      point: last,
      target,
      origin,
      tolerance: this.config.verticalTolerance,
    })

    const forwardProgress = computeForwardProgress({
      orientation,
      point: last,
      origin,
      horizontalDirection,
      verticalDirection,
    })

    const driftBias = appliesDriftBias({
      orientation,
      movement,
      driftBias: this.config.driftBias,
    })
    const headingSatisfied = headingScore > this.config.headingThreshold
    const progressSatisfied = forwardProgress >= -this.config.horizontalThreshold

    const result = withinCorridor && (headingSatisfied || progressSatisfied || driftBias)

    this.debugListener?.({
      points: [...this.points],
      target,
      origin,
      headingScore,
      orientation,
      withinCorridor,
      forwardProgress,
    } satisfies MousePredictionDebugPayload)

    return result
  }
}

function determineOrientation(target: Rect, origin: Rect): Orientation {
  const opensRight = target.x >= origin.x + origin.width
  const opensLeft = target.x + target.width <= origin.x
  if (opensRight || opensLeft) {
    return "horizontal"
  }

  const opensDown = target.y >= origin.y + origin.height
  const opensUp = target.y + target.height <= origin.y
  if (opensDown || opensUp) {
    return "vertical"
  }

  const originCenter = center(origin)
  const targetCenter = center(target)
  return Math.abs(targetCenter.x - originCenter.x) >= Math.abs(targetCenter.y - originCenter.y) ? "horizontal" : "vertical"
}

function determineDirection(
  axis: Orientation,
  target: Rect,
  origin: Rect,
  targetCenter: Point,
  originCenter: Point,
): 1 | -1 {
  if (axis === "horizontal") {
    if (target.x >= origin.x + origin.width) return 1
    if (target.x + target.width <= origin.x) return -1
    return targetCenter.x >= originCenter.x ? 1 : -1
  }
  if (target.y >= origin.y + origin.height) return 1
  if (target.y + target.height <= origin.y) return -1
  return targetCenter.y >= originCenter.y ? 1 : -1
}

function isWithinCorridor(args: {
  orientation: Orientation
  point: Point
  target: Rect
  origin: Rect
  tolerance: number
}) {
  const { orientation, point, target, origin, tolerance } = args
  if (orientation === "horizontal") {
    const minY = Math.min(origin.y, target.y) - tolerance
    const maxY = Math.max(origin.y + origin.height, target.y + target.height) + tolerance
    return point.y >= minY && point.y <= maxY
  }
  const minX = Math.min(origin.x, target.x) - tolerance
  const maxX = Math.max(origin.x + origin.width, target.x + target.width) + tolerance
  return point.x >= minX && point.x <= maxX
}

function computeForwardProgress(args: {
  orientation: Orientation
  point: Point
  origin: Rect
  horizontalDirection: 1 | -1
  verticalDirection: 1 | -1
}) {
  const { orientation, point, origin, horizontalDirection, verticalDirection } = args
  if (orientation === "horizontal") {
    return horizontalDirection === 1
      ? point.x - origin.x - origin.width
      : origin.x - point.x
  }
  return verticalDirection === 1 ? point.y - origin.y - origin.height : origin.y - point.y
}

function appliesDriftBias(args: { orientation: Orientation; movement: Point; driftBias: number }) {
  const { orientation, movement, driftBias } = args
  if (orientation === "horizontal") {
    return Math.abs(movement.x) > Math.abs(movement.y) * driftBias
  }
  return Math.abs(movement.y) > Math.abs(movement.x) * driftBias
}

export function predictMouseDirection(
  points: Point[],
  target: Rect,
  origin: Rect,
  config?: MousePredictionConfig
): boolean {
  const predictor = new MousePrediction(config)
  points.forEach((point) => predictor.push(point))
  return predictor.isMovingToward(target, origin)
}
