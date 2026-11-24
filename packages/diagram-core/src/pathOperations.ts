import type { DiagramPathContour, DiagramPathSegment, DiagramPoint, DiagramRect } from "./types.js"

export type DiagramGeometryFailure = Readonly<{ ok: false; code: "degenerate-arc" | "no-intersection" | "unsupported-geometry" | "invalid-input"; message: string }>
export type DiagramGeometrySuccess<T> = Readonly<{ ok: true; value: T }>
export type DiagramGeometryResult<T> = DiagramGeometrySuccess<T> | DiagramGeometryFailure

const EPSILON = 1e-8

/** Creates the unique circular arc through start, through, and end; the middle point selects minor or major sweep. */
export function createCircularArc(start: DiagramPoint, through: DiagramPoint, end: DiagramPoint): DiagramGeometryResult<DiagramPathContour> {
  if (![start.x, start.y, through.x, through.y, end.x, end.y].every(Number.isFinite)) return failure("invalid-input", "Arc points must be finite.")
  const determinant = 2 * (start.x * (through.y - end.y) + through.x * (end.y - start.y) + end.x * (start.y - through.y))
  if (Math.abs(determinant) < EPSILON || same(start, through) || same(through, end) || same(start, end)) return failure("degenerate-arc", "Arc points must be distinct and non-collinear.")
  const a = start.x ** 2 + start.y ** 2, b = through.x ** 2 + through.y ** 2, c = end.x ** 2 + end.y ** 2
  const center = {
    x: (a * (through.y - end.y) + b * (end.y - start.y) + c * (start.y - through.y)) / determinant,
    y: (a * (end.x - through.x) + b * (start.x - end.x) + c * (through.x - start.x)) / determinant,
  }
  const radius = distance(start, center)
  const startAngle = angle(center, start), throughAngle = angle(center, through), endAngle = angle(center, end)
  const ccwEnd = positive(endAngle - startAngle)
  const ccwThrough = positive(throughAngle - startAngle)
  const sweepAngle = ccwThrough <= ccwEnd + EPSILON ? ccwEnd : ccwEnd - Math.PI * 2
  return { ok: true, value: { segments: [{ kind: "arc", center, radius, startAngle, sweepAngle }], closed: false } }
}

export function flattenPathContour(contour: DiagramPathContour, maxAngleStep = Math.PI / 48): ReadonlyArray<DiagramPoint> {
  const points: DiagramPoint[] = []
  for (const segment of contour.segments) {
    if (segment.kind === "line") {
      if (!points.length) points.push(segment.start)
      points.push(segment.end)
    } else {
      const count = Math.max(1, Math.ceil(Math.abs(segment.sweepAngle) / maxAngleStep))
      for (let index = points.length ? 1 : 0; index <= count; index += 1) {
        const theta = segment.startAngle + segment.sweepAngle * index / count
        points.push({ x: segment.center.x + Math.cos(theta) * segment.radius, y: segment.center.y + Math.sin(theta) * segment.radius })
      }
    }
  }
  if (contour.closed && points.length && !same(points[0]!, points[points.length - 1]!)) points.push(points[0]!)
  return points
}

export function pathContourSvg(contour: DiagramPathContour): string {
  const commands: string[] = []
  let current: DiagramPoint | null = null
  for (const segment of contour.segments) {
    if (segment.kind === "line") {
      if (!current || !same(current, segment.start)) commands.push(`M ${segment.start.x} ${segment.start.y}`)
      commands.push(`L ${segment.end.x} ${segment.end.y}`)
      current = segment.end
    } else {
      const start = arcPoint(segment.center, segment.radius, segment.startAngle)
      if (!current || !same(current, start)) commands.push(`M ${start.x} ${start.y}`)
      const pieces = Math.abs(segment.sweepAngle) >= Math.PI * 2 - EPSILON ? 2 : 1
      for (let index = 1; index <= pieces; index += 1) {
        const theta = segment.startAngle + segment.sweepAngle * index / pieces
        const end = arcPoint(segment.center, segment.radius, theta)
        const sweep = segment.sweepAngle / pieces
        commands.push(`A ${segment.radius} ${segment.radius} 0 ${Math.abs(sweep) > Math.PI ? 1 : 0} ${sweep >= 0 ? 1 : 0} ${end.x} ${end.y}`)
        current = end
      }
    }
  }
  if (contour.closed) commands.push("Z")
  return commands.join(" ")
}

