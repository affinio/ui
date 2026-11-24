import type { DiagramId, DiagramPathContour, DiagramPathSegment, DiagramPoint, DiagramRect, DiagramSceneInput, DiagramShape, DiagramSweepTrimFinding, DiagramSweepTrimResult, DiagramSweepTrimTargetResult, DiagramSweepTrimUpdate } from "./types.js"

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
    } else if (segment.kind === "arc") {
      const count = Math.max(1, Math.ceil(Math.abs(segment.sweepAngle) / maxAngleStep))
      for (let index = points.length ? 1 : 0; index <= count; index += 1) {
        const theta = segment.startAngle + segment.sweepAngle * index / count
        points.push({ x: segment.center.x + Math.cos(theta) * segment.radius, y: segment.center.y + Math.sin(theta) * segment.radius })
      }
    } else {
      const flattened = flattenCubic(segment, 0.01)
      if (!points.length) points.push(flattened[0]!)
      points.push(...flattened.slice(1))
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
    } else if (segment.kind === "arc") {
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
    } else {
      if (!current || !same(current, segment.start)) commands.push(`M ${segment.start.x} ${segment.start.y}`)
      commands.push(`C ${segment.control1.x} ${segment.control1.y} ${segment.control2.x} ${segment.control2.y} ${segment.end.x} ${segment.end.y}`)
      current = segment.end
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
    else if (segment.kind === "arc") {
      points.push(arcPoint(segment.center, segment.radius, segment.startAngle), arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle))
      for (const theta of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) if (angleOnSweep(theta, segment.startAngle, segment.sweepAngle)) points.push(arcPoint(segment.center, segment.radius, theta))
    } else {
      points.push(segment.start, segment.end)
      for (const t of [...cubicExtrema(segment.start.x, segment.control1.x, segment.control2.x, segment.end.x), ...cubicExtrema(segment.start.y, segment.control1.y, segment.control2.y, segment.end.y)]) points.push(cubicPoint(segment, t))
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
    if (segment.kind === "cubic") return { kind: "cubic", start: transform(segment.start), control1: transform(segment.control1), control2: transform(segment.control2), end: transform(segment.end) }
    const start = transform(arcPoint(segment.center, segment.radius, segment.startAngle))
    const transformedCenter = transform(segment.center)
    return { kind: "arc", center: transformedCenter, radius: segment.radius, startAngle: angle(transformedCenter, start), sweepAngle: reflected ? -segment.sweepAngle : segment.sweepAngle }
  }) }
}

export function translatePathContour(contour: DiagramPathContour, dx: number, dy: number): DiagramPathContour {
  const move = (point: DiagramPoint): DiagramPoint => ({ x: point.x + dx, y: point.y + dy })
  return { ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
    ? { kind: "line", start: move(segment.start), end: move(segment.end) }
    : segment.kind === "arc"
      ? { ...segment, center: move(segment.center) }
      : { kind: "cubic", start: move(segment.start), control1: move(segment.control1), control2: move(segment.control2), end: move(segment.end) }) }
}

