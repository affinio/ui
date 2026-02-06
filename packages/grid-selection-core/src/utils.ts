export function clampScalar(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

export function clampIndex(value: number, min: number, max: number): number {
  const normalizedMin = Number.isFinite(min) ? Math.trunc(min) : 0
  const normalizedMax = Number.isFinite(max) ? Math.trunc(max) : normalizedMin
  const lower = Math.min(normalizedMin, normalizedMax)
  const upper = Math.max(normalizedMin, normalizedMax)
  if (!Number.isFinite(value)) return lower
  const next = Math.trunc(value)
  if (next < lower) return lower
  if (next > upper) return upper
  return next
}
