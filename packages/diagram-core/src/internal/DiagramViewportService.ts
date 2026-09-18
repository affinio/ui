import type { DiagramRect, DiagramViewport } from "../types.js"

export class DiagramViewportService {
  fitBounds(viewport: DiagramViewport, bounds: DiagramRect, padding = 24): DiagramViewport {
    const targetWidth = Math.max(1, finite(bounds.width) + Math.max(0, padding) * 2)
    const targetHeight = Math.max(1, finite(bounds.height) + Math.max(0, padding) * 2)
    const screenWidth = Math.max(1, finite(viewport.width) * finiteZoom(viewport.zoom))
    const screenHeight = Math.max(1, finite(viewport.height) * finiteZoom(viewport.zoom))
    const zoom = Math.min(screenWidth / targetWidth, screenHeight / targetHeight)
    return {
      x: finiteCoordinate(bounds.x) - (screenWidth / zoom - finite(bounds.width)) / 2,
      y: finiteCoordinate(bounds.y) - (screenHeight / zoom - finite(bounds.height)) / 2,
      width: screenWidth / zoom,
      height: screenHeight / zoom,
      zoom,
    }
  }
}

function finite(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function finiteZoom(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}