/** Parses SVG-like M/L/C/Z path data into exact Core contours. Relative commands and repeated coordinate groups follow SVG rules. */
export function parseSvgPathData(data: string): DiagramGeometryResult<ReadonlyArray<DiagramPathContour>> {
  if (typeof data !== "string" || !data.trim()) return failure("invalid-input", "SVG path data must be a non-empty string.")
  const tokens: string[] = []
  const tokenPattern = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g
  let previousEnd = 0
  let match: RegExpExecArray | null
  while ((match = tokenPattern.exec(data))) {
    if (!/^[\s,]*$/.test(data.slice(previousEnd, match.index))) return failure("invalid-input", "SVG path data contains invalid characters.")
    tokens.push(match[0])
    previousEnd = match.index! + match[0].length
  }
  if (!/^[\s,]*$/.test(data.slice(previousEnd))) return failure("invalid-input", "SVG path data contains invalid characters.")
  const contours: DiagramPathContour[] = []
  let index = 0, command = "", current: DiagramPoint | null = null, subpathStart: DiagramPoint | null = null
  let segments: DiagramPathSegment[] = [], closed = false
  const isCommand = (token: string | undefined): boolean => Boolean(token && /^[a-zA-Z]$/.test(token))
  const flush = (): void => {
    if (segments.length) contours.push({ segments, ...(closed ? { closed: true } : {}) })
    segments = []
    closed = false
  }
  const readPoint = (relative: boolean): DiagramPoint | null => {
    if (index + 1 >= tokens.length || isCommand(tokens[index]) || isCommand(tokens[index + 1])) return null
    const x = Number(tokens[index]), y = Number(tokens[index + 1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    index += 2
    return relative && current ? { x: current.x + x, y: current.y + y } : { x, y }
  }
  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++]!
    else if (!command) return failure("invalid-input", "SVG path data must begin each parameter group with a command.")
    const upper = command.toUpperCase(), relative = command !== upper
    if (upper === "Z") {
      if (!subpathStart || !segments.length) return failure("invalid-input", "Close-path command requires an active contour.")
      closed = true
      current = subpathStart
      flush()
      subpathStart = null
      command = ""
      continue
    }
    if (upper !== "M" && upper !== "L" && upper !== "C") return failure("unsupported-geometry", `SVG command ${command} is not supported; use M, L, C, and Z.`)
    if (upper === "M") {
      if (segments.length) flush()
      const point = readPoint(relative)
      if (!point) return failure("invalid-input", "Move command requires a finite coordinate pair.")
      current = point
      subpathStart = point
      command = relative ? "l" : "L"
      continue
    }
    if (!current || !subpathStart) return failure("invalid-input", "Line and cubic commands require an active contour.")
    if (upper === "L") {
      const end = readPoint(relative)
      if (!end) return failure("invalid-input", "Line command requires a finite coordinate pair.")
      segments.push({ kind: "line", start: current, end })
      current = end
      continue
    }
    const control1 = readPoint(relative), control2 = readPoint(relative), end = readPoint(relative)
    if (!control1 || !control2 || !end) return failure("invalid-input", "Cubic command requires three finite coordinate pairs.")
    segments.push({ kind: "cubic", start: current, control1, control2, end })
    current = end
  }
  if (segments.length) flush()
  if (!contours.length) return failure("invalid-input", "SVG path data must contain at least one drawable contour.")
  return { ok: true, value: contours }
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

/**
 * Calculates a deterministic selection-based sweep trim without mutating the scene or inventing IDs.
 * The directed stroke's left side is removed from each crossed open path segment; targets are cut independently.
 * `tolerance` is in world units and is used only to coalesce duplicate intersections at stroke vertices.
 */
export function trimSelectionByStroke(scene: DiagramSceneInput, input: Readonly<{ targetIds: ReadonlyArray<DiagramId>; stroke: ReadonlyArray<DiagramPoint>; tolerance: number }>): DiagramSweepTrimResult {
  const targets: DiagramSweepTrimTargetResult[] = []
  const updates: DiagramSweepTrimUpdate[] = []
  const findings: DiagramSweepTrimFinding[] = []
  const fail = (code: DiagramSweepTrimFinding["code"], message: string, targetId?: DiagramId): DiagramSweepTrimFinding => ({ code, message, ...(targetId === undefined ? {} : { targetId }) })
  if (!scene || !input || !Array.isArray(input.targetIds) || !Array.isArray(input.stroke) || input.stroke.length < 2
    || !Number.isFinite(input.tolerance) || input.tolerance < 0
    || input.stroke.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    const finding = fail("invalid-input", "A sweep trim requires at least two finite stroke points and a finite non-negative world tolerance.")
    return { ok: false, targets, updates, findings: [finding] }
  }
  const strokeLengths = input.stroke.slice(1).map((point, index) => distance(input.stroke[index]!, point))
  if (strokeLengths.every((length) => length <= EPSILON)) {
    const finding = fail("invalid-input", "The sweep stroke must have non-zero length.")
    return { ok: false, targets, updates, findings: [finding] }
  }
  const strokeOffsets: number[] = [0]
  for (const length of strokeLengths) strokeOffsets.push(strokeOffsets[strokeOffsets.length - 1]! + length)
  const uniqueIds = [...new Set(input.targetIds)]
  const shapeById = new Map((scene.shapes ?? []).map((shape) => [shape.id, shape]))
  const edgeIds = new Set((scene.edges ?? []).map((edge) => edge.id))
  for (const id of uniqueIds) {
    const shape = shapeById.get(id)
    const addFinding = (code: DiagramSweepTrimFinding["code"], message: string, retained: ReadonlyArray<DiagramPathContour> = []): void => {
      const finding = fail(code, message, id)
      findings.push(finding)
      targets.push({ id, changed: false, retained, cutPoints: [], preview: null, finding })
    }
    if (edgeIds.has(id)) {
      addFinding("connected-edge", "DiagramEdge targets are not trimmed because endpoint and port connectivity must remain explicit.")
      continue
    }
    if (!shape) {
      addFinding("unsupported-target", "Sweep trim supports selected line/path shapes only.")
      continue
    }
    if (shape.shape !== "line" || shape.metadata?.locked || shape.metadata?.readOnly) {
      addFinding(shape.metadata?.locked || shape.metadata?.readOnly ? "locked-target" : "unsupported-target", shape.metadata?.locked || shape.metadata?.readOnly ? "Locked or read-only shapes cannot be trimmed." : "Sweep trim supports selected line/path shapes only.")
      continue
    }
    if (![shape.x, shape.y, shape.width, shape.height, shape.rotation ?? 0].every(Number.isFinite) || shape.width < 0 || shape.height < 0
      || shape.points?.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
      || shape.pathContours?.some((contour) => contour.segments.some((segment) => segment.kind === "line"
        ? ![segment.start.x, segment.start.y, segment.end.x, segment.end.y].every(Number.isFinite)
        : segment.kind === "arc"
          ? ![segment.center.x, segment.center.y, segment.radius, segment.startAngle, segment.sweepAngle].every(Number.isFinite) || segment.radius <= 0 || Math.abs(segment.sweepAngle) <= EPSILON
          : ![segment.start.x, segment.start.y, segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y, segment.end.x, segment.end.y].every(Number.isFinite)))) {
      addFinding("invalid-input", "The selected path contains invalid or non-finite geometry.")
      continue
    }
    if ((scene.ports ?? []).some((port) => ("hostId" in port ? port.hostId === id : port.nodeId === id))) {
      addFinding("anchored-host", "Shapes hosting diagram ports are left unchanged so connector attachment positions cannot be altered.")
      continue
    }
    const sourceContours = shape.pathContours?.length
      ? shape.pathContours.map((contour) => transformPathContour(translatePathContour(contour, shape.x, shape.y), { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, shape.rotation ?? 0, shape.flipX, shape.flipY))
      : [{ segments: shapeLinePoints(shape).slice(1).map((end, index): DiagramPathSegment => ({ kind: "line", start: shapeLinePoints(shape)[index]!, end })), closed: false }]
    if (sourceContours.some((contour) => contour.segments.some((segment) => segment.kind === "cubic"))) {
      addFinding("unsupported-geometry", "Sweep Trim does not yet split cubic Bézier segments; the target is unchanged.", sourceContours)
      continue
    }
    const retained: DiagramPathContour[] = []
    const cutPoints: DiagramPoint[] = []
    let ambiguous = false
    let hasUnsupportedContour = false
    for (const contour of sourceContours) {
      if (contour.closed || contour.hole) {
        retained.push(contour)
        hasUnsupportedContour = true
        continue
      }
      const outputSegments: DiagramPathSegment[] = []
      for (const segment of contour.segments) {
        const intersections = collectStrokeIntersections(segment, input.stroke, strokeLengths, strokeOffsets, input.tolerance)
        if (!intersections.length) {
          outputSegments.push(segment)
          continue
        }
        const crossing = intersections[0]!
        if (!Number.isFinite(crossing.targetT)) {
          ambiguous = true
          break
        }
        const tangent = segmentTangentAt(segment, crossing.targetT)
        const strokeSegment = strokeDirectionAt(input.stroke, crossing.strokeIndex)
        const side = cross(strokeSegment, tangent)
        if (Math.abs(side) <= EPSILON * Math.max(1, Math.hypot(strokeSegment.x, strokeSegment.y) * Math.hypot(tangent.x, tangent.y))) {
          ambiguous = true
          break
        }
        const parts = splitPathSegment(segment, crossing.targetT)
        const keep = side > 0 ? parts[0] : parts[1]
        if (keep && segmentLength(keep) > Math.max(EPSILON, input.tolerance * 1e-9)) outputSegments.push(keep)
        cutPoints.push(crossing.point)
      }
      if (ambiguous) break
      retained.push(...stitchOpenSegments(outputSegments))
    }
    if (ambiguous) {
      addFinding("ambiguous-intersection", "The stroke is tangent or parallel at the nearest crossing, so it does not select a safe side.", sourceContours)
      continue
    }
    if (!cutPoints.length) {
      addFinding(hasUnsupportedContour ? "unsupported-target" : "no-intersection", hasUnsupportedContour ? "Closed contours and holes are preserved but are not cut by sweep Trim." : "The stroke does not cross a supported interior segment of this target.", sourceContours)
      continue
    }
    if (!retained.some((contour) => contour.segments.length)) {
      addFinding("ambiguous-intersection", "The stroke would remove the entire target; whole-object deletion is not part of sweep trim.", sourceContours)
      continue
    }
    // The command takes transformed world geometry, then canonicalizes its transform. Use the same canonical output for preview.
    const worldContours = retained
    const worldPoints = worldContours.flatMap(pathContourBoundsPoints)
    const worldMinX = Math.min(...worldPoints.map((point) => point.x)), worldMinY = Math.min(...worldPoints.map((point) => point.y))
    const worldMaxX = Math.max(...worldPoints.map((point) => point.x)), worldMaxY = Math.max(...worldPoints.map((point) => point.y))
    const canonicalPreview: DiagramShape = { ...shape, shape: "line", x: worldMinX, y: worldMinY, width: worldMaxX - worldMinX, height: worldMaxY - worldMinY, rotation: 0, flipX: false, flipY: false, points: undefined, pathContours: worldContours.map((contour) => translatePathContour(contour, -worldMinX, -worldMinY)) }
    const update: DiagramSweepTrimUpdate = { type: "updateShapePath", id, pathContours: worldContours, worldSpace: true }
    updates.push(update)
    const finding = hasUnsupportedContour ? fail("unsupported-target", "Closed contours and holes were preserved but not cut by sweep Trim.", id) : undefined
    if (finding) findings.push(finding)
    targets.push({ id, changed: true, retained: worldContours, cutPoints, preview: canonicalPreview, update, ...(finding ? { finding } : {}) })
  }
  return { ok: true, targets, updates, findings }
}

type SweepIntersection = Readonly<{ point: DiagramPoint; targetT: number; strokeIndex: number; progress: number }>

function shapeLinePoints(shape: DiagramShape): DiagramPoint[] {
  const points = shape.points?.length ? shape.points : [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }]
  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  return points.map((point) => rotatePoint({
    x: shape.x + (shape.flipX ? shape.width - point.x : point.x),
    y: shape.y + (shape.flipY ? shape.height - point.y : point.y),
  }, center, shape.rotation ?? 0))
}

function rotatePoint(point: DiagramPoint, center: DiagramPoint, degrees: number): DiagramPoint {
  const radians = degrees * Math.PI / 180, x = point.x - center.x, y = point.y - center.y
  return { x: center.x + x * Math.cos(radians) - y * Math.sin(radians), y: center.y + x * Math.sin(radians) + y * Math.cos(radians) }
}

function collectStrokeIntersections(segment: DiagramPathSegment, stroke: ReadonlyArray<DiagramPoint>, lengths: ReadonlyArray<number>, offsets: ReadonlyArray<number>, tolerance: number): SweepIntersection[] {
  const candidates: SweepIntersection[] = []
  for (let index = 0; index < lengths.length; index += 1) {
    const a = stroke[index]!, b = stroke[index + 1]!
    if (lengths[index]! <= EPSILON) continue
    const found = segment.kind === "line" ? lineLineIntersections(segment, a, b) : segment.kind === "arc" ? arcLineIntersections(segment, a, b) : []
    for (const item of found) {
      candidates.push({ ...item, strokeIndex: index, progress: offsets[index]! + item.strokeT * lengths[index]! })
    }
  }
  candidates.sort((a, b) => a.progress - b.progress || a.strokeIndex - b.strokeIndex || a.point.x - b.point.x || a.point.y - b.point.y)
  const unique: SweepIntersection[] = []
  for (const candidate of candidates) {
    if (!unique.some((item) => distance(item.point, candidate.point) <= Math.max(EPSILON, tolerance))) unique.push(candidate)
  }
  if (unique.length > 1 && Math.abs(unique[0]!.progress - unique[1]!.progress) <= Math.max(EPSILON, tolerance) && distance(unique[0]!.point, unique[1]!.point) > Math.max(EPSILON, tolerance)) {
    return [{ ...unique[0]!, targetT: Number.NaN }]
  }
  return unique
}

function lineLineIntersections(target: Extract<DiagramPathSegment, { kind: "line" }>, a: DiagramPoint, b: DiagramPoint): Array<Readonly<{ point: DiagramPoint; targetT: number; strokeT: number }>> {
  const rx = target.end.x - target.start.x, ry = target.end.y - target.start.y
  const sx = b.x - a.x, sy = b.y - a.y
  const denominator = cross({ x: rx, y: ry }, { x: sx, y: sy })
  const qx = a.x - target.start.x, qy = a.y - target.start.y
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross({ x: qx, y: qy }, { x: rx, y: ry })) <= EPSILON) return [{ point: a, targetT: Number.NaN, strokeT: 0 }]
    return []
  }
  const targetT = cross({ x: qx, y: qy }, { x: sx, y: sy }) / denominator
  const strokeT = cross({ x: qx, y: qy }, { x: rx, y: ry }) / denominator
  if (targetT < -EPSILON || targetT > 1 + EPSILON || strokeT < -EPSILON || strokeT > 1 + EPSILON) return []
  const t = Math.max(0, Math.min(1, strokeT))
  return [{ point: { x: a.x + sx * t, y: a.y + sy * t }, targetT: targetT <= EPSILON || targetT >= 1 - EPSILON ? Number.NaN : targetT, strokeT: t }]
}

