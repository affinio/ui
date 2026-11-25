import type { DiagramEdge, DiagramEdgeEndpoint, DiagramEntities, DiagramGeometry, DiagramId, DiagramOrthogonalRouteOptions, DiagramOrthogonalRouteResult, DiagramPoint, DiagramPort, DiagramPortAnchor, DiagramRect, DiagramTable, DiagramTableCellPosition } from "./types.js"
import { flattenPathContour, pathContourBoundsPoints, transformPathContour, translatePathContour } from "./pathOperations.js"
import { resolveDiagramStyle } from "./renderStyle.js"

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

/** Routes an orthogonal connector through an exact rectilinear visibility grid (not a raster approximation). */
export function routeOrthogonalConnector(source: DiagramPoint, target: DiagramPoint, options: DiagramOrthogonalRouteOptions = {}): DiagramOrthogonalRouteResult {
  const requestedTerminalLead = options.terminalLead ?? 12
  const requestedClearance = options.clearance ?? 0
  const requestedWaypoints = [...(options.waypoints ?? []), ...(options.routeHint ? [options.routeHint] : [])]
  const strictSize = options.strictGrid === true ? options.gridSize : undefined
  if (options.strictGrid && (!Number.isFinite(strictSize) || strictSize! <= 0)) throw new RangeError("Strict-grid connector routing requires a positive finite gridSize")
  const grid = options.strictGrid ? strictSize! : undefined
  const snap = (value: number) => grid ? Math.round(value / grid) * grid : value
  const floor = (value: number) => grid ? Math.floor(value / grid) * grid : value
  const ceil = (value: number) => grid ? Math.ceil(value / grid) * grid : value
  const routeSource = source
  const routeTarget = target
  const terminalLead = grid ? ceil(requestedTerminalLead) : requestedTerminalLead
  const clearance = grid ? ceil(requestedClearance) : requestedClearance
  const waypoints = grid ? requestedWaypoints.map((point) => ({ x: snap(point.x), y: snap(point.y) })) : requestedWaypoints
  const validDirection = (direction: DiagramOrthogonalRouteOptions["sourceDirection"]) => direction === undefined || ["north", "east", "south", "west"].includes(direction)
  const validObstacle = (obstacle: NonNullable<DiagramOrthogonalRouteOptions["obstacles"]>[number]) => obstacle.bounds.width >= 0 && obstacle.bounds.height >= 0
  const existingRoutes = options.existingRoutes ?? []
  if (![source.x, source.y, target.x, target.y, requestedTerminalLead, requestedClearance, strictSize ?? 1, ...requestedWaypoints.flatMap((point) => [point.x, point.y]), ...(options.obstacles ?? []).flatMap(({ bounds }) => [bounds.x, bounds.y, bounds.width, bounds.height]), ...existingRoutes.flatMap((route) => route.points.flatMap((point) => [point.x, point.y]))].every(Number.isFinite)
    || requestedTerminalLead < 0 || requestedClearance < 0
    || (options.maxBends !== undefined && (!Number.isInteger(options.maxBends) || options.maxBends < 0))
    || (options.maxRouteBends !== undefined && (!Number.isInteger(options.maxRouteBends) || options.maxRouteBends < 0))
    || (options.firstAxis !== undefined && options.firstAxis !== "horizontal" && options.firstAxis !== "vertical")
    || (options.mode !== undefined && options.mode !== "auto" && options.mode !== "manual")
    || !validDirection(options.sourceDirection) || !validDirection(options.targetDirection)
    || (options.tieBreak !== undefined && !["coordinates", "horizontal-first", "vertical-first"].includes(options.tieBreak))
    || (options.obstacles ?? []).some((obstacle) => !validObstacle(obstacle))) {
    throw new RangeError("Connector points, clearance, and terminal lead must be finite; clearance and lead must be non-negative")
  }
  const dx = routeTarget.x - routeSource.x, dy = routeTarget.y - routeSource.y
  const inferredAxis = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical"
  const firstAxis = options.firstAxis ?? axisForDirection(options.sourceDirection) ?? inferredAxis
  const sourceDirection = options.sourceDirection ?? axisDirection(firstAxis, dx, dy, false)
  const targetDirection = options.targetDirection ?? sourceDirection
  const sourceStub = offsetInDirection(routeSource, sourceDirection, terminalLead)
  const targetStub = offsetInDirection(routeTarget, oppositeDirection(targetDirection), terminalLead)
  const obstacles = (options.obstacles ?? []).map(({ bounds }) => {
    const inflated = inflateRect(bounds, clearance)
    if (!grid) return inflated
    const left = floor(inflated.x), top = floor(inflated.y)
    const right = ceil(inflated.x + inflated.width), bottom = ceil(inflated.y + inflated.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
  })
  if (obstacles.some((obstacle) => segmentCrossesRectInterior(routeSource, sourceStub, obstacle) || segmentCrossesRectInterior(targetStub, routeTarget, obstacle))) {
    return { points: [], path: [routeSource, routeTarget], firstAxis, diagnostics: [{ code: "escape-direction-conflict", message: "A terminal lead crosses an inflated obstacle; adjust the escape direction or clearance." }] }
  }
  const stops = [sourceStub, ...waypoints, targetStub]
  const routed: DiagramPoint[] = [routeSource, sourceStub]
  const diagnostics: DiagramOrthogonalRouteResult["diagnostics"][number][] = []
  let usedBends = 0
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index]!, end = stops[index + 1]!
    const remainingBends = options.maxBends === undefined ? undefined : Math.max(0, options.maxBends - usedBends)
    const route = routeVisibilityLeg(start, end, obstacles, options.existingRoutes, undefined, undefined, options.tieBreak, remainingBends)
    if (!route) {
      const withoutBendCap = options.maxBends === undefined ? null : routeOrthogonalConnector(routeSource, routeTarget, { ...options, maxBends: undefined })
      const bendCapRejected = Boolean(withoutBendCap?.path.length && !withoutBendCap.diagnostics.some((entry) => entry.code === "no-route" || entry.code === "escape-direction-conflict" || entry.code === "waypoint-blocked"))
      diagnostics.push(bendCapRejected
        ? { code: "bend-limit", message: `No collision-free orthogonal route satisfies maxBends=${options.maxBends}.` }
        : { code: index === 0 ? "escape-direction-conflict" : waypoints.length ? "waypoint-blocked" : "no-route", message: "No collision-free orthogonal route satisfies the endpoint, waypoint, and obstacle constraints." })
      return { points: [], path: [routeSource, routeTarget], firstAxis, diagnostics }
    }
    routed.push(...route.slice(1))
    usedBends += countOrthogonalBends(route)
  }
  routed.push(routeTarget)
  const path = dedupeAdjacentPoints(routed)
  if (options.maxRouteBends !== undefined && countOrthogonalBends(path) > options.maxRouteBends) {
    return { points: [], path: [routeSource, routeTarget], firstAxis, diagnostics: [{ code: "bend-limit", message: `No collision-free orthogonal route satisfies maxRouteBends=${options.maxRouteBends}.` }] }
  }
  if (distance(sourceStub, targetStub) < terminalLead * 2 && terminalLead > 0) diagnostics.push({ code: "terminal-leads-overlap", message: "Terminal lead segments overlap or reverse; reduce terminalLead or adjust the escape directions." })
  return { points: path.slice(1, -1), path, firstAxis, diagnostics }
}

