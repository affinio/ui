import type { DiagramRect, DiagramViewport } from "../types.js"

export class DiagramViewportService {
  fitBounds(viewport: DiagramViewport, bounds: DiagramRect, padding = 24): DiagramViewport {
    const targetWidth = Math.max(1, bounds.width + padding * 2)
    const targetHeight = Math.max(1, bounds.height + padding * 2)
    const screenWidth = Math.max(1, viewport.width * viewport.zoom)
    const screenHeight = Math.max(1, viewport.height * viewport.zoom)
    const zoom = Math.min(screenWidth / targetWidth, screenHeight / targetHeight)
    return {
      x: bounds.x - (screenWidth / zoom - bounds.width) / 2,
      y: bounds.y - (screenHeight / zoom - bounds.height) / 2,
      width: screenWidth / zoom,
      height: screenHeight / zoom,
      zoom,
    }
  }
}