function arcLineIntersections(arc: Extract<DiagramPathSegment, { kind: "arc" }>, a: DiagramPoint, b: DiagramPoint): Array<Readonly<{ point: DiagramPoint; targetT: number; strokeT: number }>> {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - arc.center.x, fy = a.y - arc.center.y
  const aa = dx * dx + dy * dy
  if (aa <= EPSILON) return []
  const bb = 2 * (fx * dx + fy * dy), cc = fx * fx + fy * fy - arc.radius * arc.radius
  const discriminant = bb * bb - 4 * aa * cc
  if (discriminant < -EPSILON) return []
  if (discriminant <= EPSILON) {
    const strokeT = -bb / (2 * aa)
    if (strokeT < -EPSILON || strokeT > 1 + EPSILON) return []
    const t = Math.max(0, Math.min(1, strokeT))
    const point = { x: a.x + dx * t, y: a.y + dy * t }
    return angleOnSweep(angle(arc.center, point), arc.startAngle, arc.sweepAngle) ? [{ point, targetT: Number.NaN, strokeT: t }] : []
  }
  const root = Math.sqrt(discriminant)
  const roots = [(-bb - root) / (2 * aa), (-bb + root) / (2 * aa)]
  const result: Array<Readonly<{ point: DiagramPoint; targetT: number; strokeT: number }>> = []
  for (const strokeT of roots) {
    if (strokeT < -EPSILON || strokeT > 1 + EPSILON) continue
    const t = Math.max(0, Math.min(1, strokeT))
    const point = { x: a.x + dx * t, y: a.y + dy * t }
    const theta = angle(arc.center, point)
    if (!angleOnSweep(theta, arc.startAngle, arc.sweepAngle)) continue
    const targetT = arc.sweepAngle >= 0 ? positive(theta - arc.startAngle) / arc.sweepAngle : positive(arc.startAngle - theta) / -arc.sweepAngle
    result.push({ point, targetT: targetT <= EPSILON || targetT >= 1 - EPSILON ? Number.NaN : targetT, strokeT: t })
  }
  return result
}