function countOrthogonalBends(points: ReadonlyArray<DiagramPoint>): number {
  let bends = 0
  let previousAxis: "x" | "y" | null = null
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1]!, second = points[index]!
    if (Math.abs(first.x - second.x) <= 1e-9 && Math.abs(first.y - second.y) <= 1e-9) continue
    const axis = Math.abs(first.x - second.x) > 1e-9 ? "x" : "y"
    if (previousAxis && previousAxis !== axis) bends += 1
    previousAxis = axis
  }
  return bends
}

type RouteState = { node: number; axis: 0 | 1 | 2; firstAxis: 0 | 1 | 2; bends: number; length: number; crossings: number; previous: RouteState | null }

function routeVisibilityLeg(start: DiagramPoint, end: DiagramPoint, obstacles: ReadonlyArray<DiagramRect>, existingRoutes: DiagramOrthogonalRouteOptions["existingRoutes"] = [], startDirection?: DiagramOrthogonalRouteOptions["sourceDirection"], endDirection?: DiagramOrthogonalRouteOptions["targetDirection"], tieBreak: DiagramOrthogonalRouteOptions["tieBreak"] = "coordinates", maxBends?: number): DiagramPoint[] | null {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((rect) => [rect.x, rect.x + rect.width])])].sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((rect) => [rect.y, rect.y + rect.height])])].sort((a, b) => a - b)
  const points: DiagramPoint[] = []
  const indexByKey = new Map<string, number>()
  for (const y of ys) for (const x of xs) {
    const point = { x, y }
    if (obstacles.some((rect) => rectContainsPoint(rect, point, -1e-8))) continue
    indexByKey.set(pointKey(point), points.length); points.push(point)
  }
  const startIndex = indexByKey.get(pointKey(start)), endIndex = indexByKey.get(pointKey(end))
  if (startIndex === undefined || endIndex === undefined) return null
  const adjacency: Array<Array<{ node: number; axis: 1 | 2; length: number }>> = points.map(() => [])
  const rows = new Map<number, number[]>(), columns = new Map<number, number[]>()
  points.forEach((point, index) => {
    const row = rows.get(point.y) ?? []; row.push(index); rows.set(point.y, row)
    const column = columns.get(point.x) ?? []; column.push(index); columns.set(point.x, column)
  })
  const connectAdjacent = (sets: Map<number, number[]>, axis: 1 | 2) => {
    for (const entries of sets.values()) {
      entries.sort((a, b) => axis === 1 ? points[a]!.x - points[b]!.x : points[a]!.y - points[b]!.y)
      for (let index = 1; index < entries.length; index += 1) {
        const a = entries[index - 1]!, b = entries[index]!, pa = points[a]!, pb = points[b]!
        if (obstacles.some((rect) => segmentCrossesRectInterior(pa, pb, rect))) continue
        const length = distance(pa, pb)
        adjacency[a]!.push({ node: b, axis, length }); adjacency[b]!.push({ node: a, axis, length })
      }
    }
  }
  connectAdjacent(rows, 1); connectAdjacent(columns, 2)
  const initialAxis = directionAxis(startDirection), requiredEndAxis = directionAxis(endDirection)
  const initial: RouteState = { node: startIndex, axis: initialAxis, firstAxis: 0, bends: 0, length: 0, crossings: 0, previous: null }
  const best = new Map<string, RouteState>([[`${startIndex}:${initialAxis}`, initial]])
  const pending: RouteState[] = []
  pushRouteState(pending, initial, tieBreak)
  while (pending.length) {
    const current = popRouteState(pending, tieBreak)!
    if (best.get(`${current.node}:${current.axis}`) !== current) continue
    if (current.node === endIndex && (!requiredEndAxis || current.axis === requiredEndAxis)) {
      const route: DiagramPoint[] = []
      for (let item: RouteState | null = current; item; item = item.previous) route.push(points[item.node]!)
      route.reverse()
      return simplifyOrthogonalPath(route)
    }
    for (const next of adjacency[current.node]!) {
      const from = points[current.node]!, to = points[next.node]!
      if ((current.node === startIndex && startDirection && (next.axis !== initialAxis || !matchesDirection(from, to, startDirection)))
        || (next.node === endIndex && requiredEndAxis && (next.axis !== requiredEndAxis || !matchesDirection(from, to, endDirection!)))) continue
      const state: RouteState = { node: next.node, axis: next.axis, firstAxis: current.firstAxis || next.axis, bends: current.bends + (current.axis !== 0 && current.axis !== next.axis ? 1 : 0), length: current.length + next.length, crossings: current.crossings + countRouteCrossings(from, to, existingRoutes), previous: current }
      if (maxBends !== undefined && state.bends > maxBends) continue
      const key = `${state.node}:${state.axis}`, existing = best.get(key)
      if (!existing || compareRouteStates(state, existing, tieBreak) < 0) { best.set(key, state); pushRouteState(pending, state, tieBreak) }
    }
  }
  return null
}

