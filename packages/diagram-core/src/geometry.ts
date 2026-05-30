import type { DiagramEdge, DiagramEdgeEndpoint, DiagramEntities, DiagramGeometry, DiagramId, DiagramPoint, DiagramPort, DiagramRect } from "./types.js"

export function rectIntersects(a: DiagramRect, b: DiagramRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function rectContainsPoint(rect: DiagramRect, point: DiagramPoint, radius = 0): boolean {
  return point.x >= rect.x - radius
    && point.x <= rect.x + rect.width + radius
    && point.y >= rect.y - radius
    && point.y <= rect.y + rect.height + radius
}

export function rectFromPoints(points: ReadonlyArray<DiagramPoint>): DiagramRect {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  if (!points.length) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function inflateRect(rect: DiagramRect, amount: number): DiagramRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

export function rectCenter(rect: DiagramRect): DiagramPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

export function distance(a: DiagramPoint, b: DiagramPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function createEntityGeometry(id: DiagramId, entities: DiagramEntities): DiagramGeometry | null {
  const node = entities.nodesById.get(id)
  if (node) {
    return rectGeometry(id, "node", { x: node.x, y: node.y, width: node.width, height: node.height }, node.rotation ?? 0, 4)
  }
  const port = entities.portsById.get(id)
  if (port) {
    const point = resolvePortPoint(port, entities)
    const radius = port.radius ?? 4
    const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    return { id, kind: "port", bounds, hitBounds: inflateRect(bounds, 4), point }
  }
  const edge = entities.edgesById.get(id)
  if (edge) {
    const path = resolveEdgePath(edge, entities)
    const bounds = rectFromPoints(path)
    return { id, kind: "edge", bounds, hitBounds: inflateRect(bounds, 6), path }
  }
  const text = entities.textsById.get(id)
  if (text) {
    const width = text.width ?? Math.max(1, text.text.length) * (text.fontSize ?? 12) * 0.6
    const height = text.height ?? (text.fontSize ?? 12) * 1.2
    return rectGeometry(id, "text", { x: text.x, y: text.y, width, height }, text.rotation ?? 0, 3)
  }
  const shape = entities.shapesById.get(id)
  if (shape) {
    return rectGeometry(id, "shape", { x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.rotation ?? 0, 3)
  }
  return null
}

export function resolveEdgePath(edge: DiagramEdge, entities: DiagramEntities): ReadonlyArray<DiagramPoint> {
  return [
    resolveEndpoint(edge.source, entities),
    ...(edge.points ?? []),
    resolveEndpoint(edge.target, entities),
  ]
}

export function resolveEndpoint(endpoint: DiagramEdgeEndpoint, entities: DiagramEntities): DiagramPoint {
  if (endpoint.kind === "point") {
    return endpoint.point
  }
  if (endpoint.kind === "port") {
    const port = entities.portsById.get(endpoint.portId)
    return port ? resolvePortPoint(port, entities) : { x: 0, y: 0 }
  }
  const node = entities.nodesById.get(endpoint.nodeId)
  return node ? rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }) : { x: 0, y: 0 }
}

export function resolvePortPoint(port: DiagramPort, entities: DiagramEntities): DiagramPoint {
  const node = entities.nodesById.get(port.nodeId)
  if (!node) {
    return { x: port.x, y: port.y }
  }
  const point = { x: node.x + port.x, y: node.y + port.y }
  return rotatePoint(point, rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }), node.rotation ?? 0)
}

function rectGeometry(id: DiagramId, kind: "node" | "shape" | "text", bounds: DiagramRect, rotation: number, hitPadding: number): DiagramGeometry {
  const normalizedRotation = normalizeRotation(rotation)
  if (!normalizedRotation) {
    return { id, kind, bounds, hitBounds: inflateRect(bounds, hitPadding), unrotatedBounds: bounds, rotation: 0 }
  }
  const corners = rotatedRectCorners(bounds, normalizedRotation)
  const rotatedBounds = rectFromPoints(corners)
  return { id, kind, bounds: rotatedBounds, hitBounds: inflateRect(rotatedBounds, hitPadding), unrotatedBounds: bounds, corners, rotation: normalizedRotation }
}

export function rotatedRectCorners(rect: DiagramRect, rotation: number): ReadonlyArray<DiagramPoint> {
  const center = rectCenter(rect)
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((point) => rotatePoint(point, center, rotation))
}

export function rotatePoint(point: DiagramPoint, center: DiagramPoint, rotation: number): DiagramPoint {
  const normalizedRotation = normalizeRotation(rotation)
  if (!normalizedRotation) return point
  const angle = normalizedRotation * (Math.PI / 180)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}