/** Exact extrema points for computing bounds of line and circular-arc contours. */
export function pathContourBoundsPoints(contour: DiagramPathContour): ReadonlyArray<DiagramPoint> {
  const points: DiagramPoint[] = []
  for (const segment of contour.segments) {
    if (segment.kind === "line") points.push(segment.start, segment.end)
    else {
      points.push(arcPoint(segment.center, segment.radius, segment.startAngle), arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle))
      for (const theta of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) if (angleOnSweep(theta, segment.startAngle, segment.sweepAngle)) points.push(arcPoint(segment.center, segment.radius, theta))
    }
  }
  return points
}

export function transformPathContour(contour: DiagramPathContour, origin: DiagramPoint, rotation = 0, flipX = false, flipY = false): DiagramPathContour {
  const center = { x: origin.x, y: origin.y }
  const transform = (point: DiagramPoint): DiagramPoint => {
    const x = flipX ? 2 * center.x - point.x : point.x
    const y = flipY ? 2 * center.y - point.y : point.y
    const radians = rotation * Math.PI / 180, dx = x - center.x, dy = y - center.y
    return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) }
  }
  const reflected = flipX !== flipY
  return { ...contour, segments: contour.segments.map((segment): DiagramPathSegment => {
    if (segment.kind === "line") return { kind: "line", start: transform(segment.start), end: transform(segment.end) }
    const start = transform(arcPoint(segment.center, segment.radius, segment.startAngle))
    const transformedCenter = transform(segment.center)
    return { kind: "arc", center: transformedCenter, radius: segment.radius, startAngle: angle(transformedCenter, start), sweepAngle: reflected ? -segment.sweepAngle : segment.sweepAngle }
  }) }
}

export function translatePathContour(contour: DiagramPathContour, dx: number, dy: number): DiagramPathContour {
  const move = (point: DiagramPoint): DiagramPoint => ({ x: point.x + dx, y: point.y + dy })
  return { ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
    ? { kind: "line", start: move(segment.start), end: move(segment.end) }
    : { ...segment, center: move(segment.center) }) }
}

/** Returns circle arcs outside an axis-aligned rectangular trim boundary. Tangencies are ignored. */
export function trimCircleOutsideRect(center: DiagramPoint, radius: number, rect: DiagramRect): DiagramGeometryResult<ReadonlyArray<DiagramPathContour>> {
  if (![center.x, center.y, radius, rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || radius <= 0 || rect.width <= 0 || rect.height <= 0) return failure("invalid-input", "Circle and trim bounds must have finite positive dimensions.")
  const angles = circleRectAngles(center, radius, rect)
  if (angles.length < 2) {
    const circleInside = [
      { x: center.x + radius, y: center.y }, { x: center.x - radius, y: center.y },
      { x: center.x, y: center.y + radius }, { x: center.x, y: center.y - radius },
    ].every((point) => pointInRect(point, rect))
    if (circleInside) return { ok: true, value: [] }
    return { ok: true, value: [{ segments: [{ kind: "arc", center, radius, startAngle: 0, sweepAngle: Math.PI * 2 }], closed: true }] }
  }
  const result: DiagramPathContour[] = []
  for (let index = 0; index < angles.length; index += 1) {
    const from = angles[index]!, to = angles[(index + 1) % angles.length]! + (index === angles.length - 1 ? Math.PI * 2 : 0)
    const mid = from + (to - from) / 2
    if (!pointInRect(arcPoint(center, radius, mid), rect) && to - from > EPSILON) result.push({ segments: [{ kind: "arc", center, radius, startAngle: from, sweepAngle: to - from }], closed: false })
  }
  return { ok: true, value: result }
}

/** Intersects two line segments and returns a strict interior crossing (touches/endpoints are not split points). */
export function intersectLineSegments(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint): DiagramPoint | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y
  const denom = rx * sy - ry * sx
  if (Math.abs(denom) < EPSILON) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null
  return { x: a.x + t * rx, y: a.y + t * ry }
}

