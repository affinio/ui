import type { DiagramId, DiagramPathContour, DiagramPathSegment, DiagramPoint, DiagramRect, DiagramSceneInput, DiagramShape, DiagramSweepTrimFinding, DiagramSweepTrimInput, DiagramSweepTrimResult, DiagramSweepTrimTargetResult, DiagramSweepTrimUpdate } from "./types.js"

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
 * For each sweep crossing the target is cut only as far as the nearest eligible geometry boundary in the
 * direction selected by the stroke. `tolerance` and boundary resolution use world units.
 */
export function trimSelectionByStroke(scene: DiagramSceneInput, input: DiagramSweepTrimInput): DiagramSweepTrimResult {
  const targets: DiagramSweepTrimTargetResult[] = []
  const updates: DiagramSweepTrimUpdate[] = []
  const findings: DiagramSweepTrimFinding[] = []
  const fail = (code: DiagramSweepTrimFinding["code"], message: string, targetId?: DiagramId): DiagramSweepTrimFinding => ({ code, message, ...(targetId === undefined ? {} : { targetId }) })
  if (!scene || !input || !Array.isArray(input.targetIds) || !Array.isArray(input.stroke) || input.stroke.length < 2
    || !Number.isFinite(input.tolerance) || input.tolerance < 0
    || (input.side !== undefined && input.side !== "directed" && input.side !== "both")
    || (input.extent !== undefined && input.extent !== "crossing-to-boundary" && input.extent !== "beyond-boundary")
    || input.stroke.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    const finding = fail("invalid-input", "A sweep trim requires at least two finite stroke points and a finite non-negative world tolerance.")
    return { ok: false, status: "rejected", targets, updates, findings: [finding] }
  }
  const strokeLengths = input.stroke.slice(1).map((point, index) => distance(input.stroke[index]!, point))
  if (strokeLengths.every((length) => length <= EPSILON)) {
    const finding = fail("invalid-input", "The sweep stroke must have non-zero length.")
    return { ok: false, status: "rejected", targets, updates, findings: [finding] }
  }
  const strokeOffsets: number[] = [0]
  for (const length of strokeLengths) strokeOffsets.push(strokeOffsets[strokeOffsets.length - 1]! + length)
  if (strokeHasSelfIntersection(input.stroke, input.tolerance)) {
    const finding = fail("self-intersecting-stroke", "Self-intersecting sweep strokes are ambiguous and do not trim targets.")
    return { ok: true, status: "unchanged", targets: input.targetIds.map((id) => ({ id, changed: false, retained: [], sweepCrossings: [], boundaryIntersections: [], cutPoints: [], preview: null, finding: { ...finding, targetId: id } })), updates, findings: input.targetIds.map((id) => ({ ...finding, targetId: id })) }
  }
  const uniqueIds = [...new Set(input.targetIds)]
  const shapeById = new Map((scene.shapes ?? []).map((shape) => [shape.id, shape]))
  const edgeIds = new Set((scene.edges ?? []).map((edge) => edge.id))
  const targetSet = new Set(uniqueIds)
  // Candidate boundary geometry is resolved for each target below. Other selected
  // paths may bound a target; only a target is forbidden from bounding itself.
  const candidateBoundaryIds = input.boundaryIds === undefined
    ? [...shapeById.keys()].sort((a, b) => a.localeCompare(b))
    : [...new Set(input.boundaryIds)].sort((a, b) => a.localeCompare(b))
  const boundariesById = new Map<DiagramId, DiagramPathContour[]>()
  const invalidBoundaries: DiagramId[] = []
  const malformedBoundaries: DiagramId[] = []
  for (const boundaryId of candidateBoundaryIds) {
    const boundaryShape = shapeById.get(boundaryId)
    if (!boundaryShape) { if (input.boundaryIds) invalidBoundaries.push(boundaryId); continue }
    if (!validSweepTrimShape(boundaryShape)) { if (input.boundaryIds) malformedBoundaries.push(boundaryId); continue }
    const contours = sweepTrimShapeContours(boundaryShape)
    if (!contours) { if (input.boundaryIds) invalidBoundaries.push(boundaryId); continue }
    boundariesById.set(boundaryId, contours)
  }
  for (const id of uniqueIds) {
    const shape = shapeById.get(id)
    const addFinding = (code: DiagramSweepTrimFinding["code"], message: string, retained: ReadonlyArray<DiagramPathContour> = [], sweepCrossings: ReadonlyArray<DiagramPoint> = [], boundaryIntersections: ReadonlyArray<Readonly<{ point: DiagramPoint; boundaryId: DiagramId }>> = []): void => {
      const finding = fail(code, message, id)
      findings.push(finding)
      targets.push({ id, changed: false, retained, sweepCrossings, boundaryIntersections, cutPoints: sweepCrossings, preview: null, finding })
    }
    if (edgeIds.has(id)) {
      addFinding("connected-edge", "DiagramEdge targets are not trimmed because endpoint and port connectivity must remain explicit.")
      continue
    }
    if (!shape) {
      addFinding("unsupported-target", "Sweep trim supports selected line/path shapes only.")
      continue
    }
    if (shape.metadata?.locked || shape.metadata?.readOnly) {
      addFinding("locked-target", "Locked or read-only shapes cannot be trimmed.")
      continue
    }
    if (!validSweepTrimShape(shape)) {
      addFinding("invalid-input", "The selected path contains invalid or non-finite geometry.")
      continue
    }
    if ((scene.ports ?? []).some((port) => ("hostId" in port ? port.hostId === id : port.nodeId === id))) {
      addFinding("anchored-host", "Shapes hosting diagram ports are left unchanged so connector attachment positions cannot be altered.")
      continue
    }
    if (shape.shape === "rect" && !shape.pathContours?.length) {
      addFinding("unsupported-target", "Native rectangle primitives are boundary-only; sweep Trim targets must be open line/path geometry.")
      continue
    }
    const sourceContours = sweepTrimShapeContours(shape) ?? []
    if (!sourceContours.length) {
      addFinding("unsupported-geometry", "This figure has no exact line, circular-arc, or cubic outline representation for sweep Trim.")
      continue
    }
    const targetBoundaries = [...boundariesById]
      .filter(([boundaryId]) => boundaryId !== id && (input.boundaryIds !== undefined || !targetSet.has(boundaryId) || isSweepTrimPathTarget(shapeById.get(boundaryId)!)))
      .map(([boundaryId, contours]) => ({ id: boundaryId, contours }))
    const invalidTargetBoundaries = invalidBoundaries.filter((boundaryId) => boundaryId !== id)
    const malformedTargetBoundaries = malformedBoundaries.filter((boundaryId) => boundaryId !== id)
    if (invalidTargetBoundaries.length) {
      addFinding("unsupported-boundary", `One or more explicit trim boundaries are missing or unsupported: ${invalidTargetBoundaries.join(", ")}.`, sourceContours)
      continue
    }
    if (malformedTargetBoundaries.length) {
      addFinding("invalid-input", `One or more explicit trim boundaries contain invalid geometry: ${malformedTargetBoundaries.join(", ")}.`, sourceContours)
      continue
    }
    const retained: DiagramPathContour[] = []
    const sweepCrossings: DiagramPoint[] = []
    const boundaryIntersections: Array<{ point: DiagramPoint; boundaryId: DiagramId }> = []
    let findingCode: DiagramSweepTrimFinding["code"] | null = null
    let findingMessage = ""
    for (const contour of sourceContours) {
      if (contour.hole) { retained.push(contour); continue }
      const trim = trimContourToNearestBoundaries(contour, input.stroke, strokeLengths, strokeOffsets, targetBoundaries, input.tolerance, input.side, input.extent)
      if (trim.code) {
        sweepCrossings.push(...trim.sweepCrossings)
        boundaryIntersections.push(...trim.boundaryIntersections)
        findingCode = trim.code
        findingMessage = trim.message ?? "The target cannot be trimmed safely."
        break
      }
      sweepCrossings.push(...trim.sweepCrossings)
      boundaryIntersections.push(...trim.boundaryIntersections)
      retained.push(...trim.retained)
    }
    if (findingCode) {
      addFinding(findingCode, findingMessage, sourceContours, sweepCrossings, boundaryIntersections)
      continue
    }
    if (!sweepCrossings.length) {
      addFinding("no-intersection", "The stroke does not cross a supported interior segment of this target.", sourceContours)
      continue
    }
    if (boundaryIntersections.length !== sweepCrossings.length * (input.side === "both" ? 2 : 1)) {
      addFinding("no-boundary", "No unique eligible geometry boundary was found in the trim direction; the target is unchanged.", sourceContours, sweepCrossings, boundaryIntersections)
      continue
    }
    if (sourceContours.some((contour) => contour.hole) && sweepCrossings.length) {
      addFinding("topology-ambiguous", "A sweep intersecting a shape with holes could change fill topology; the target is unchanged.", sourceContours)
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
    targets.push({ id, changed: true, retained: worldContours, sweepCrossings, boundaryIntersections, cutPoints: sweepCrossings, preview: canonicalPreview, update })
  }
  return { ok: true, status: updates.length === 0 ? "unchanged" : findings.length > 0 ? "partial" : "applied", targets, updates, findings }
}

function isSweepTrimPathTarget(shape: DiagramShape): boolean {
  return shape.shape === "line" || (shape.pathContours?.length ?? 0) > 0
}

type BoundarySegment = Readonly<{ id: DiagramId; segment: DiagramPathSegment }>
type BoundaryHit = Readonly<{ point: DiagramPoint; boundaryId: DiagramId; segmentIndex: number; t: number }>
type ContourTrimResult = Readonly<{
  retained: ReadonlyArray<DiagramPathContour>
  sweepCrossings: ReadonlyArray<DiagramPoint>
  boundaryIntersections: ReadonlyArray<Readonly<{ point: DiagramPoint; boundaryId: DiagramId }>>
  code?: DiagramSweepTrimFinding["code"]
  message?: string
}>

function validSweepTrimShape(shape: DiagramShape): boolean {
  return [shape.x, shape.y, shape.width, shape.height, shape.rotation ?? 0].every(Number.isFinite) && shape.width >= 0 && shape.height >= 0
    && (shape.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    && (shape.pathContours ?? []).every((contour) => contour.segments.every((segment) => segment.kind === "line"
      ? [segment.start.x, segment.start.y, segment.end.x, segment.end.y].every(Number.isFinite)
      : segment.kind === "arc"
        ? [segment.center.x, segment.center.y, segment.radius, segment.startAngle, segment.sweepAngle].every(Number.isFinite) && segment.radius > 0 && Math.abs(segment.sweepAngle) > EPSILON
        : [segment.start.x, segment.start.y, segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y, segment.end.x, segment.end.y].every(Number.isFinite)))
}

function sweepTrimShapeContours(shape: DiagramShape): DiagramPathContour[] | null {
  if (!validSweepTrimShape(shape)) return null
  if (shape.pathContours?.length) return shape.pathContours.map((contour) => transformPathContour(translatePathContour(contour, shape.x, shape.y), { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, shape.rotation ?? 0, shape.flipX, shape.flipY))
  if (shape.shape === "rect") return [rectShapeContour(shape)]
  if (shape.shape === "line") {
    const points = shapeLinePoints(shape)
    return [{ segments: points.slice(1).map((end, index): DiagramPathSegment => ({ kind: "line", start: points[index]!, end })), closed: false }]
  }
  return null
}

function trimContourToNearestBoundaries(contour: DiagramPathContour, stroke: ReadonlyArray<DiagramPoint>, strokeLengths: ReadonlyArray<number>, strokeOffsets: ReadonlyArray<number>, boundaries: ReadonlyArray<{ id: DiagramId; contours: ReadonlyArray<DiagramPathContour> }>, tolerance: number, sideMode: DiagramSweepTrimInput["side"], extent: DiagramSweepTrimInput["extent"]): ContourTrimResult {
  if (contour.closed && extent === "beyond-boundary") return { retained: [contour], sweepCrossings: [], boundaryIntersections: [], code: "unsupported-geometry", message: "Beyond-boundary extent applies only to open ray-like contours." }
  const crossings: Array<SweepIntersection & { segmentIndex: number }> = []
  for (let segmentIndex = 0; segmentIndex < contour.segments.length; segmentIndex += 1) {
    for (const crossing of collectStrokeIntersections(contour.segments[segmentIndex]!, stroke, strokeLengths, strokeOffsets, tolerance)) {
      if (!Number.isFinite(crossing.targetT)) return { retained: [contour], sweepCrossings: [], boundaryIntersections: [], code: "ambiguous-intersection", message: "The sweep is tangent to, overlaps, or touches a target vertex; the target is unchanged." }
      crossings.push({ ...crossing, segmentIndex })
    }
  }
  crossings.sort((a, b) => a.progress - b.progress || a.segmentIndex - b.segmentIndex || a.targetT - b.targetT)
  const uniqueCrossings: typeof crossings = []
  for (const crossing of crossings) if (!uniqueCrossings.some((previous) => distance(previous.point, crossing.point) <= Math.max(EPSILON, tolerance))) uniqueCrossings.push(crossing)
  if (!uniqueCrossings.length) return { retained: [contour], sweepCrossings: [], boundaryIntersections: [] }

  const flatBoundaries: BoundarySegment[] = boundaries.flatMap((boundary) => boundary.contours.flatMap((boundaryContour) => boundaryContour.segments.map((segment) => ({ id: boundary.id, segment }))))
  const hitsByTargetSegment: BoundaryHit[][] = contour.segments.map(() => [])
  for (let segmentIndex = 0; segmentIndex < contour.segments.length; segmentIndex += 1) {
    for (const boundary of flatBoundaries) {
      if (!rectsOverlap(inflateRect(segmentBounds(contour.segments[segmentIndex]!), tolerance), inflateRect(segmentBounds(boundary.segment), tolerance))) continue
      const intersections = intersectPathSegments(contour.segments[segmentIndex]!, boundary.segment, tolerance)
      if (intersections.unsupported) return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections: [], code: "unsupported-boundary", message: `Boundary ${boundary.id} has a segment combination without exact intersection support.` }
      if (intersections.overlap) return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections: [], code: "ambiguous-boundary", message: `Boundary ${boundary.id} overlaps the target; no unique trim boundary can be selected.` }
      for (const hit of intersections.hits) {
        if (!hit.transverse) continue
        hitsByTargetSegment[segmentIndex]!.push({ point: hit.point, boundaryId: boundary.id, segmentIndex, t: hit.targetT })
      }
    }
  }
  for (const hits of hitsByTargetSegment) {
    hits.sort((a, b) => a.t - b.t || a.boundaryId.localeCompare(b.boundaryId) || a.point.x - b.point.x || a.point.y - b.point.y)
  }
  const segmentLengths = contour.segments.map((segment) => segmentLength(segment))
  const prefixes: number[] = [0]
  for (const length of segmentLengths) prefixes.push(prefixes[prefixes.length - 1]! + length)
  const totalLength = prefixes[prefixes.length - 1]!
  const intervals: Array<readonly [number, number]> = []
  const boundaryIntersections: Array<{ point: DiagramPoint; boundaryId: DiagramId }> = []
  for (const crossing of uniqueCrossings) {
    const tangent = segmentTangentAt(contour.segments[crossing.segmentIndex]!, crossing.targetT)
    const sweepDirection = strokeDirectionAt(stroke, crossing.strokeIndex)
    const side = cross(sweepDirection, tangent)
    if (Math.abs(side) <= EPSILON * Math.max(1, Math.hypot(sweepDirection.x, sweepDirection.y) * Math.hypot(tangent.x, tangent.y))) {
      return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections: [], code: "ambiguous-intersection", message: "The sweep direction does not select a unique side of the target." }
    }
    const startDistance = prefixes[crossing.segmentIndex]! + segmentLengthRange(contour.segments[crossing.segmentIndex]!, 0, crossing.targetT)
    for (const forward of sideMode === "both" ? [true, false] : [side > 0]) {
      const resolved = findNearestBoundary(contour, crossing.segmentIndex, crossing.targetT, forward, contour.closed === true, hitsByTargetSegment, segmentLengths, tolerance)
      if (resolved.kind === "unsupported") return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections, code: "unsupported-boundary", message: resolved.message }
      if (resolved.kind === "ambiguous") return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections, code: "ambiguous-boundary", message: "Two eligible boundaries are equally near in the selected trim direction." }
      if (resolved.kind === "missing") return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections, code: "no-boundary", message: "No eligible geometry boundary was found in each requested trim direction." }
      let endDistance = forward ? startDistance + resolved.distance : startDistance - resolved.distance
      if (contour.closed) endDistance = ((endDistance % totalLength) + totalLength) % totalLength
      if (!contour.closed && (endDistance < -tolerance || endDistance > totalLength + tolerance)) return { retained: [contour], sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections, code: "no-boundary", message: "No eligible geometry boundary was found before the target endpoint." }
      if (contour.closed) {
        if (forward) startDistance <= endDistance ? intervals.push([startDistance, endDistance]) : intervals.push([startDistance, totalLength], [0, endDistance])
        else endDistance <= startDistance ? intervals.push([endDistance, startDistance]) : intervals.push([0, startDistance], [endDistance, totalLength])
      } else if (extent === "beyond-boundary") intervals.push(forward ? [Math.min(totalLength, endDistance), totalLength] : [0, Math.max(0, endDistance)])
      else intervals.push([Math.max(0, Math.min(startDistance, endDistance)), Math.min(totalLength, Math.max(startDistance, endDistance))])
      boundaryIntersections.push({ point: resolved.hit.point, boundaryId: resolved.hit.boundaryId })
    }
  }
  const merged = mergeIntervals(intervals, tolerance)
  const retainedSegments: DiagramPathSegment[] = []
  for (let segmentIndex = 0; segmentIndex < contour.segments.length; segmentIndex += 1) {
    const segment = contour.segments[segmentIndex]!, segmentStartDistance = prefixes[segmentIndex]!, segmentEndDistance = prefixes[segmentIndex + 1]!
    const cuts = merged.flatMap(([from, to]) => {
      const low = Math.max(from, segmentStartDistance), high = Math.min(to, segmentEndDistance)
      if (high - low <= EPSILON) return []
      return [[parameterAtSegmentLength(segment, low - segmentStartDistance), parameterAtSegmentLength(segment, high - segmentStartDistance)] as const]
    }).sort((a, b) => a[0] - b[0])
    let cursor = 0
    for (const [from, to] of cuts) {
      const piece = segmentRange(segment, cursor, from)
      if (piece && segmentLength(piece) > EPSILON) retainedSegments.push(piece)
      cursor = Math.max(cursor, to)
    }
    const tail = segmentRange(segment, cursor, 1)
    if (tail && segmentLength(tail) > EPSILON) retainedSegments.push(tail)
  }
  let retained = stitchOpenSegments(retainedSegments)
  if (contour.closed && retained.length > 1) {
    const first = retained[0]!, last = retained[retained.length - 1]!
    if (distance(segmentEnd(last.segments[last.segments.length - 1]!), segmentStart(first.segments[0]!)) <= Math.max(EPSILON, tolerance)) {
      retained = [{ ...last, segments: [...last.segments, ...first.segments] }, ...retained.slice(1, -1)]
    }
  }
  return { retained, sweepCrossings: uniqueCrossings.map((item) => item.point), boundaryIntersections }
}

