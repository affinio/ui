import type { DiagramTextMeasurementProvider, DiagramVisualStyle } from "@affino/diagram-core"

export type DiagramCanvasTextMeasurementProvider = DiagramTextMeasurementProvider & Readonly<{ dispose: () => void }>

/** Browser Canvas-backed metrics in diagram units. Returns null in headless/non-Canvas environments. */
export function createCanvasTextMeasurementProvider(): DiagramCanvasTextMeasurementProvider | null {
  if (typeof document === "undefined" || typeof CanvasRenderingContext2D === "undefined") return null
  const context = document.createElement("canvas").getContext("2d")
  if (!context) return null
  let revision = 0
  const listeners = new Set<() => void>()
  const fontSet = typeof document.fonts === "undefined" ? null : document.fonts
  const refresh = () => { revision += 1; for (const listener of [...listeners]) listener() }
  fontSet?.addEventListener("loadingdone", refresh)
  fontSet?.addEventListener("loadingerror", refresh)
  return Object.freeze({
    get revision() { return revision },
    measureText(text: string, style: DiagramVisualStyle) {
      const fontSize = style.fontSize ?? 14
      const fontFamily = style.fontFamily ?? "sans-serif"
      const fontStyle = style.fontStyle ?? "normal"
      const fontWeight = style.fontWeight ?? 400
      context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
      const metrics = context.measureText(text)
      const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8
      const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2
      return { width: metrics.width, lineHeight: Math.max(fontSize * 1.2, ascent + descent), ascent, descent }
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
    dispose() {
      fontSet?.removeEventListener("loadingdone", refresh)
      fontSet?.removeEventListener("loadingerror", refresh)
      listeners.clear()
    },
  }) as DiagramCanvasTextMeasurementProvider
}