/** Removes the side of a two-point target line nearest the pick point; the cutter is unchanged. */
export function trimLineByCrossing(target: ReadonlyArray<DiagramPoint>, cutter: ReadonlyArray<DiagramPoint>, pick: DiagramPoint): DiagramGeometryResult<ReadonlyArray<DiagramPoint>> {
  if (target.length !== 2 || cutter.length !== 2) return failure("unsupported-geometry", "Trim currently supports two straight line segments.")
  const crossing = intersectLineSegments(target[0]!, target[1]!, cutter[0]!, cutter[1]!)
  if (!crossing) return failure("no-intersection", "The selected lines do not have a strict interior crossing.")
  const removeStart = distance(target[0]!, pick) <= distance(target[1]!, pick)
  return { ok: true, value: removeStart ? [crossing, target[1]!] : [target[0]!, crossing] }
}

/** Joins the selected shoulders of two crossing segments into one open contour with one shared bend. */
export function trimAndJoinLines(first: ReadonlyArray<DiagramPoint>, second: ReadonlyArray<DiagramPoint>, firstShoulder: DiagramPoint, secondShoulder: DiagramPoint): DiagramGeometryResult<DiagramPathContour> {
  if (first.length !== 2 || second.length !== 2) return failure("unsupported-geometry", "Trim & Join currently supports two straight line segments.")
  const crossing = intersectLineSegments(first[0]!, first[1]!, second[0]!, second[1]!)
  if (!crossing) return failure("no-intersection", "The selected lines do not have a strict interior crossing.")
  const endA = distance(first[0]!, firstShoulder) <= distance(first[1]!, firstShoulder) ? first[0]! : first[1]!
  const endB = distance(second[0]!, secondShoulder) <= distance(second[1]!, secondShoulder) ? second[0]! : second[1]!
  if (same(endA, crossing) || same(endB, crossing)) return failure("no-intersection", "The selected shoulders have zero length.")
  return { ok: true, value: { segments: [{ kind: "line", start: endA, end: crossing }, { kind: "line", start: crossing, end: endB }], closed: false } }
}

/** Exact circular arcs and straight cutter-boundary segments for circle minus rectangle. */
export function subtractRectFromCircle(center: DiagramPoint, radius: number, rect: DiagramRect): DiagramGeometryResult<ReadonlyArray<DiagramPathContour>> {
  if (![center.x, center.y, radius, rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || radius <= 0 || rect.width <= 0 || rect.height <= 0) return failure("invalid-input", "Circle and cutter bounds must have finite positive dimensions.")
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }]
  if (corners.every((point) => distance(center, point) < radius - EPSILON)) {
    return { ok: true, value: [
      { segments: [{ kind: "arc", center, radius, startAngle: 0, sweepAngle: Math.PI * 2 }], closed: true },
      { segments: corners.map((point, index) => ({ kind: "line", start: point, end: corners[(index + 1) % 4]! })), closed: true, hole: true },
    ] }
  }
  const angles = circleRectAngles(center, radius, rect)
  if (!angles.length) {
    const nearest = { x: Math.max(rect.x, Math.min(center.x, rect.x + rect.width)), y: Math.max(rect.y, Math.min(center.y, rect.y + rect.height)) }
    if (distance(nearest, center) >= radius - EPSILON) return { ok: true, value: [{ segments: [{ kind: "arc", center, radius, startAngle: 0, sweepAngle: Math.PI * 2 }], closed: true }] }
    if (corners.every((point) => distance(point, center) < radius)) return { ok: true, value: [] }
  }
  if (angles.length < 2) return { ok: true, value: [] }
  const boundary: DiagramPathSegment[] = []
  for (let index = 0; index < angles.length; index += 1) {
    const from = angles[index]!, to = angles[(index + 1) % angles.length]! + (index === angles.length - 1 ? 2 * Math.PI : 0)
    if (to - from <= EPSILON) continue
    const mid = arcPoint(center, radius, (from + to) / 2)
    if (!pointInRect(mid, rect)) boundary.push({ kind: "arc", center, radius, startAngle: from, sweepAngle: to - from })
  }
  for (let side = 0; side < 4; side += 1) {
    const start = corners[side]!, end = corners[(side + 1) % 4]!
    const points = [start, ...angles.map((angleValue) => arcPoint(center, radius, angleValue)).filter((point) => pointOnSegment(point, start, end)), end]
      .sort((a, b) => parameter(a, start, end) - parameter(b, start, end)).filter((point, index, all) => !index || !same(point, all[index - 1]!))
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]!, b = points[index]!
      if (distance(center, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }) < radius - EPSILON) boundary.push({ kind: "line", start: a, end: b })
    }
  }
  return { ok: true, value: stitchClosedContours(boundary) }
}