function segmentTangentAt(segment: DiagramPathSegment, t: number): DiagramPoint {
  if (segment.kind === "line") return { x: segment.end.x - segment.start.x, y: segment.end.y - segment.start.y }
  if (segment.kind === "cubic") {
    const u = 1 - t
    return {
      x: 3 * u * u * (segment.control1.x - segment.start.x) + 6 * u * t * (segment.control2.x - segment.control1.x) + 3 * t * t * (segment.end.x - segment.control2.x),
      y: 3 * u * u * (segment.control1.y - segment.start.y) + 6 * u * t * (segment.control2.y - segment.control1.y) + 3 * t * t * (segment.end.y - segment.control2.y),
    }
  }
  const theta = segment.startAngle + segment.sweepAngle * t, direction = Math.sign(segment.sweepAngle)
  return { x: -Math.sin(theta) * direction, y: Math.cos(theta) * direction }
}

function strokeDirectionAt(stroke: ReadonlyArray<DiagramPoint>, index: number): DiagramPoint {
  return { x: stroke[index + 1]!.x - stroke[index]!.x, y: stroke[index + 1]!.y - stroke[index]!.y }
}

function splitPathSegment(segment: DiagramPathSegment, t: number): [DiagramPathSegment | null, DiagramPathSegment | null] {
  if (segment.kind === "line") {
    const point = { x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t }
    return [t > EPSILON ? { kind: "line", start: segment.start, end: point } : null, t < 1 - EPSILON ? { kind: "line", start: point, end: segment.end } : null]
  }
  if (segment.kind === "cubic") return [null, null]
  const angleAt = segment.startAngle + segment.sweepAngle * t
  return [t > EPSILON ? { ...segment, sweepAngle: segment.sweepAngle * t } : null, t < 1 - EPSILON ? { ...segment, startAngle: angleAt, sweepAngle: segment.sweepAngle * (1 - t) } : null]
}