function segmentBounds(segment: DiagramPathSegment): DiagramRect {
  return boundsFromPoints(pathContourBoundsPoints({ closed: false, segments: [segment] }))
}

function intersectPathSegments(target: DiagramPathSegment, boundary: DiagramPathSegment, tolerance: number): Readonly<{ hits: ReadonlyArray<Readonly<{ point: DiagramPoint; targetT: number; transverse: boolean }>>; overlap?: boolean; unsupported?: boolean }> {
  if (target.kind === "line" && boundary.kind === "line") {
    const result = intersectLinePair(target.start, target.end, boundary.start, boundary.end)
    return { hits: result.hits.map((hit) => ({ point: hit.point, targetT: hit.t, transverse: true })), overlap: result.overlap }
  }
  if (target.kind === "arc" && boundary.kind === "line") {
    const result = arcLineIntersections(target, boundary.start, boundary.end)
    return { hits: result.map((hit) => ({ point: hit.point, targetT: arcParameterAt(target, hit.point), transverse: Math.abs(cross(segmentTangentAt(target, arcParameterAt(target, hit.point)), { x: boundary.end.x - boundary.start.x, y: boundary.end.y - boundary.start.y })) > EPSILON })) }
  }
  if (target.kind === "line" && boundary.kind === "arc") {
    const result = arcLineIntersections(boundary, target.start, target.end)
    return { hits: result.map((hit) => { const boundaryT = arcParameterAt(boundary, hit.point); return { point: hit.point, targetT: hit.strokeT, transverse: Math.abs(cross({ x: target.end.x - target.start.x, y: target.end.y - target.start.y }, segmentTangentAt(boundary, boundaryT))) > EPSILON } }) }
  }
  if (target.kind === "arc" && boundary.kind === "arc") return intersectArcSegments(target, boundary)
  if (target.kind === "cubic" && boundary.kind === "line") {
    const result = cubicLineIntersections(target, boundary.start, boundary.end, tolerance)
    return { hits: result.map((hit) => { const t = Number.isFinite(hit.targetT) ? hit.targetT : distance(hit.point, target.start) <= tolerance ? 0 : 1; return { point: hit.point, targetT: t, transverse: Math.abs(cross(segmentTangentAt(target, t), { x: boundary.end.x - boundary.start.x, y: boundary.end.y - boundary.start.y })) > EPSILON } }) }
  }
  if (target.kind === "line" && boundary.kind === "cubic") {
    const result = cubicLineIntersections(boundary, target.start, target.end, tolerance)
    return { hits: result.map((hit) => { const boundaryT = Number.isFinite(hit.targetT) ? hit.targetT : same(hit.point, boundary.start) ? 0 : 1; return { point: hit.point, targetT: hit.strokeT, transverse: Math.abs(cross({ x: target.end.x - target.start.x, y: target.end.y - target.start.y }, segmentTangentAt(boundary, boundaryT))) > EPSILON } }) }
  }
  return { hits: [], unsupported: target.kind === "cubic" || boundary.kind === "cubic" }
}