function circleRectAngles(center: DiagramPoint, radius: number, rect: DiagramRect): number[] {
  const points: DiagramPoint[] = []
  for (const x of [rect.x, rect.x + rect.width]) {
    const dx = x - center.x, disc = radius * radius - dx * dx
    if (disc <= EPSILON) continue
    for (const y of [center.y - Math.sqrt(disc), center.y + Math.sqrt(disc)]) if (y > rect.y + EPSILON && y < rect.y + rect.height - EPSILON) points.push({ x, y })
  }
  for (const y of [rect.y, rect.y + rect.height]) {
    const dy = y - center.y, disc = radius * radius - dy * dy
    if (disc <= EPSILON) continue
    for (const x of [center.x - Math.sqrt(disc), center.x + Math.sqrt(disc)]) if (x > rect.x + EPSILON && x < rect.x + rect.width - EPSILON) points.push({ x, y })
  }
  return [...new Set(points.map((point) => positive(angle(center, point)).toFixed(10)))].map(Number).sort((a, b) => a - b)
}
function failure(code: DiagramGeometryFailure["code"], message: string): DiagramGeometryFailure { return { ok: false, code, message } }
function same(a: DiagramPoint, b: DiagramPoint): boolean { return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON }
function distance(a: DiagramPoint, b: DiagramPoint): number { return Math.hypot(a.x - b.x, a.y - b.y) }
function angle(center: DiagramPoint, point: DiagramPoint): number { return Math.atan2(point.y - center.y, point.x - center.x) }
function positive(value: number): number { const result = value % (Math.PI * 2); return result < 0 ? result + Math.PI * 2 : result }
function angleOnSweep(value: number, start: number, sweep: number): boolean { return sweep >= 0 ? positive(value - start) <= sweep + EPSILON : positive(start - value) <= -sweep + EPSILON }
function arcPoint(center: DiagramPoint, radius: number, theta: number): DiagramPoint { return { x: center.x + Math.cos(theta) * radius, y: center.y + Math.sin(theta) * radius } }
function pointInRect(point: DiagramPoint, rect: DiagramRect): boolean { return point.x > rect.x + EPSILON && point.x < rect.x + rect.width - EPSILON && point.y > rect.y + EPSILON && point.y < rect.y + rect.height - EPSILON }
function pointOnSegment(point: DiagramPoint, a: DiagramPoint, b: DiagramPoint): boolean { return Math.abs((point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)) < 1e-6 && parameter(point, a, b) >= -EPSILON && parameter(point, a, b) <= 1 + EPSILON }
function parameter(point: DiagramPoint, a: DiagramPoint, b: DiagramPoint): number { const dx = b.x - a.x, dy = b.y - a.y; return Math.abs(dx) > Math.abs(dy) ? (point.x - a.x) / (dx || 1) : (point.y - a.y) / (dy || 1) }
function segmentEnds(segment: DiagramPathSegment): [DiagramPoint, DiagramPoint] { return segment.kind === "line" ? [segment.start, segment.end] : [arcPoint(segment.center, segment.radius, segment.startAngle), arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle)] }
function reverseSegment(segment: DiagramPathSegment): DiagramPathSegment { return segment.kind === "line" ? { kind: "line", start: segment.end, end: segment.start } : { ...segment, startAngle: segment.startAngle + segment.sweepAngle, sweepAngle: -segment.sweepAngle } }
function stitchClosedContours(segments: ReadonlyArray<DiagramPathSegment>): DiagramPathContour[] {
  const remaining = [...segments], contours: DiagramPathContour[] = []
  while (remaining.length) {
    const chain: DiagramPathSegment[] = [remaining.pop()!]
    let guard = 0
    while (guard++ < segments.length + 2) {
      const end = segmentEnds(chain[chain.length - 1]!)[1]
      if (same(end, segmentEnds(chain[0]!)[0])) break
      const index = remaining.findIndex((segment) => same(segmentEnds(segment)[0], end) || same(segmentEnds(segment)[1], end))
      if (index < 0) break
      let next = remaining.splice(index, 1)[0]!
      if (same(segmentEnds(next)[1], end)) next = reverseSegment(next)
      chain.push(next)
    }
    if (same(segmentEnds(chain[0]!)[0], segmentEnds(chain[chain.length - 1]!)[1])) contours.push({ segments: chain, closed: true })
  }
  return contours
}
