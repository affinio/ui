import type { DiagramMetadata } from "./types.js"

/** Copy and freeze JSON-shaped opaque metadata so caller-owned references cannot mutate document state. */
export function cloneDiagramMetadata(metadata: DiagramMetadata | undefined): DiagramMetadata | undefined {
  if (metadata === undefined) return undefined
  const active = new Set<object>()
  const clone = (value: unknown): unknown => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value !== "object") throw new TypeError("Diagram metadata must contain only JSON-compatible values")
    if (active.has(value)) throw new TypeError("Diagram metadata cannot contain cycles")
    active.add(value)
    let result: unknown
    if (Array.isArray(value)) result = Object.freeze(value.map(clone))
    else {
      const prototype = Object.getPrototypeOf(value)
      if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Diagram metadata must contain plain objects")
      const output: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) output[key] = clone(child)
      result = Object.freeze(output)
    }
    active.delete(value)
    return result
  }
  return clone(metadata) as DiagramMetadata
}

export function isValidDiagramMetadata(metadata: unknown): metadata is DiagramMetadata {
  try { cloneDiagramMetadata(metadata as DiagramMetadata | undefined); return metadata === undefined || Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata)) }
  catch { return false }
}