function intersectLinePair(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint): Readonly<{ hits: ReadonlyArray<Readonly<{ point: DiagramPoint; t: number }>>; overlap?: boolean }> {
  const first = { x: b.x - a.x, y: b.y - a.y }, second = { x: d.x - c.x, y: d.y - c.y }, delta = { x: c.x - a.x, y: c.y - a.y }
  const denominator = cross(first, second)
  if (Math.abs(denominator) <= EPSILON) {
    if (Math.abs(cross(delta, first)) <= EPSILON) {
      const lengthSquared = dotProduct(first, first)
      if (lengthSquared <= EPSILON) return { hits: [] }
      const cT = dotProduct(delta, first) / lengthSquared
      const dT = dotProduct({ x: d.x - a.x, y: d.y - a.y }, first) / lengthSquared
      return Math.min(1, Math.max(cT, dT)) >= Math.max(0, Math.min(cT, dT)) - EPSILON ? { hits: [], overlap: true } : { hits: [] }
    }
    return { hits: [] }
  }
  const t = cross(delta, second) / denominator, u = cross(delta, first) / denominator
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return { hits: [] }
  const bounded = Math.max(0, Math.min(1, t))
  return { hits: [{ point: { x: a.x + first.x * bounded, y: a.y + first.y * bounded }, t: bounded }] }
}
function dotProduct(a: DiagramPoint, b: DiagramPoint): number { return a.x * b.x + a.y * b.y }

