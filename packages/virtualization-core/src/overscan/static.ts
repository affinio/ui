import { clamp } from "../utils/clamp"

export function computeOverscan(velocity: number, min: number, max: number, gamma = 0.9): number {
  if (!Number.isFinite(velocity)) velocity = 0
  if (!Number.isFinite(min)) min = 0
  if (!Number.isFinite(max)) max = min
  if (!Number.isFinite(gamma) || gamma <= 0) gamma = 0.9

  const lower = Math.min(min, max)
  const upper = Math.max(min, max)
  if (upper - lower <= Number.EPSILON) {
    return upper
  }

  const normalized = clamp(Math.abs(velocity), 0, 1)
  const eased = 1 - Math.pow(1 - normalized, gamma)
  const result = lower + (upper - lower) * eased
  return clamp(result, lower, upper)
}

export function splitLeadTrail(overscan: number, direction: number): { lead: number; trail: number } {
  const total = Math.max(0, Number.isFinite(overscan) ? overscan : 0)
  const dir = Number.isFinite(direction) ? direction : 0

  if (total === 0) {
    return { lead: 0, trail: 0 }
  }

  const forwardRatio = 0.25
  const backwardRatio = 0.75

  let leadRatio: number
  if (dir > 0) {
    leadRatio = forwardRatio
  } else if (dir < 0) {
    leadRatio = backwardRatio
  } else {
    leadRatio = 0.5
  }

  const lead = total * leadRatio
  const trail = total - lead
  return { lead, trail }
}