function pushRouteState(heap: RouteState[], value: RouteState, tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): void {
  let index = heap.length; heap.push(value)
  while (index > 0) {
    const parent = (index - 1) >> 1
    if (compareRouteStates(heap[parent]!, value, tieBreak) <= 0) break
    heap[index] = heap[parent]!; index = parent
  }
  heap[index] = value
}

function popRouteState(heap: RouteState[], tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): RouteState | undefined {
  const first = heap[0], last = heap.pop()
  if (!first || !last || !heap.length) return first
  let index = 0
  while (true) {
    const left = index * 2 + 1, right = left + 1
    if (left >= heap.length) break
    let child = left
    if (right < heap.length && compareRouteStates(heap[right]!, heap[left]!, tieBreak) < 0) child = right
    if (compareRouteStates(last, heap[child]!, tieBreak) <= 0) break
    heap[index] = heap[child]!; index = child
  }
  heap[index] = last
  return first
}

function compareRouteStates(a: RouteState, b: RouteState, tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): number {
  const directionPreference = tieBreak === "vertical-first" ? 2 : 1
  const firstAxisTie = (a.firstAxis === directionPreference ? 0 : 1) - (b.firstAxis === directionPreference ? 0 : 1)
  return a.bends - b.bends || a.length - b.length || a.crossings - b.crossings || firstAxisTie || a.axis - b.axis || a.node - b.node
}