function intersectArcSegments(first: Extract<DiagramPathSegment, { kind: "arc" }>, second: Extract<DiagramPathSegment, { kind: "arc" }>): Readonly<{ hits: ReadonlyArray<Readonly<{ point: DiagramPoint; targetT: number; transverse: boolean }>>; overlap?: boolean }> {
  const dx = second.center.x - first.center.x, dy = second.center.y - first.center.y, centers = Math.hypot(dx, dy)
  if (centers <= EPSILON && Math.abs(first.radius - second.radius) <= EPSILON) return { hits: [], overlap: true }
  if (centers <= EPSILON || centers > first.radius + second.radius + EPSILON || centers < Math.abs(first.radius - second.radius) - EPSILON) return { hits: [] }
  const along = (first.radius ** 2 - second.radius ** 2 + centers ** 2) / (2 * centers)
  const heightSquared = first.radius ** 2 - along ** 2
  if (heightSquared < -EPSILON) return { hits: [] }
  const height = Math.sqrt(Math.max(0, heightSquared)), base = { x: first.center.x + along * dx / centers, y: first.center.y + along * dy / centers }
  const points = height <= EPSILON ? [base] : [{ x: base.x - dy * height / centers, y: base.y + dx * height / centers }, { x: base.x + dy * height / centers, y: base.y - dx * height / centers }]
  return { hits: points.filter((point) => angleOnSweep(angle(first.center, point), first.startAngle, first.sweepAngle) && angleOnSweep(angle(second.center, point), second.startAngle, second.sweepAngle)).map((point) => {
    const targetT = arcParameterAt(first, point)
    return { point, targetT, transverse: Math.abs(cross(segmentTangentAt(first, targetT), segmentTangentAt(second, arcParameterAt(second, point)))) > EPSILON }
  }) }
}

