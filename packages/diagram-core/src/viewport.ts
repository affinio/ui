import type { DiagramPoint, DiagramViewport, DiagramViewportConstraints } from "./types.js"

/**
 * Clamps a visible viewport to world bounds expanded by `margin`. If the visible
 * world extent is larger than the expanded bounds on an axis, centers the bounds
 * on that axis instead of allowing the page to drift to one side.
 */
export function clampViewportToBounds(viewport: DiagramViewport, constraints: DiagramViewportConstraints): DiagramViewport {
  const { bounds } = constraints
  const margin = constraints.margin ?? 0
  if (![bounds.x, bounds.y, bounds.width, bounds.height, margin].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0 || margin < 0) {
    throw new RangeError("Viewport bounds must be finite with non-negative size, and margin must be finite and non-negative")
  }
  if (![viewport.x, viewport.y, viewport.width, viewport.height, viewport.zoom].every(Number.isFinite) || viewport.width < 0 || viewport.height < 0 || viewport.zoom <= 0) {
    throw new RangeError("Viewport geometry must be finite with non-negative size and positive zoom")
  }
  const left = bounds.x - margin
  const top = bounds.y - margin
  const right = bounds.x + bounds.width + margin
  const bottom = bounds.y + bounds.height + margin
  return {
    ...viewport,
    x: clampViewportAxis(viewport.x, viewport.width, left, right),
    y: clampViewportAxis(viewport.y, viewport.height, top, bottom),
  }
}

function clampViewportAxis(origin: number, visibleSize: number, min: number, max: number): number {
  const extent = max - min
  if (visibleSize >= extent) return min + (extent - visibleSize) / 2
  return Math.min(max - visibleSize, Math.max(min, origin))
}

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
