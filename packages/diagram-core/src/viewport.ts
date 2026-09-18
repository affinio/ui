import type { DiagramPoint, DiagramViewport } from "./types.js"

/** Viewport width/height are visible world units; zoom is CSS pixels per world unit. */
export function screenToWorld(viewport: DiagramViewport, point: DiagramPoint): DiagramPoint {
  const zoom = finiteZoom(viewport.zoom)
  return { x: viewport.x + point.x / zoom, y: viewport.y + point.y / zoom }
}

export function worldToScreen(viewport: DiagramViewport, point: DiagramPoint): DiagramPoint {
  const zoom = finiteZoom(viewport.zoom)
  return { x: (point.x - viewport.x) * zoom, y: (point.y - viewport.y) * zoom }
}

export function zoomViewportAt(viewport: DiagramViewport, zoom: number, screenPoint: DiagramPoint): DiagramViewport {
  const nextZoom = finiteZoom(zoom)
  const worldPoint = screenToWorld(viewport, screenPoint)
  return { ...viewport, x: worldPoint.x - screenPoint.x / nextZoom, y: worldPoint.y - screenPoint.y / nextZoom, zoom: nextZoom }
}

export function zoomViewportCentered(viewport: DiagramViewport, zoom: number): DiagramViewport {
  return zoomViewportAt(viewport, zoom, { x: viewport.width * viewport.zoom / 2, y: viewport.height * viewport.zoom / 2 })
}

function finiteZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1
}