function arcParameterAt(arc: Extract<DiagramPathSegment, { kind: "arc" }>, point: DiagramPoint): number {
  const theta = angle(arc.center, point)
  return arc.sweepAngle >= 0 ? positive(theta - arc.startAngle) / arc.sweepAngle : positive(arc.startAngle - theta) / -arc.sweepAngle
}

function findNearestBoundary(contour: DiagramPathContour, startIndex: number, startT: number, forward: boolean, closed: boolean, hitsBySegment: ReadonlyArray<ReadonlyArray<BoundaryHit>>, lengths: ReadonlyArray<number>, tolerance: number): Readonly<{ kind: "found"; hit: BoundaryHit; distance: number } | { kind: "missing" } | { kind: "ambiguous" } | { kind: "unsupported"; message: string }> {
  const count = contour.segments.length
  let accumulated = 0
  const maxSteps = closed ? count : forward ? count - startIndex : startIndex + 1
  for (let step = 0; step < maxSteps; step += 1) {
    const index = (startIndex + (forward ? step : -step) + count) % count
    const segment = contour.segments[index]!
    const low = step === 0 && forward ? startT : 0
    const high = step === 0 && !forward ? startT : 1
    const candidates = hitsBySegment[index]!.filter((hit) => forward ? hit.t > low + EPSILON : hit.t < high - EPSILON).map((hit) => ({ hit, local: segmentLengthRange(segment, forward ? low : hit.t, forward ? hit.t : high) }))
      .filter((candidate) => candidate.local > tolerance)
      .sort((a, b) => a.local - b.local || a.hit.boundaryId.localeCompare(b.hit.boundaryId))
    if (candidates.length) {
      const best = candidates[0]!
      const tied = candidates.filter((candidate) => Math.abs(candidate.local - best.local) <= Math.max(EPSILON, tolerance))
      if (tied.some((candidate) => candidate.hit.boundaryId !== best.hit.boundaryId || distance(candidate.hit.point, best.hit.point) > Math.max(EPSILON, tolerance))) return { kind: "ambiguous" }
      return { kind: "found", hit: best.hit, distance: accumulated + best.local }
    }
    accumulated += step === 0 ? segmentLengthRange(segment, forward ? low : 0, forward ? 1 : high) : lengths[index]!
    const nextIndex = index + (forward ? 1 : -1)
    if (!closed && (nextIndex < 0 || nextIndex >= count)) break
  }
  return { kind: "missing" }
}