function countRouteCrossings(start: DiagramPoint, end: DiagramPoint, routes: NonNullable<DiagramOrthogonalRouteOptions["existingRoutes"]>): number {
  let crossings = 0
  for (const route of routes) for (let index = 0; index < route.points.length - 1; index += 1) {
    const a = route.points[index]!, b = route.points[index + 1]!
    if (start.y === end.y && a.x === b.x && start.y > Math.min(a.y, b.y) && start.y < Math.max(a.y, b.y) && a.x > Math.min(start.x, end.x) && a.x < Math.max(start.x, end.x)) crossings += 1
    else if (start.x === end.x && a.y === b.y && start.x > Math.min(a.x, b.x) && start.x < Math.max(a.x, b.x) && a.y > Math.min(start.y, end.y) && a.y < Math.max(start.y, end.y)) crossings += 1
  }
  return crossings
}

function segmentCrossesRectInterior(a: DiagramPoint, b: DiagramPoint, rect: DiagramRect): boolean {
  if (a.y === b.y) return a.y > rect.y + 1e-8 && a.y < rect.y + rect.height - 1e-8 && Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width) - 1e-8
  if (a.x === b.x) return a.x > rect.x + 1e-8 && a.x < rect.x + rect.width - 1e-8 && Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height) - 1e-8
  return true
}

function simplifyOrthogonalPath(points: ReadonlyArray<DiagramPoint>): DiagramPoint[] {
  const result: DiagramPoint[] = []
  for (const point of points) {
    if (result.length && pointKey(result[result.length - 1]!) === pointKey(point)) continue
    while (result.length >= 2) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!
      const collinear = (a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)
      const reversal = (a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) < 0) || (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) < 0)
      if (!collinear || reversal) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

