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
  const remaining = Math.max(0, safeAvailable - (leadCount + trailCount))

  if (remaining > 0) {
    const leadFraction = leadRaw - leadCount
    const trailFraction = trailRaw - trailCount
    let preferLead = leadFraction > trailFraction

    if (Math.abs(leadFraction - trailFraction) <= Number.EPSILON) {
      if (normalizedDirection > 0) {
        preferLead = true
      } else if (normalizedDirection < 0) {
        preferLead = false
      } else {
        preferLead = true
      }
    }

    const preferredShare = Math.ceil(remaining / 2)
    const secondaryShare = remaining - preferredShare

    if (preferLead) {
      leadCount += preferredShare
      trailCount += secondaryShare
    } else {
      trailCount += preferredShare
      leadCount += secondaryShare
    }
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
