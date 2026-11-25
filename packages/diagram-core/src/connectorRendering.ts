import { createEntityGeometry, pointAtRouteFraction } from "./geometry.js"
import type { DiagramConnectorBridge, DiagramConnectorPathCommand, DiagramConnectorRenderGeometry, DiagramConnectorRenderOptions, DiagramEdge, DiagramJunctionRenderGeometry, DiagramPoint, DiagramScene } from "./types.js"

type Crossing = Readonly<{ point: DiagramPoint; lowerId: string; segmentIndex: number; t: number }>
type RenderBridge = DiagramConnectorBridge & Readonly<{ segmentIndex: number; t: number }>
type RenderableEdge = Readonly<{ edge: DiagramEdge; path: ReadonlyArray<DiagramPoint> }>
const EPSILON = 1e-9

/** Builds renderer-neutral connector paths from the current scene and render order. */
export function createConnectorRenderGeometry(scene: DiagramScene, options: DiagramConnectorRenderOptions = {}, orderedEdgeIds: ReadonlyArray<string> = scene.order.edgeIds): ReadonlyArray<DiagramConnectorRenderGeometry> {
  const cornerRadius = finiteNonNegative(options.cornerRadius ?? 0, "cornerRadius")
  const bridgeRadius = options.crossingBridge ? finiteNonNegative(options.crossingBridge.radius ?? 6, "crossingBridge.radius") : 0
  const junctionAppearance = options.junctionAppearance ?? "filled-dot"
  const junctionRadius = finiteNonNegative(options.junctionRadius ?? 3, "junctionRadius")
  if (junctionAppearance !== "filled-dot" && junctionAppearance !== "none") throw new RangeError("junctionAppearance must be filled-dot or none")
  const edges: RenderableEdge[] = []
  for (const id of orderedEdgeIds) {
    const edge = scene.entities.edgesById.get(id)
    const geometry = edge ? createEntityGeometry(id, scene.entities) : null
    if (edge && geometry?.kind === "edge" && geometry.path && geometry.path.length >= 2) edges.push({ edge, path: geometry.path })
  }
  const crossingsByUpper = new Map<string, Crossing[]>()
  const junctionsByHost = new Map<string, DiagramJunctionRenderGeometry[]>()
  for (const junction of scene.entities.junctionsById.values()) {
    const host = scene.entities.edgesById.get(junction.hostEdgeId)
    if (!host) continue
    const path = createEntityGeometry(host.id, scene.entities)?.path
    if (!path) continue
    const values = junctionsByHost.get(host.id) ?? []
    values.push({ id: junction.id, hostEdgeId: host.id, point: pointAtRouteFraction(path, junction.anchor.fraction), appearance: junctionAppearance, radius: junctionRadius })
    junctionsByHost.set(host.id, values)
  }
  if (bridgeRadius > 0) {
    for (let lower = 0; lower < edges.length; lower += 1) {
      for (let upper = lower + 1; upper < edges.length; upper += 1) {
        const lowerEdge = edges[lower]!, upperEdge = edges[upper]!
        for (let segmentIndex = 0; segmentIndex < upperEdge.path.length - 1; segmentIndex += 1) {
          const a = upperEdge.path[segmentIndex]!, b = upperEdge.path[segmentIndex + 1]!
          for (let underIndex = 0; underIndex < lowerEdge.path.length - 1; underIndex += 1) {
            const intersection = strictSegmentIntersection(a, b, lowerEdge.path[underIndex]!, lowerEdge.path[underIndex + 1]!)
            if (!intersection || atAnyEndpoint(intersection.point, upperEdge.path) || atAnyEndpoint(intersection.point, lowerEdge.path)
              || [...(junctionsByHost.get(upperEdge.edge.id) ?? []), ...(junctionsByHost.get(lowerEdge.edge.id) ?? [])].some((junction) => samePoint(junction.point, intersection.point))) continue
            const entry = { point: intersection.point, lowerId: lowerEdge.edge.id, segmentIndex, t: intersection.t }
            const values = crossingsByUpper.get(upperEdge.edge.id) ?? []
            if (!values.some((value) => value.segmentIndex === segmentIndex && distanceSquared(value.point, entry.point) <= EPSILON * EPSILON)) values.push(entry)
            crossingsByUpper.set(upperEdge.edge.id, values)
          }
        }
      }
    }
  }
  return Object.freeze(edges.map(({ edge, path }) => {
    const crossings = crossingsByUpper.get(edge.id) ?? []
    const renderBridges = createBridges(edge.id, crossings, path, bridgeRadius, cornerRadius)
    const bridges = renderBridges.map(({ segmentIndex: _segmentIndex, t: _t, ...bridge }) => bridge)
    return Object.freeze({ id: edge.id, commands: Object.freeze(buildPath(path, cornerRadius, renderBridges)), bridges: Object.freeze(bridges), junctions: Object.freeze(junctionsByHost.get(edge.id) ?? []) })
  }))
}

