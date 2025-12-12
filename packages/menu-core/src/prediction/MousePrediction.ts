import type {
  MousePredictionConfig,
  MousePredictionDebugCallback,
  MousePredictionDebugPayload,
  Point,
  Rect,
} from "../Types"
import { center, dotProduct, magnitude, subtract } from "./helpers"

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
    const sampleIndex = Math.max(0, this.points.length - 1 - this.config.samplingOffset)
    const sample = this.points[sampleIndex]

    const movement = subtract(last, sample)
    const movementMagnitude = magnitude(movement)
    if (movementMagnitude === 0) {
      return false
    }

    const targetCenter = center(target)
    const toTarget = subtract(targetCenter, last)
    const targetMagnitude = magnitude(toTarget)
    const headingScore = targetMagnitude === 0 ? 1 : dotProduct(movement, toTarget) / (movementMagnitude * targetMagnitude)

    const opensRight = target.x >= origin.x + origin.width
    const horizontalProgress = opensRight
      ? last.x - origin.x - origin.width
      : origin.x - last.x

    const insideVertical =
      last.y >= target.y - this.config.verticalTolerance &&
      last.y <= target.y + target.height + this.config.verticalTolerance

    const driftBias = Math.abs(movement.x) > Math.abs(movement.y) * this.config.driftBias
    const headingSatisfied = headingScore > this.config.headingThreshold
    const horizontalSatisfied = horizontalProgress >= -this.config.horizontalThreshold

    const result = insideVertical && (headingSatisfied || horizontalSatisfied || driftBias)

    this.debugListener?.({
      points: [...this.points],
      target,
      origin,
      headingScore,
      insideVertical,
      horizontalProgress,
    } satisfies MousePredictionDebugPayload)

    return result
  }
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