function stitchOpenSegments(segments: ReadonlyArray<DiagramPathSegment>): DiagramPathContour[] {
  const contours: DiagramPathContour[] = []
  let current: DiagramPathSegment[] = []
  for (const segment of segments) {
    const previous = current[current.length - 1]
    if (previous && distance(segmentEnd(previous), segmentStart(segment)) > EPSILON) {
      contours.push({ segments: current, closed: false })
      current = []
    }
    current.push(segment)
  }
  if (current.length) contours.push({ segments: current, closed: false })
  return contours
}

function segmentStart(segment: DiagramPathSegment): DiagramPoint { return segment.kind === "line" || segment.kind === "cubic" ? segment.start : arcPoint(segment.center, segment.radius, segment.startAngle) }
function segmentEnd(segment: DiagramPathSegment): DiagramPoint { return segment.kind === "line" || segment.kind === "cubic" ? segment.end : arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle) }
function segmentLength(segment: DiagramPathSegment): number { return segment.kind === "line" ? distance(segment.start, segment.end) : segment.kind === "arc" ? Math.abs(segment.sweepAngle) * segment.radius : 0 }
function cross(a: DiagramPoint, b: DiagramPoint): number { return a.x * b.y - a.y * b.x }

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

function cubicPoint(segment: Extract<DiagramPathSegment, { kind: "cubic" }>, t: number): DiagramPoint {
  const u = 1 - t, a = u ** 3, b = 3 * u * u * t, c = 3 * u * t * t, d = t ** 3
  return { x: a * segment.start.x + b * segment.control1.x + c * segment.control2.x + d * segment.end.x, y: a * segment.start.y + b * segment.control1.y + c * segment.control2.y + d * segment.end.y }
}

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3, b = 2 * (p0 - 2 * p1 + p2), c = p1 - p0
  if (Math.abs(a) <= EPSILON) {
    if (Math.abs(b) <= EPSILON) return []
    const t = -c / b
    return t > 0 && t < 1 ? [t] : []
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const root = Math.sqrt(discriminant)
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter((t) => t > 0 && t < 1)
}