function mergeIntervals(intervals: ReadonlyArray<readonly [number, number]>, tolerance: number): Array<readonly [number, number]> {
  const sorted = [...intervals].map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const).filter(([a, b]) => b - a > EPSILON).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: Array<[number, number]> = []
  for (const [from, to] of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && from <= previous[1] + Math.max(EPSILON, tolerance * 1e-9)) previous[1] = Math.max(previous[1], to)
    else merged.push([from, to])
  }
  return merged
}

function segmentRange(segment: DiagramPathSegment, from: number, to: number): DiagramPathSegment | null {
  if (to - from <= EPSILON) return null
  const [, tail] = splitPathSegment(segment, Math.max(0, from))
  if (!tail) return null
  const [range] = splitPathSegment(tail, (to - from) / Math.max(EPSILON, 1 - from))
  return range
}

function parameterAtSegmentLength(segment: DiagramPathSegment, targetLength: number): number {
  const total = segmentLength(segment)
  if (targetLength <= EPSILON) return 0
  if (targetLength >= total - EPSILON) return 1
  if (segment.kind !== "cubic") return targetLength / total
  let low = 0, high = 1
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2
    if (segmentLengthRange(segment, 0, middle) < targetLength) low = middle
    else high = middle
  }
  return (low + high) / 2
}

type SweepIntersection = Readonly<{ point: DiagramPoint; targetT: number; strokeIndex: number; progress: number }>
type ContourIntersection = SweepIntersection & Readonly<{ segmentIndex: number }>

function rectShapeContour(shape: DiagramShape): DiagramPathContour {
  const corners = [
    { x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height }, { x: shape.x, y: shape.y + shape.height },
  ].map((point) => rotatePoint({
    x: shape.x + (shape.flipX ? shape.width - (point.x - shape.x) : point.x - shape.x),
    y: shape.y + (shape.flipY ? shape.height - (point.y - shape.y) : point.y - shape.y),
  }, { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }, shape.rotation ?? 0))
  return { closed: true, segments: corners.map((start, index): DiagramPathSegment => ({ kind: "line", start, end: corners[(index + 1) % corners.length]! })) }
}

function trimClosedContour(contour: DiagramPathContour, stroke: ReadonlyArray<DiagramPoint>, lengths: ReadonlyArray<number>, offsets: ReadonlyArray<number>, tolerance: number): Readonly<{ retained: ReadonlyArray<DiagramPathContour>; cutPoints: ReadonlyArray<DiagramPoint>; finding?: true }> {
  const intersections: ContourIntersection[] = []
  contour.segments.forEach((segment, segmentIndex) => {
    for (const hit of collectStrokeIntersections(segment, stroke, lengths, offsets, tolerance)) intersections.push({ ...hit, segmentIndex })
  })
  intersections.sort((a, b) => a.progress - b.progress || a.segmentIndex - b.segmentIndex || a.targetT - b.targetT)
  const unique: ContourIntersection[] = []
  for (const hit of intersections) if (!unique.some((previous) => distance(previous.point, hit.point) <= Math.max(EPSILON, tolerance))) unique.push(hit)
  if (!unique.length) return { retained: [], cutPoints: [] }
  if (unique.length !== 2 || unique.some((hit) => !Number.isFinite(hit.targetT))) return { retained: [], cutPoints: [], finding: true }
  const first = unique[0]!, second = unique[1]!
  const firstToSecond = sliceClosedContour(contour, first, second)
  const secondToFirst = sliceClosedContour(contour, second, first)
  const firstSide = contourIntervalSide(firstToSecond, stroke, tolerance)
  const secondSide = contourIntervalSide(secondToFirst, stroke, tolerance)
  if (firstSide === 0 || secondSide === 0 || firstSide === secondSide) return { retained: [], cutPoints: [], finding: true }
  const kept = firstSide < 0 ? firstToSecond : secondToFirst
  if (!kept.length) return { retained: [], cutPoints: [], finding: true }
  return { retained: [{ segments: kept, closed: false }], cutPoints: [first.point, second.point] }
}

function sliceClosedContour(contour: DiagramPathContour, from: ContourIntersection, to: ContourIntersection): DiagramPathSegment[] {
  const output: DiagramPathSegment[] = []
  const count = contour.segments.length
  if (!count) return output
  const append = (segment: DiagramPathSegment | null) => { if (segment && segmentLength(segment) > EPSILON) output.push(segment) }
  if (from.segmentIndex === to.segmentIndex && from.targetT < to.targetT) {
    const [, afterStart] = splitPathSegment(contour.segments[from.segmentIndex]!, from.targetT)
    if (afterStart) {
      const [middle] = splitPathSegment(afterStart, (to.targetT - from.targetT) / (1 - from.targetT))
      append(middle)
    }
    return output
  }
  const [, afterStart] = splitPathSegment(contour.segments[from.segmentIndex]!, from.targetT)
  append(afterStart)
  for (let step = 1; step < count; step += 1) {
    const index = (from.segmentIndex + step) % count
    if (index === to.segmentIndex) break
    output.push(contour.segments[index]!)
  }
  const [beforeEnd] = splitPathSegment(contour.segments[to.segmentIndex]!, to.targetT)
  append(beforeEnd)
  return output
}

