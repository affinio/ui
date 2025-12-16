import { splitLeadTrail } from "../overscan/static"
import { clamp } from "../utils/clamp"

export interface OverscanBucketsInput {
  available: number
  direction: number
}

export interface OverscanBuckets {
  leading: number
  trailing: number
}

export function resolveOverscanBuckets({ available, direction }: OverscanBucketsInput): OverscanBuckets {
  const safeAvailable = Math.max(0, Math.floor(available))
  if (safeAvailable <= 0) {
    return { leading: 0, trailing: 0 }
  }

  const normalizedDirection = clamp(direction, -1, 1)
  const { lead, trail } = splitLeadTrail(safeAvailable, normalizedDirection)
  const leadRaw = clamp(lead, 0, safeAvailable)
  const trailRaw = clamp(trail, 0, safeAvailable)

  let leadCount = Math.floor(leadRaw)
  let trailCount = Math.floor(trailRaw)
  let assigned = leadCount + trailCount
  let remaining = Math.max(0, safeAvailable - assigned)

  const fractions = [
    { side: "lead" as const, frac: leadRaw - Math.floor(leadRaw) },
    { side: "trail" as const, frac: trailRaw - Math.floor(trailRaw) },
  ]

  fractions.sort((a, b) => {
    if (Math.abs(a.frac - b.frac) < Number.EPSILON) {
      if (normalizedDirection > 0) return a.side === "lead" ? -1 : 1
      if (normalizedDirection < 0) return a.side === "trail" ? -1 : 1
    }
    return b.frac - a.frac
  })

  let fractionIndex = 0
  while (remaining > 0) {
    const target = fractions[fractionIndex % fractions.length]
    if (target.side === "lead") {
      leadCount += 1
    } else {
      trailCount += 1
    }
    remaining -= 1
    fractionIndex += 1
  }

  if (safeAvailable > 1) {
    if (normalizedDirection >= 0 && trailCount === 0) {
      trailCount = 1
      leadCount = Math.max(0, safeAvailable - trailCount)
    } else if (normalizedDirection <= 0 && leadCount === 0) {
      leadCount = 1
      trailCount = Math.max(0, safeAvailable - leadCount)
    }
  }

  if (normalizedDirection >= 0 && safeAvailable >= 2 && trailCount < 2) {
    trailCount = 2
    if (trailCount > safeAvailable) {
      trailCount = safeAvailable
    }
    leadCount = Math.max(0, safeAvailable - trailCount)
  }

  const leading = clamp(leadCount, 0, safeAvailable)
  const trailing = Math.max(0, safeAvailable - leading)
  return { leading, trailing }
}