function buildPath(path: ReadonlyArray<DiagramPoint>, requestedRadius: number, bridges: ReadonlyArray<RenderBridge>): DiagramConnectorPathCommand[] {
  const lengths = path.slice(0, -1).map((point, index) => distance(point, path[index + 1]!))
  const cornerRadii = path.map((point, index) => {
    if (index === 0 || index === path.length - 1 || requestedRadius === 0) return 0
    const incoming = unit(point, path[index - 1]!), outgoing = unit(point, path[index + 1]!)
    if (Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) <= EPSILON || incoming.x * outgoing.x + incoming.y * outgoing.y > -1 + EPSILON) {
      if (Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) <= EPSILON) return 0
    }
    const prevLength = lengths[index - 1]!, nextLength = lengths[index]!
    return Math.min(requestedRadius, prevLength / 2, nextLength / 2)
  })
  const commands: DiagramConnectorPathCommand[] = [{ kind: "moveTo", point: path[0]! }]
  for (let index = 0; index < lengths.length; index += 1) {
    const start = path[index]!, end = path[index + 1]!, direction = unit(start, end)
    const startTrim = index > 0 ? cornerRadii[index]! : 0
    const endTrim = index + 1 < path.length - 1 ? cornerRadii[index + 1]! : 0
    const startPoint = add(start, scale(direction, startTrim))
    const endPoint = add(end, scale(direction, -endTrim))
    if (!samePoint(lastCommandPoint(commands), startPoint)) commands.push({ kind: "lineTo", point: startPoint })
    const events = bridges.filter((bridge) => bridge.segmentIndex === index).sort((a, b) => a.t - b.t)
    for (const bridge of events) {
      const radius = Math.min(bridge.radius, Math.max(0, dot(subtract(bridge.point, start), direction) - startTrim), Math.max(0, dot(subtract(end, bridge.point), direction) - endTrim))
      if (radius <= EPSILON) continue
      const before = add(bridge.point, scale(direction, -radius))
      const after = add(bridge.point, scale(direction, radius))
      if (!samePoint(lastCommandPoint(commands), before)) commands.push({ kind: "lineTo", point: before })
      const normal = bridgeNormal(direction)
      const lift = 4 * radius / 3
      commands.push({ kind: "cubicTo", control1: add(add(before, scale(direction, 2 * radius / 3)), scale(normal, lift)), control2: add(add(after, scale(direction, -2 * radius / 3)), scale(normal, lift)), point: after })
    }
    if (index + 1 < path.length - 1 && endTrim > 0) {
      if (!samePoint(lastCommandPoint(commands), endPoint)) commands.push({ kind: "lineTo", point: endPoint })
      commands.push({ kind: "quadraticTo", control: end, point: add(end, scale(unit(end, path[index + 2]!), endTrim)) })
    } else if (!samePoint(lastCommandPoint(commands), endPoint)) commands.push({ kind: "lineTo", point: endPoint })
  }
  return commands
}

function createBridges(edgeId: string, crossings: ReadonlyArray<Crossing>, path: ReadonlyArray<DiagramPoint>, radius: number, cornerRadius: number): RenderBridge[] {
  const lengths = path.slice(0, -1).map((point, index) => distance(point, path[index + 1]!))
  const endpointCornerRadius = (index: number) => index === 0 || index === path.length - 1 ? 0 : Math.min(cornerRadius, lengths[index - 1]! / 2, lengths[index]! / 2)
  return crossings.map((crossing) => {
    const previous = crossings.filter((item) => item.segmentIndex === crossing.segmentIndex && item !== crossing).map((item) => distance(item.point, crossing.point) / 2)
    const segmentLength = lengths[crossing.segmentIndex] ?? 0
    const available = Math.min(segmentLength * crossing.t - endpointCornerRadius(crossing.segmentIndex), segmentLength * (1 - crossing.t) - endpointCornerRadius(crossing.segmentIndex + 1), ...previous, radius)
    return Object.freeze({ point: crossing.point, overId: edgeId, underId: crossing.lowerId, radius: Math.max(0, available), segmentIndex: crossing.segmentIndex, t: crossing.t })
  }).filter((bridge) => bridge.radius > EPSILON)
}

function strictSegmentIntersection(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint): Readonly<{ point: DiagramPoint; t: number }> | null {
  const ab = subtract(b, a), cd = subtract(d, c), denominator = ab.x * cd.y - ab.y * cd.x
  if (Math.abs(denominator) <= EPSILON) return null
  const ac = subtract(c, a), t = (ac.x * cd.y - ac.y * cd.x) / denominator, u = (ac.x * ab.y - ac.y * ab.x) / denominator
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null
  return { point: add(a, scale(ab, t)), t }
}
function atAnyEndpoint(point: DiagramPoint, path: ReadonlyArray<DiagramPoint>): boolean { return samePoint(point, path[0]!) || samePoint(point, path[path.length - 1]!) }
function finiteNonNegative(value: number, name: string): number { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative world-unit value.`); return value }
function unit(a: DiagramPoint, b: DiagramPoint): DiagramPoint { const length = distance(a, b); return length > EPSILON ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 0, y: 0 } }
function distance(a: DiagramPoint, b: DiagramPoint): number { return Math.hypot(b.x - a.x, b.y - a.y) }
function distanceSquared(a: DiagramPoint, b: DiagramPoint): number { return (b.x - a.x) ** 2 + (b.y - a.y) ** 2 }
function samePoint(a: DiagramPoint, b: DiagramPoint): boolean { return distanceSquared(a, b) <= EPSILON * EPSILON }
function add(a: DiagramPoint, b: DiagramPoint): DiagramPoint { return { x: a.x + b.x, y: a.y + b.y } }
function subtract(a: DiagramPoint, b: DiagramPoint): DiagramPoint { return { x: a.x - b.x, y: a.y - b.y } }
function scale(a: DiagramPoint, amount: number): DiagramPoint { return { x: a.x * amount, y: a.y * amount } }
function dot(a: DiagramPoint, b: DiagramPoint): number { return a.x * b.x + a.y * b.y }
function bridgeNormal(direction: DiagramPoint): DiagramPoint { const normal = { x: direction.y, y: -direction.x }; return normal.y > 0 || (normal.y === 0 && normal.x < 0) ? scale(normal, -1) : normal }
function lastCommandPoint(commands: ReadonlyArray<DiagramConnectorPathCommand>): DiagramPoint { return commands[commands.length - 1]!.point }