function pointKey(point: DiagramPoint): string { return `${point.x}\u0000${point.y}` }
function directionAxis(direction?: DiagramOrthogonalRouteOptions["sourceDirection"]): 0 | 1 | 2 { return !direction ? 0 : direction === "east" || direction === "west" ? 1 : 2 }
function axisForDirection(direction?: DiagramOrthogonalRouteOptions["sourceDirection"]): "horizontal" | "vertical" | undefined { return !direction ? undefined : directionAxis(direction) === 1 ? "horizontal" : "vertical" }
function offsetInDirection(point: DiagramPoint, direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>, amount: number): DiagramPoint {
  const vector = direction === "east" ? { x: 1, y: 0 } : direction === "west" ? { x: -1, y: 0 } : direction === "north" ? { x: 0, y: -1 } : { x: 0, y: 1 }
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount }
}
function axisDirection(axis: "horizontal" | "vertical", dx: number, dy: number, reverse: boolean): NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]> {
  if (axis === "horizontal") return (dx >= 0) !== reverse ? "east" : "west"
  return (dy >= 0) !== reverse ? "south" : "north"
}
function oppositeDirection(direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>): NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]> {
  return direction === "east" ? "west" : direction === "west" ? "east" : direction === "north" ? "south" : "north"
}
function matchesDirection(from: DiagramPoint, to: DiagramPoint, direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>): boolean {
  return direction === "east" ? to.x > from.x : direction === "west" ? to.x < from.x : direction === "south" ? to.y > from.y : to.y < from.y
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
  const geometry = createEntityGeometryRaw(id, entities)
  if (!geometry) return null
  const entity = entities.nodesById.get(id) ?? entities.edgesById.get(id) ?? entities.textsById.get(id)
    ?? entities.shapesById.get(id) ?? entities.portsById.get(id) ?? entities.junctionsById.get(id)
    ?? entities.groupsById.get(id) ?? entities.tablesById.get(id)
  if (!entity) return geometry
  let style = resolveDiagramStyle(entity)
  if (entity.kind === "shape" && entity.pathContours?.length) {
    style = { ...style, fillRule: entity.pathContours.some((contour) => contour.hole) ? "evenodd" : style.fillRule ?? "evenodd" }
  }
  if (entity.kind === "text" && entity.fontSize !== undefined && entity.visualStyle?.fontSize === undefined) return { ...geometry, style: { ...style, fontSize: entity.fontSize } }
  return Object.keys(style).length ? { ...geometry, style } : geometry
}