function contourIntervalSide(segments: ReadonlyArray<DiagramPathSegment>, stroke: ReadonlyArray<DiagramPoint>, tolerance: number): -1 | 0 | 1 {
  let result: -1 | 0 | 1 = 0
  for (const segment of segments) {
    const point = segmentPointAt(segment, 0.5)
    const nearest = nearestStrokeSide(point, stroke)
    if (nearest.distance <= Math.max(EPSILON, tolerance) || nearest.side === 0) return 0
    if (result && result !== nearest.side) return 0
    result = nearest.side
  }
  return result
}

function nearestStrokeSide(point: DiagramPoint, stroke: ReadonlyArray<DiagramPoint>): Readonly<{ distance: number; side: -1 | 0 | 1 }> {
  let bestDistance = Number.POSITIVE_INFINITY
  let bestSide: -1 | 0 | 1 = 0
  for (let index = 0; index < stroke.length - 1; index += 1) {
    const a = stroke[index]!, b = stroke[index + 1]!, delta = { x: b.x - a.x, y: b.y - a.y }
    const lengthSquared = delta.x * delta.x + delta.y * delta.y
    if (lengthSquared <= EPSILON) continue
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * delta.x + (point.y - a.y) * delta.y) / lengthSquared))
    const nearest = { x: a.x + delta.x * t, y: a.y + delta.y * t }
    const d = distance(point, nearest)
    if (d < bestDistance) {
      bestDistance = d
      const signed = cross(delta, { x: point.x - nearest.x, y: point.y - nearest.y })
      bestSide = Math.abs(signed) <= EPSILON * Math.max(1, Math.sqrt(lengthSquared)) ? 0 : signed > 0 ? 1 : -1
    }
  }
  return { distance: bestDistance, side: bestSide }
}

function segmentPointAt(segment: DiagramPathSegment, t: number): DiagramPoint {
  if (segment.kind === "line") return { x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t }
  if (segment.kind === "arc") return arcPoint(segment.center, segment.radius, segment.startAngle + segment.sweepAngle * t)
  return cubicPoint(segment, t)
}

function strokeHasSelfIntersection(stroke: ReadonlyArray<DiagramPoint>, tolerance: number): boolean {
  for (let first = 0; first < stroke.length - 1; first += 1) for (let second = first + 2; second < stroke.length - 1; second += 1) {
    if (first === 0 && second === stroke.length - 2 && distance(stroke[0]!, stroke[stroke.length - 1]!) <= tolerance) continue
    if (lineLineIntersections({ kind: "line", start: stroke[first]!, end: stroke[first + 1]! }, stroke[second]!, stroke[second + 1]!).some((hit) => Number.isFinite(hit.targetT))) return true
  }
  return false
}

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
    const found = segment.kind === "line" ? lineLineIntersections(segment, a, b) : segment.kind === "arc" ? arcLineIntersections(segment, a, b) : cubicLineIntersections(segment, a, b, tolerance)
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

function cubicLineIntersections(cubic: Extract<DiagramPathSegment, { kind: "cubic" }>, a: DiagramPoint, b: DiagramPoint, tolerance: number): Array<Readonly<{ point: DiagramPoint; targetT: number; strokeT: number }>> {
  const direction = { x: b.x - a.x, y: b.y - a.y }
  const length = Math.hypot(direction.x, direction.y)
  if (length <= EPSILON) return []
  const p0 = cubic.start, p1 = cubic.control1, p2 = cubic.control2, p3 = cubic.end
  const crossPoint = (point: DiagramPoint) => cross({ x: point.x - a.x, y: point.y - a.y }, direction)
  const coefficients = [
    crossPoint(p0),
    3 * cross({ x: p1.x - p0.x, y: p1.y - p0.y }, direction),
    3 * cross({ x: p0.x - 2 * p1.x + p2.x, y: p0.y - 2 * p1.y + p2.y }, direction),
    cross({ x: -p0.x + 3 * p1.x - 3 * p2.x + p3.x, y: -p0.y + 3 * p1.y - 3 * p2.y + p3.y }, direction),
  ]
  const coefficientScale = Math.max(1, ...coefficients.map(Math.abs))
  if (coefficients.every((value) => Math.abs(value) <= EPSILON * coefficientScale)) {
    const controlBounds = boundsFromPoints([p0, p1, p2, p3])
    const strokeBounds = boundsFromPoints([a, b])
    return rectsOverlap(inflateRect(controlBounds, tolerance), strokeBounds) ? [{ point: a, targetT: Number.NaN, strokeT: 0 }] : []
  }
  const roots = cubicPolynomialRoots(coefficients[3]!, coefficients[2]!, coefficients[1]!, coefficients[0]!, Math.max(EPSILON, tolerance * length))
  const result: Array<Readonly<{ point: DiagramPoint; targetT: number; strokeT: number }>> = []
  for (const targetT of roots) {
    const point = cubicPoint(cubic, targetT)
    const strokeT = ((point.x - a.x) * direction.x + (point.y - a.y) * direction.y) / (length * length)
    if (strokeT < -EPSILON || strokeT > 1 + EPSILON) continue
    const boundedT = Math.max(0, Math.min(1, targetT))
    const boundedStrokeT = Math.max(0, Math.min(1, strokeT))
    result.push({ point, targetT: boundedT <= 1e-7 || boundedT >= 1 - 1e-7 ? Number.NaN : boundedT, strokeT: boundedStrokeT })
  }
  return result
}

