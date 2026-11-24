import type { DiagramEdge, DiagramEdgeEndpoint, DiagramEntities, DiagramGeometry, DiagramId, DiagramOrthogonalRouteOptions, DiagramOrthogonalRouteResult, DiagramPoint, DiagramPort, DiagramRect, DiagramTable, DiagramTableCellPosition } from "./types.js"

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

/** Builds a stable orthogonal route with terminal leads. This is a local router, not a collision-avoidance solver. */
export function routeOrthogonalConnector(source: DiagramPoint, target: DiagramPoint, options: DiagramOrthogonalRouteOptions = {}): DiagramOrthogonalRouteResult {
  const terminalLead = options.terminalLead ?? 12
  if (![source.x, source.y, target.x, target.y, terminalLead].every(Number.isFinite) || terminalLead < 0) throw new RangeError("Connector points and terminal lead must be finite; lead must be non-negative")
  const dx = target.x - source.x
  const dy = target.y - source.y
  const firstAxis = options.firstAxis ?? (Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical")
  const leadSource = firstAxis === "horizontal"
    ? { x: source.x + Math.sign(dx || 1) * terminalLead, y: source.y }
    : { x: source.x, y: source.y + Math.sign(dy || 1) * terminalLead }
  const leadTarget = firstAxis === "horizontal"
    ? { x: target.x - Math.sign(dx || 1) * terminalLead, y: target.y }
    : { x: target.x, y: target.y - Math.sign(dy || 1) * terminalLead }
  const elbow = firstAxis === "horizontal" ? { x: leadTarget.x, y: leadSource.y } : { x: leadSource.x, y: leadTarget.y }
  const path = dedupeAdjacentPoints([source, leadSource, elbow, leadTarget, target])
  const diagnostics = Math.abs(firstAxis === "horizontal" ? dx : dy) < terminalLead * 2
    ? [{ code: "terminal-leads-overlap" as const, message: "Terminal leads overlap on the selected first route axis; the local orthogonal route may contain a short or reversed segment." }]
    : []
  return { points: path.slice(1, -1), path, firstAxis, diagnostics }
}

function dedupeAdjacentPoints(points: ReadonlyArray<DiagramPoint>): DiagramPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y)
}

/** Returns the zero-based table cell at a world-space point, or null when outside the table. */
export function getDiagramTableCellAt(table: DiagramTable, point: DiagramPoint): DiagramTableCellPosition | null {
  const headerHeight = table.header?.height ?? 0
  const bounds = { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }
  const center = rectCenter(bounds)
  let local = rotatePoint(point, center, -(table.rotation ?? 0))
  local = {
    x: center.x + (local.x - center.x) * (table.flipX ? -1 : 1),
    y: center.y + (local.y - center.y) * (table.flipY ? -1 : 1),
  }
  point = local
  if (point.x < table.x || point.y < table.y || point.x > table.x + table.width || point.y > table.y + table.height) return null
  const columnWidths = table.columnWidths ?? Array(table.columnCount).fill(table.width / table.columnCount) as number[]
  const rowHeights = table.rowHeights ?? Array(table.rowCount).fill(table.height / table.rowCount) as number[]
  const column = findCellIndex(point.x - table.x, columnWidths, table.width)
  const row = findCellIndex(point.y - table.y, rowHeights, table.height)
  return { row, column }
}

function findCellIndex(offset: number, sizes: ReadonlyArray<number>, total: number): number {
  if (offset >= total) return sizes.length - 1
  let edge = 0
  for (let index = 0; index < sizes.length; index += 1) {
    edge += sizes[index]!
    if (offset < edge) return index
  }
  return Math.max(0, sizes.length - 1)
}

export function createEntityGeometry(id: DiagramId, entities: DiagramEntities): DiagramGeometry | null {
  const node = entities.nodesById.get(id)
  if (node) {
    return rectGeometry(id, "node", { x: node.x, y: node.y, width: node.width, height: node.height }, node.rotation ?? 0, 4, node.flipX, node.flipY)
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
    return rectGeometry(id, "text", { x: text.x, y: text.y, width, height }, text.rotation ?? 0, 3, text.flipX, text.flipY)
  }
  const shape = entities.shapesById.get(id)
  if (shape) {
    if (shape.shape === "line" && shape.points?.length) {
      const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
      const path = shape.points.map((point) => {
        const local = { x: shape.x + (shape.flipX ? shape.width - point.x : point.x), y: shape.y + (shape.flipY ? shape.height - point.y : point.y) }
        return rotatePoint(local, center, shape.rotation ?? 0)
      })
      const bounds = rectFromPoints(path)
      return { id, kind: "shape", bounds, hitBounds: inflateRect(bounds, 6), path, rotation: shape.rotation ?? 0, flipX: shape.flipX, flipY: shape.flipY }
    }
    return rectGeometry(id, "shape", { x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.rotation ?? 0, 3, shape.flipX, shape.flipY, shape.shape === "rect" ? shape.cornerRadius ?? 0 : 0)
  }
  const group = entities.groupsById.get(id)
  if (group) {
    const bounds = unionRects(group.childIds
      .filter((childId) => childId !== id)
      .map((childId) => createEntityGeometry(childId, entities)?.bounds)
      .filter((rect): rect is DiagramRect => Boolean(rect)))
    if (!bounds) return null
    return { id, kind: "group", bounds, unrotatedBounds: bounds, rotation: 0, hitBounds: inflateRect(bounds, 6) }
  }
  const table = entities.tablesById.get(id)
  if (table) {
    const headerHeight = table.header?.height ?? 0
    return rectGeometry(id, "table", { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }, table.rotation ?? 0, 3, table.flipX, table.flipY)
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
  const point = {
    x: node.x + (node.flipX ? node.width - port.x : port.x),
    y: node.y + (node.flipY ? node.height - port.y : port.y),
  }
  return rotatePoint(point, rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }), node.rotation ?? 0)
}

function rectGeometry(id: DiagramId, kind: "node" | "shape" | "text" | "table", bounds: DiagramRect, rotation: number, hitPadding: number, flipX = false, flipY = false, cornerRadius = 0): DiagramGeometry {
  const normalizedRotation = normalizeRotation(rotation)
  if (!normalizedRotation) {
    return { id, kind, bounds, hitBounds: inflateRect(bounds, hitPadding), unrotatedBounds: bounds, rotation: 0, flipX, flipY, ...(kind === "shape" ? { cornerRadius } : {}) }
  }
  const corners = rotatedRectCorners(bounds, normalizedRotation)
  const rotatedBounds = rectFromPoints(corners)
  return { id, kind, bounds: rotatedBounds, hitBounds: inflateRect(rotatedBounds, hitPadding), unrotatedBounds: bounds, corners, rotation: normalizedRotation, flipX, flipY, ...(kind === "shape" ? { cornerRadius } : {}) }
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

function unionRects(rects: ReadonlyArray<DiagramRect>): DiagramRect | null {
  if (!rects.length) return null
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