function createEntityGeometryRaw(id: DiagramId, entities: DiagramEntities): DiagramGeometry | null {
  const node = entities.nodesById.get(id)
  if (node) {
    return rectGeometry(id, "node", { x: node.x, y: node.y, width: node.width, height: node.height }, node.rotation ?? 0, 4, node.flipX, node.flipY)
  }
  const port = entities.portsById.get(id)
  if (port) {
    const point = resolvePortPoint(port, entities)
    const radius = port.radius ?? 4
    const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    return { id, kind: "port", bounds, hitBounds: inflateRect(bounds, 4), point, hostId: diagramPortHostId(port), ...("anchor" in port && port.anchor ? { anchor: port.anchor } : {}) }
  }
  const junction = entities.junctionsById.get(id)
  if (junction) {
    const host = entities.edgesById.get(junction.hostEdgeId)
    if (!host) return null
    const point = junction.anchor.kind === "fixed" ? junction.anchor.point : pointAtRouteFraction(resolveEdgePath(host, entities), junction.anchor.fraction)
    const bounds = { x: point.x - 3, y: point.y - 3, width: 6, height: 6 }
    return { id, kind: "junction", bounds, hitBounds: inflateRect(bounds, 4), point, hostId: junction.hostEdgeId }
  }
  const edge = entities.edgesById.get(id)
  if (edge) {
    const path = resolveEdgePath(edge, entities)
    const bounds = rectFromPoints(path)
    const corners = edge.source.kind === "point" && edge.target.kind === "point" && !edge.points?.length && path.length === 2
      ? orientedLineFrameCorners(path[0]!, path[1]!, 6)
      : undefined
    return { id, kind: "edge", bounds, hitBounds: inflateRect(bounds, 6), path, ...(corners ? { corners } : {}) }
  }
  const text = entities.textsById.get(id)
  if (text) {
    const width = text.width ?? Math.max(1, text.text.length) * (text.fontSize ?? 12) * 0.6
    const height = text.height ?? (text.fontSize ?? 12) * 1.2
    return rectGeometry(id, "text", { x: text.x, y: text.y, width, height }, text.rotation ?? 0, 3, text.flipX, text.flipY)
  }
  const shape = entities.shapesById.get(id)
  if (shape) {
    if (shape.pathContours?.length) {
      const transformOrigin = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
      const pathContours = shape.pathContours.map((contour) => transformPathContour(translatePathContour(contour, shape.x, shape.y), transformOrigin, shape.rotation ?? 0, shape.flipX, shape.flipY))
      const contours = pathContours.map((contour) => flattenPathContour(contour))
      const path = contours.flat()
      const bounds = rectFromPoints(pathContours.flatMap(pathContourBoundsPoints))
      return { id, kind: "shape", bounds, hitBounds: inflateRect(bounds, 6), path, pathContours }
    }
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

function orientedLineFrameCorners(start: DiagramPoint, end: DiagramPoint, padding: number): ReadonlyArray<DiagramPoint> | undefined {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy)
  if (length <= 1e-8) return undefined
  const nx = -dy / length * padding, ny = dx / length * padding
  return [
    { x: start.x + nx, y: start.y + ny }, { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny }, { x: start.x - nx, y: start.y - ny },
  ]
}

export function resolveEdgePath(edge: DiagramEdge, entities: DiagramEntities): ReadonlyArray<DiagramPoint> {
  const routing = edge.routing
  if (routing?.mode === "auto") {
    const source = resolveEndpoint(edge.source, entities)
    const target = resolveEndpoint(edge.target, entities)
    const excluded = new Set<DiagramId>()
    for (const endpoint of [edge.source, edge.target]) {
      if (endpoint.kind === "node") excluded.add(endpoint.nodeId)
      else if (endpoint.kind === "port") {
        const port = entities.portsById.get(endpoint.portId)
        if (port) excluded.add(diagramPortHostId(port))
      }
    }
    const fixedJunctions = [...entities.junctionsById.values()].flatMap((junction) =>
      junction.hostEdgeId === edge.id && junction.anchor.kind === "fixed" ? [junction.anchor.point] : [])
    const waypoints = [...(routing.waypoints ?? []), ...fixedJunctions]
    const obstacleIds = [
      ...entities.nodesById.keys(), ...entities.textsById.keys(), ...entities.tablesById.keys(),
      ...entities.shapesById.keys(),
    ].filter((id) => !excluded.has(id))
    const obstacles = obstacleIds.flatMap((id) => {
      const geometry = createEntityGeometry(id, entities)
      return geometry && routeObstacleMayAffect(geometry.bounds, source, target, waypoints, routing.clearance ?? 0, routing.terminalLead ?? 12) ? [{ id, bounds: geometry.bounds }] : []
    })
    const existingRoutes = [...entities.edgesById.values()]
      .filter((candidate) => candidate.id !== edge.id && candidate.routing?.mode !== "auto" && !routeDependsOnEdge(candidate, edge.id, entities))
      .map((candidate) => ({ id: candidate.id, points: resolveEdgePath(candidate, entities) }))
    const routeOptions = {
      strictGrid: routing.strictGrid,
      gridSize: routing.gridSize,
      firstAxis: routing.firstAxis,
      terminalLead: routing.terminalLead,
      sourceDirection: routing.sourceDirection,
      targetDirection: routing.targetDirection,
      clearance: routing.clearance,
      maxBends: routing.maxBends,
      maxRouteBends: routing.maxRouteBends,
      tieBreak: routing.tieBreak,
      waypoints,
      routeHint: routing.routeHint,
      obstacles,
      existingRoutes,
    }
    let route = routeOrthogonalConnector(source, target, routeOptions)
    if (routing.routeHint && route.diagnostics.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) {
      route = routeOrthogonalConnector(source, target, { ...routeOptions, routeHint: undefined })
    }
    if (!route.diagnostics.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) return simplifyOrthogonalPath(route.path)
    return []
  }
  return [
    resolveEndpoint(edge.source, entities),
    ...(edge.points ?? []),
    resolveEndpoint(edge.target, entities),
  ]
}

function routeDependsOnEdge(edge: DiagramEdge, targetEdgeId: DiagramId, entities: DiagramEntities): boolean {
  const visited = new Set<DiagramId>()
  const endpointHost = (endpoint: DiagramEdgeEndpoint): DiagramId | null => {
    if (endpoint.kind === "junction") {
      const junction = entities.junctionsById.get(endpoint.junctionId)
      return junction?.anchor.kind === "route" ? junction.hostEdgeId : null
    }
    if (endpoint.kind !== "port") return null
    const port = entities.portsById.get(endpoint.portId)
    const hostId = port ? diagramPortHostId(port) : ""
    return entities.edgesById.has(hostId) ? hostId : null
  }
  const visit = (candidate: DiagramEdge): boolean => {
    if (visited.has(candidate.id)) return false
    visited.add(candidate.id)
    for (const endpoint of [candidate.source, candidate.target]) {
      const hostId = endpointHost(endpoint)
      if (hostId === targetEdgeId) return true
      const host = hostId ? entities.edgesById.get(hostId) : undefined
      if (host && visit(host)) return true
    }
    return false
  }
  return visit(edge)
}

function routeObstacleMayAffect(bounds: DiagramRect, source: DiagramPoint, target: DiagramPoint, waypoints: ReadonlyArray<DiagramPoint>, clearance: number, terminalLead: number): boolean {
  const stops = [source, ...waypoints, target]
  for (let index = 1; index < stops.length; index += 1) {
    const leg = rectFromPoints([stops[index - 1]!, stops[index]!])
    const margin = Math.max(leg.width, leg.height, clearance, terminalLead, 1) * 2 + clearance
    if (rectIntersects(bounds, inflateRect(leg, margin))) return true
  }
  return false
}

export function resolveEndpoint(endpoint: DiagramEdgeEndpoint, entities: DiagramEntities): DiagramPoint {
  if (endpoint.kind === "point") {
    return endpoint.point
  }
  if (endpoint.kind === "port") {
    const port = entities.portsById.get(endpoint.portId)
    return port ? resolvePortPoint(port, entities) : { x: 0, y: 0 }
  }
  if (endpoint.kind === "junction") {
    const junction = entities.junctionsById.get(endpoint.junctionId)
    const host = junction ? entities.edgesById.get(junction.hostEdgeId) : undefined
    return junction && host ? junction.anchor.kind === "fixed" ? junction.anchor.point : pointAtRouteFraction(resolveEdgePath(host, entities), junction.anchor.fraction) : { x: 0, y: 0 }
  }
  const node = entities.nodesById.get(endpoint.nodeId)
  return node ? rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }) : { x: 0, y: 0 }
}