function flattenCubic(segment: Extract<DiagramPathSegment, { kind: "cubic" }>, tolerance: number): DiagramPoint[] {
  const result: DiagramPoint[] = [segment.start]
  const visit = (p0: DiagramPoint, p1: DiagramPoint, p2: DiagramPoint, p3: DiagramPoint, depth: number): void => {
    if (depth >= 20 || Math.max(distanceToLine(p1, p0, p3), distanceToLine(p2, p0, p3)) <= tolerance) {
      result.push(p3)
      return
    }
    const p01 = midpoint(p0, p1), p12 = midpoint(p1, p2), p23 = midpoint(p2, p3)
    const p012 = midpoint(p01, p12), p123 = midpoint(p12, p23), p0123 = midpoint(p012, p123)
    visit(p0, p01, p012, p0123, depth + 1)
    visit(p0123, p123, p23, p3, depth + 1)
  }
  visit(segment.start, segment.control1, segment.control2, segment.end, 0)
  return result
}

function midpoint(a: DiagramPoint, b: DiagramPoint): DiagramPoint { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
function distanceToLine(point: DiagramPoint, start: DiagramPoint, end: DiagramPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy)
  return length <= EPSILON ? distance(point, start) : Math.abs(dx * (start.y - point.y) - (start.x - point.x) * dy) / length
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
function segmentEnds(segment: DiagramPathSegment): [DiagramPoint, DiagramPoint] { return segment.kind === "line" || segment.kind === "cubic" ? [segment.start, segment.end] : [arcPoint(segment.center, segment.radius, segment.startAngle), arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle)] }
function reverseSegment(segment: DiagramPathSegment): DiagramPathSegment { return segment.kind === "line" ? { kind: "line", start: segment.end, end: segment.start } : segment.kind === "cubic" ? { kind: "cubic", start: segment.end, control1: segment.control2, control2: segment.control1, end: segment.start } : { ...segment, startAngle: segment.startAngle + segment.sweepAngle, sweepAngle: -segment.sweepAngle } }
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