/** Finds all roots in [0,1] by derivative partitioning and at most 48 bisections per monotone interval. */
function cubicPolynomialRoots(a: number, b: number, c: number, d: number, valueTolerance: number): number[] {
  const evaluate = (t: number) => ((a * t + b) * t + c) * t + d
  const critical: number[] = []
  if (Math.abs(a) <= EPSILON) {
    if (Math.abs(b) > EPSILON) critical.push(-c / (2 * b))
  } else {
    const discriminant = 4 * b * b - 12 * a * c
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant)
      critical.push((-2 * b - root) / (6 * a), (-2 * b + root) / (6 * a))
    }
  }
  const boundaries = [0, ...critical.filter((t) => t > 0 && t < 1).sort((x, y) => x - y), 1]
  const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
  const tolerance = Math.max(EPSILON * scale, valueTolerance * 1e-8)
  const roots: number[] = []
  const add = (t: number) => { if (!roots.some((existing) => Math.abs(existing - t) <= 1e-7)) roots.push(t) }
  for (const boundary of boundaries) if (Math.abs(evaluate(boundary)) <= tolerance) add(boundary)
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    let low = boundaries[index]!, high = boundaries[index + 1]!
    let fLow = evaluate(low), fHigh = evaluate(high)
    if (fLow === 0 || fHigh === 0 || Math.sign(fLow) === Math.sign(fHigh)) continue
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const middle = (low + high) / 2
      const fMiddle = evaluate(middle)
      if (Math.abs(fMiddle) <= tolerance || high - low <= 1e-12) { low = middle; high = middle; break }
      if (Math.sign(fLow) === Math.sign(fMiddle)) { low = middle; fLow = fMiddle }
      else { high = middle; fHigh = fMiddle }
    }
    add((low + high) / 2)
  }
  return roots.sort((x, y) => x - y)
}

function cubicPoint(segment: Extract<DiagramPathSegment, { kind: "cubic" }>, t: number): DiagramPoint {
  const u = 1 - t
  return {
    x: u ** 3 * segment.start.x + 3 * u * u * t * segment.control1.x + 3 * u * t * t * segment.control2.x + t ** 3 * segment.end.x,
    y: u ** 3 * segment.start.y + 3 * u * u * t * segment.control1.y + 3 * u * t * t * segment.control2.y + t ** 3 * segment.end.y,
  }
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
  if (segment.kind === "cubic") {
    const mix = (a: DiagramPoint, b: DiagramPoint): DiagramPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    const a = mix(segment.start, segment.control1), b = mix(segment.control1, segment.control2), c = mix(segment.control2, segment.end)
    const d = mix(a, b), e = mix(b, c), point = mix(d, e)
    return [
      t > EPSILON ? { kind: "cubic", start: segment.start, control1: a, control2: d, end: point } : null,
      t < 1 - EPSILON ? { kind: "cubic", start: point, control1: e, control2: c, end: segment.end } : null,
    ]
  }
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
function segmentLength(segment: DiagramPathSegment): number { return segmentLengthRange(segment, 0, 1) }
function segmentLengthRange(segment: DiagramPathSegment, from: number, to: number): number {
  if (to <= from) return 0
  if (segment.kind === "line") return distance(segment.start, segment.end) * (to - from)
  if (segment.kind === "arc") return Math.abs(segment.sweepAngle) * segment.radius * (to - from)
  const speed = (t: number) => Math.hypot(
    3 * (1 - t) ** 2 * (segment.control1.x - segment.start.x) + 6 * (1 - t) * t * (segment.control2.x - segment.control1.x) + 3 * t ** 2 * (segment.end.x - segment.control2.x),
    3 * (1 - t) ** 2 * (segment.control1.y - segment.start.y) + 6 * (1 - t) * t * (segment.control2.y - segment.control1.y) + 3 * t ** 2 * (segment.end.y - segment.control2.y),
  )
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => (b - a) * (fa + 4 * fm + fb) / 6
  const fa = speed(from), fb = speed(to), middle = (from + to) / 2, fm = speed(middle), whole = simpson(from, to, fa, fm, fb)
  const integrate = (a: number, b: number, f0: number, fmid: number, f1: number, estimate: number, epsilon: number, depth: number): number => {
    const mid = (a + b) / 2, leftMid = (a + mid) / 2, rightMid = (mid + b) / 2
    const fl = speed(leftMid), fr = speed(rightMid), left = simpson(a, mid, f0, fl, fmid), right = simpson(mid, b, fmid, fr, f1)
    const delta = left + right - estimate
    if (depth >= 20 || Math.abs(delta) <= 15 * epsilon) return left + right + delta / 15
    return integrate(a, mid, f0, fl, fmid, left, epsilon / 2, depth + 1) + integrate(mid, b, fmid, fr, f1, right, epsilon / 2, depth + 1)
  }
  return integrate(from, to, fa, fm, fb, whole, Math.max(1e-9, Math.abs(whole) * 1e-10), 0)
}
function cross(a: DiagramPoint, b: DiagramPoint): number { return a.x * b.y - a.y * b.x }

function boundsFromPoints(points: ReadonlyArray<DiagramPoint>): DiagramRect {
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y)
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

function inflateRect(rect: DiagramRect, amount: number): DiagramRect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 } }

function rectsOverlap(a: DiagramRect, b: DiagramRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
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