export function resolvePortPoint(port: DiagramPort, entities: DiagramEntities): DiagramPoint {
  if ("nodeId" in port && port.nodeId) {
    const node = entities.nodesById.get(port.nodeId)
    if (!node) return { x: port.x, y: port.y }
    const point = { x: node.x + (node.flipX ? node.width - port.x : port.x), y: node.y + (node.flipY ? node.height - port.y : port.y) }
    return rotatePoint(point, rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }), node.rotation ?? 0)
  }
  const host = "hostId" in port ? port.hostId : undefined
  const anchor = "anchor" in port ? port.anchor : undefined
  if (!host || !anchor) return { x: 0, y: 0 }
  if (anchor.kind === "vertex") return resolveShapeVertex(host, anchor.index, entities) ?? { x: 0, y: 0 }
  if (anchor.kind === "route") {
    const edge = entities.edgesById.get(host)
    return edge ? pointAtRouteFraction(resolveEdgePath(edge, entities), anchor.fraction) : { x: 0, y: 0 }
  }
  const bounds = getPortHostBounds(host, entities)
  if (!bounds) return { x: anchor.x, y: anchor.y }
  const entity = entities.nodesById.get(host) ?? entities.shapesById.get(host) ?? entities.textsById.get(host) ?? entities.tablesById.get(host)
  let local = { x: bounds.x + anchor.x, y: bounds.y + anchor.y }
  if (entity && "width" in entity && "height" in entity) {
    local = { x: bounds.x + (entity.flipX ? bounds.width - anchor.x : anchor.x), y: bounds.y + (entity.flipY ? bounds.height - anchor.y : anchor.y) }
    return rotatePoint(local, rectCenter(bounds), entity.rotation ?? 0)
  }
  return local
}

