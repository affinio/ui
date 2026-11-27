import type { DiagramRulerTick, DiagramRulerTickOptions, DiagramRulerUnit } from "./types.js"

const DEFAULT_WORLD_UNITS: Record<DiagramRulerUnit, number> = { px: 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 }

/** Resolve adaptive ruler ticks from world-space extent and viewport zoom. Origin is the world coordinate labeled zero. */
export function resolveDiagramRulerTicks(options: DiagramRulerTickOptions): ReadonlyArray<DiagramRulerTick> {
  const { start, end } = options
  const zoom = options.zoom
  if (![start, end, zoom].every(Number.isFinite) || end < start || zoom <= 0) return Object.freeze([])
  const unit = options.unit ?? "px"
  const worldUnitsPerUnit = options.worldUnitsPerUnit ?? DEFAULT_WORLD_UNITS[unit]
  const targetPx = options.targetTickPx ?? 64
  if (!Number.isFinite(worldUnitsPerUnit) || worldUnitsPerUnit <= 0 || !Number.isFinite(targetPx) || targetPx <= 0) return Object.freeze([])
  const origin = options.origin ?? 0
  if (!Number.isFinite(origin)) return Object.freeze([])
  const targetUnits = targetPx / (zoom * worldUnitsPerUnit)
  const power = 10 ** Math.floor(Math.log10(targetUnits))
  const normalized = targetUnits / power
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power
  const worldStep = step * worldUnitsPerUnit
  const firstIndex = Math.ceil((start - origin) / worldStep - 1e-10)
  const lastIndex = Math.floor((end - origin) / worldStep + 1e-10)
  const count = Math.min(2000, Math.max(0, lastIndex - firstIndex + 1))
  const precision = Math.min(8, Math.max(0, -Math.floor(Math.log10(step))))
  const ticks: DiagramRulerTick[] = []
  const majorEvery = 5
  for (let offset = 0; offset < count; offset += 1) {
    const index = firstIndex + offset
    const value = Number((index * step).toFixed(precision))
    // Keep at least the first visible tick labeled so a viewport beginning in
    // negative space still communicates its coordinate range.
    const major = index % majorEvery === 0 || index === firstIndex
    ticks.push(Object.freeze({ world: origin + index * worldStep, value, label: major ? formatTick(value, precision) : "", major }))
  }
  return Object.freeze(ticks)
}

function formatTick(value: number, precision: number): string {
  return Number(value.toFixed(precision)).toString()
}
