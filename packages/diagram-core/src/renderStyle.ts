import type { DiagramEntityBase, DiagramResolvedStyle, DiagramVisualStyle } from "./types.js"

const STYLE_KEYS = ["fill", "stroke", "strokeWidth", "strokeDasharray", "fillRule", "color", "fontFamily", "fontSize", "fontWeight", "fontStyle"] as const

/** Resolves typed visualStyle over legacy metadata style fields for renderer-neutral consumers. */
export function resolveDiagramStyle(entity: DiagramEntityBase): DiagramResolvedStyle {
  const metadata = entity.metadata as Readonly<Record<string, unknown>> | undefined
  const nested = metadata?.style && typeof metadata.style === "object" ? metadata.style as Record<string, unknown> : undefined
  const resolved: Record<string, unknown> = {}
  for (const key of STYLE_KEYS) {
    const legacy = key === "strokeDasharray"
      ? nested?.strokeDasharray ?? nested?.strokeDash ?? metadata?.strokeDasharray ?? metadata?.strokeDash
      : nested?.[key] ?? metadata?.[key]
    const value = entity.visualStyle?.[key] ?? legacy
    if (isValidValue(key, value)) resolved[key] = value
  }
  return resolved as DiagramVisualStyle
}

function isValidValue(key: typeof STYLE_KEYS[number], value: unknown): boolean {
  if (value === undefined) return false
  if (["fill", "stroke", "strokeDasharray", "color", "fontFamily", "fontStyle"].includes(key)) return typeof value === "string"
  if (key === "fillRule") return value === "nonzero" || value === "evenodd"
  if (key === "strokeWidth") return typeof value === "number" && Number.isFinite(value) && value >= 0
  if (key === "fontSize") return typeof value === "number" && Number.isFinite(value) && value > 0
  return key === "fontWeight" && (typeof value === "string" || typeof value === "number" && Number.isFinite(value))
}