export function diagramPortHostId(port: DiagramPort): DiagramId {
  if ("nodeId" in port && typeof port.nodeId === "string") return port.nodeId
  return (port as Extract<DiagramPort, { hostId: DiagramId }>).hostId ?? ""
}

export function isValidDiagramPortAnchor(hostId: DiagramId, anchor: DiagramPortAnchor, entities: DiagramEntities): boolean {
  if (!anchor || typeof anchor !== "object") return false
  if (anchor.kind === "vertex") {
    const shape = entities.shapesById.get(hostId)
    const vertices = shape?.points ?? (shape?.shape === "line" ? [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }] : null)
    return Boolean(vertices && Number.isInteger(anchor.index) && anchor.index >= 0 && anchor.index < vertices.length)
  }
  if (anchor.kind === "route") return entities.edgesById.has(hostId) && Number.isFinite(anchor.fraction) && anchor.fraction >= 0 && anchor.fraction <= 1
  if (entities.edgesById.has(hostId)) return false
  if (![anchor.x, anchor.y].every(Number.isFinite)) return false
  const bounds = getPortHostBounds(hostId, entities)
  return Boolean(bounds && anchor.x >= 0 && anchor.y >= 0 && anchor.x <= bounds.width && anchor.y <= bounds.height)
}

function getPortHostBounds(hostId: DiagramId, entities: DiagramEntities): DiagramRect | null {
  const node = entities.nodesById.get(hostId)
  if (node) return { x: node.x, y: node.y, width: node.width, height: node.height }
  const shape = entities.shapesById.get(hostId)
  if (shape) return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
  const text = entities.textsById.get(hostId)
  if (text) return { x: text.x, y: text.y, width: text.width ?? Math.max(1, text.text.length) * (text.fontSize ?? 12) * 0.6, height: text.height ?? (text.fontSize ?? 12) * 1.2 }
  const table = entities.tablesById.get(hostId)
  if (table) return { x: table.x, y: table.y, width: table.width, height: table.height }
  const group = entities.groupsById.get(hostId)
  if (group) return unionRects(group.childIds.map((id) => createEntityGeometry(id, entities)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect)))
  const edge = entities.edgesById.get(hostId)
  if (edge) return rectFromPoints(resolveEdgePath(edge, entities))
  return null
}

export function pointAtRouteFraction(path: ReadonlyArray<DiagramPoint>, fraction: number): DiagramPoint {
  if (path.length < 2) return path[0] ?? { x: 0, y: 0 }
  const lengths = path.slice(1).map((point, index) => distance(path[index]!, point))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total <= 1e-9) return path[0]!
  let offset = Math.max(0, Math.min(1, fraction)) * total
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!
    if (offset <= length || index === lengths.length - 1) {
      const ratio = length > 0 ? Math.max(0, Math.min(1, offset / length)) : 0
      const start = path[index]!, end = path[index + 1]!
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
    }
    offset -= length
  }
  return path[path.length - 1]!
}

function resolveShapeVertex(hostId: DiagramId, index: number, entities: DiagramEntities): DiagramPoint | null {
  const shape = entities.shapesById.get(hostId)
  if (!shape) return null
  const vertices = shape.points ?? (shape.shape === "line" ? [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }] : null)
  const point = vertices?.[index]
  if (!point) return null
  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  const worldPoint = { x: shape.x + (shape.flipX ? shape.width - point.x : point.x), y: shape.y + (shape.flipY ? shape.height - point.y : point.y) }
  return rotatePoint(worldPoint, center, shape.rotation ?? 0)
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
