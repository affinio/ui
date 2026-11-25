import { describe, expect, it } from "vitest"
import { clampViewportToBounds, createCircularArc, createDiagramEngine, createDiagramInteractionController, deserializeDiagramDocument, deserializeScene, getDiagramTableCellAt, intersectLineSegments, parseSvgPathData, rotatePoint, routeOrthogonalConnector, screenToWorld, serializeScene, subtractRectFromCircle, trimAndJoinLines, trimCircleOutsideRect, trimLineByCrossing, trimSelectionByStroke, validateDiagramScene, worldToScreen, zoomViewportAt } from ".."
import type { DiagramPoint, DiagramSceneInput } from ".."

const scene: DiagramSceneInput = {
  nodes: [
    { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 60, portIds: ["p1"] },
    { id: "n2", kind: "node", x: 260, y: 0, width: 100, height: 60, portIds: ["p2"] },
  ],
  ports: [
    { id: "p1", kind: "port", nodeId: "n1", x: 100, y: 30 },
    { id: "p2", kind: "port", nodeId: "n2", x: 0, y: 30 },
  ],
  edges: [
    { id: "e1", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "port", portId: "p2" } },
  ],
  texts: [
    { id: "t1", kind: "text", x: 20, y: 100, text: "Label" },
  ],
  shapes: [
    { id: "s1", kind: "shape", shape: "rect", x: 120, y: 80, width: 50, height: 40 },
  ],
  viewport: { x: 0, y: 0, width: 500, height: 300, zoom: 1 },
}

describe("DiagramEngine", () => {
  it("trims only to the nearest eligible geometry boundary and uses identical preview and commit", () => {
    const engine = createDiagramEngine({ shapes: [
      { id: "target", kind: "shape", shape: "line", x: 0, y: 20, width: 100, height: 0, metadata: { color: "red", tag: 4 } },
      { id: "boundary", kind: "shape", shape: "line", x: 70, y: 0, width: 0, height: 40, metadata: { keep: true } },
    ] })
    const before = engine.serialize()
    const untouchedBoundary = engine.getScene().entities.shapesById.get("boundary")
    const result = trimSelectionByStroke(before, { targetIds: ["target"], stroke: [{ x: 30, y: 40 }, { x: 30, y: 0 }], tolerance: 0.01 })
    expect(result.findings).toEqual([])
    expect(result.targets[0]).toMatchObject({
      changed: true,
      sweepCrossings: [{ x: 30, y: 20 }],
      cutPoints: [{ x: 30, y: 20 }],
      boundaryIntersections: [{ point: { x: 70, y: 20 }, boundaryId: "boundary" }],
    })
    expect(result.targets[0]?.retained).toEqual([
      { segments: [{ kind: "line", start: { x: 0, y: 20 }, end: { x: 30, y: 20 } }], closed: false },
      { segments: [{ kind: "line", start: { x: 70, y: 20 }, end: { x: 100, y: 20 } }], closed: false },
    ])
    const batch = engine.dispatchBatch(result.updates)
    expect(batch).toMatchObject({ ok: true, changed: true, affectedIds: ["target"] })
    expect(engine.getGeometrySnapshot("target")?.pathContours).toEqual(createDiagramEngine({ shapes: [result.targets[0]!.preview!] }).getGeometrySnapshot("target")?.pathContours)
    expect(engine.getScene().entities.shapesById.get("boundary")).toBe(untouchedBoundary)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.serialize()).toEqual(before)
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("target")?.pathContours).toEqual(createDiagramEngine({ shapes: [result.targets[0]!.preview!] }).getGeometrySnapshot("target")?.pathContours)
  })

  it("reports missing, ambiguous, and unsupported trim boundaries without modifying targets", () => {
    const base = createDiagramEngine({ shapes: [{ id: "line", kind: "shape", shape: "line", x: 0, y: 20, width: 100, height: 0 }] }).serialize()
    const stroke = [{ x: 30, y: 40 }, { x: 30, y: 0 }]
    expect(trimSelectionByStroke(base, { targetIds: ["line"], stroke, tolerance: 0.01 }).targets[0]).toMatchObject({ changed: false, finding: { code: "no-boundary" }, sweepCrossings: [{ x: 30, y: 20 }] })
    const ambiguous = { ...base, shapes: [...base.shapes, { id: "boundary-a", kind: "shape" as const, shape: "line", x: 70, y: 0, width: 0, height: 40 }, { id: "boundary-b", kind: "shape" as const, shape: "line", x: 70, y: 0, width: 0, height: 40 }] }
    expect(trimSelectionByStroke(ambiguous, { targetIds: ["line"], stroke, tolerance: 0.01 }).targets[0]).toMatchObject({ changed: false, finding: { code: "ambiguous-boundary" }, boundaryIntersections: [] })
    const unsupported = { ...base, shapes: [...base.shapes, { id: "ellipse", kind: "shape" as const, shape: "ellipse", x: 60, y: 0, width: 20, height: 40 }] }
    expect(trimSelectionByStroke(unsupported, { targetIds: ["line"], stroke, tolerance: 0.01, boundaryIds: ["ellipse"] }).targets[0]?.finding?.code).toBe("unsupported-boundary")
    const malformed = { ...base, shapes: [...base.shapes, { id: "bad-boundary", kind: "shape" as const, shape: "line", x: Number.NaN, y: 0, width: 0, height: 40 }] }
    expect(trimSelectionByStroke(malformed, { targetIds: ["line"], stroke, tolerance: 0.01, boundaryIds: ["bad-boundary"] }).targets[0]?.finding?.code).toBe("invalid-input")
    expect(trimSelectionByStroke(base, { targetIds: ["line"], stroke: [{ x: 1, y: 1 }, { x: 2, y: 2 }], tolerance: 0.01 }).targets[0]?.finding?.code).toBe("no-intersection")
  })

  it("uses exact line-arc intersections as trim boundaries in either orientation", () => {
    const lineTarget = createDiagramEngine({ shapes: [
      { id: "line-target", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 0 },
      { id: "arc-boundary", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 40, pathContours: [{ closed: false, segments: [{ kind: "arc", center: { x: 70, y: 0 }, radius: 20, startAngle: Math.PI / 2, sweepAngle: Math.PI }] }] },
    ] })
    const lineResult = trimSelectionByStroke(lineTarget.serialize(), { targetIds: ["line-target"], stroke: [{ x: 30, y: 10 }, { x: 30, y: -10 }], tolerance: 0.01 })
    expect(lineResult.targets[0]?.boundaryIntersections[0]?.point.x).toBeCloseTo(50)
    expect(lineResult.targets[0]?.retained.flatMap((contour) => contour.segments)).toHaveLength(2)

    const arcTarget = createDiagramEngine({ shapes: [
      { id: "arc-target", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 100, pathContours: [{ closed: false, segments: [{ kind: "arc", center: { x: 50, y: 50 }, radius: 40, startAngle: 0, sweepAngle: Math.PI }] }] },
      { id: "line-boundary", kind: "shape", shape: "line", x: 0, y: 60, width: 100, height: 0 },
    ] })
    const arcResult = trimSelectionByStroke(arcTarget.serialize(), { targetIds: ["arc-target"], stroke: [{ x: 80, y: 100 }, { x: 80, y: 0 }], tolerance: 0.01 })
    expect(arcResult.targets[0]?.boundaryIntersections[0]?.point.y).toBeCloseTo(60)
    expect(arcResult.targets[0]?.retained.flatMap((contour) => contour.segments).every((segment) => segment.kind === "arc")).toBe(true)
  })

  it("builds rounded connector paths and bridges only strict unconnected crossings on the upper edge", () => {
    const engine = createDiagramEngine({ edges: [
      { id: "horizontal", kind: "edge", source: { kind: "point", point: { x: 0, y: 50 } }, target: { kind: "point", point: { x: 100, y: 50 } }, points: [{ x: 25, y: 50 }, { x: 75, y: 50 }] },
      { id: "vertical", kind: "edge", source: { kind: "point", point: { x: 50, y: 0 } }, target: { kind: "point", point: { x: 50, y: 100 } }, points: [{ x: 50, y: 25 }, { x: 50, y: 75 }] },
      { id: "bend", kind: "edge", source: { kind: "point", point: { x: 120, y: 0 } }, target: { kind: "point", point: { x: 180, y: 60 } }, points: [{ x: 180, y: 0 }] },
    ] })
    const straight = engine.getConnectorRenderGeometry()
    expect(straight.find((edge) => edge.id === "vertical")?.commands.some((command) => command.kind === "cubicTo" || command.kind === "quadraticTo")).toBe(false)
    const rendered = engine.getConnectorRenderGeometry({ cornerRadius: 12, crossingBridge: { radius: 8 } })
    const vertical = rendered.find((edge) => edge.id === "vertical")!
    expect(vertical.bridges).toEqual([{ point: { x: 50, y: 50 }, overId: "vertical", underId: "horizontal", radius: 8 }])
    expect(vertical.commands.some((command) => command.kind === "cubicTo")).toBe(true)
    expect(rendered.find((edge) => edge.id === "bend")?.commands.some((command) => command.kind === "quadraticTo")).toBe(true)
    const clamped = engine.getConnectorRenderGeometry({ cornerRadius: 80 }).find((edge) => edge.id === "bend")!
    expect(clamped.commands).toContainEqual({ kind: "lineTo", point: { x: 150, y: 0 } })
    expect(clamped.commands).toContainEqual({ kind: "quadraticTo", control: { x: 180, y: 0 }, point: { x: 180, y: 30 } })
    expect(engine.getDiagnostics().undoDepth).toBe(0)

    engine.dispatch({ type: "bringToFront", ids: ["horizontal"] })
    const reordered = engine.getConnectorRenderGeometry({ crossingBridge: { radius: 8 } })
    expect(reordered.find((edge) => edge.id === "horizontal")?.bridges[0]).toMatchObject({ overId: "horizontal", underId: "vertical" })
    engine.dispatch({ type: "moveEdgeWaypoint", id: "horizontal", index: 0, point: { x: 25, y: 30 } })
    const moved = engine.getConnectorRenderGeometry({ crossingBridge: { radius: 8 } })
    expect(moved.find((edge) => edge.id === "horizontal")?.bridges[0]?.point).toEqual({ x: 50, y: 40 })

    const touching = createDiagramEngine({ edges: [
      { id: "a", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 10, y: 10 } } },
      { id: "b", kind: "edge", source: { kind: "point", point: { x: 10, y: 10 } }, target: { kind: "point", point: { x: 20, y: 0 } } },
      { id: "c", kind: "edge", source: { kind: "point", point: { x: 0, y: 20 } }, target: { kind: "point", point: { x: 20, y: 20 } } },
    ] })
    expect(touching.getConnectorRenderGeometry({ crossingBridge: { radius: 5 } }).flatMap((edge) => edge.bridges)).toEqual([])
    const overlap = createDiagramEngine({ edges: [
      { id: "overlap-a", kind: "edge", source: { kind: "point", point: { x: 0, y: 5 } }, target: { kind: "point", point: { x: 20, y: 5 } } },
      { id: "overlap-b", kind: "edge", source: { kind: "point", point: { x: 10, y: 5 } }, target: { kind: "point", point: { x: 30, y: 5 } } },
    ] })
    expect(overlap.getConnectorRenderGeometry({ crossingBridge: { radius: 5 } }).flatMap((edge) => edge.bridges)).toEqual([])
    const sharedPort = createDiagramEngine({
      nodes: [{ id: "host", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["shared"] }],
      ports: [{ id: "shared", kind: "port", nodeId: "host", x: 10, y: 10 }],
      edges: [
        { id: "port-a", kind: "edge", source: { kind: "port", portId: "shared" }, target: { kind: "point", point: { x: 100, y: 10 } } },
        { id: "port-b", kind: "edge", source: { kind: "port", portId: "shared" }, target: { kind: "point", point: { x: 10, y: 100 } } },
      ],
    })
    expect(sharedPort.getConnectorRenderGeometry({ crossingBridge: { radius: 5 } }).flatMap((edge) => edge.bridges)).toEqual([])
    expect(() => engine.getConnectorRenderGeometry({ cornerRadius: Number.NaN })).toThrow(RangeError)
  })

  it("draws an exact cubic Bézier contour with transient preview and one undoable commit", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 } })
    const frames: Array<() => void> = []
    const pointer = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => frames.push(callback) })
    expect(pointer.beginBezierCreation("pen", { id: 1, point: { x: 10, y: 10 } })).toBe(true)
    pointer.pointerMove({ id: 1, point: { x: 20, y: 20 } })
    frames.shift()?.()
    expect(pointer.getSnapshot().bezierCreationPreview?.contour.segments).toHaveLength(1)
    pointer.pointerDown({ id: 1, point: { x: 40, y: 10 } })
    pointer.pointerMove({ id: 1, point: { x: 40, y: 30 } })
    frames.shift()?.()
    const preview = pointer.getSnapshot().bezierCreationPreview!
    expect(preview.contour.segments[0]).toMatchObject({ kind: "cubic", start: { x: 10, y: 10 }, control1: { x: 10, y: 10 }, control2: { x: 40, y: 30 }, end: { x: 40, y: 10 } })
    pointer.pointerUp({ id: 1, point: { x: 40, y: 30 } })
    expect(pointer.finishBezierCreation()).toBe(true)
    expect(engine.getGeometrySnapshot("pen")?.pathContours?.[0]?.segments[0]).toEqual(preview.contour.segments[0])
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.has("pen")).toBe(false)
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("pen")?.pathContours?.[0]?.segments[0]).toEqual(preview.contour.segments[0])
  })

  it("cancels a cubic draft without changing document history and supports Shift tangent constraints", () => {
    const engine = createDiagramEngine()
    const pointer = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    pointer.beginBezierCreation("draft", { id: 1, point: { x: 0, y: 0 } })
    pointer.pointerDown({ id: 1, point: { x: 20, y: 20 } })
    pointer.pointerMove({ id: 1, point: { x: 24, y: 29 }, shiftKey: true })
    const preview = pointer.getSnapshot().bezierCreationPreview!
    expect(preview.activeAnchor?.incoming?.x).toBe(20)
    expect(preview.activeAnchor?.incoming?.y).toBeGreaterThan(29)
    pointer.cancel()
    expect(engine.serialize().shapes).toHaveLength(0)
    expect(engine.getDiagnostics().undoDepth).toBe(0)
    expect(engine.getDocumentRevision()).toBe(0)
  })

  it("closes a pen contour at the first anchor and round-trips it", () => {
    const engine = createDiagramEngine()
    const pointer = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    pointer.beginBezierCreation("closed-bezier", { id: 7, point: { x: 0, y: 0 } }, { closeTolerancePx: 6 })
    pointer.pointerMove({ id: 7, point: { x: 20, y: 0 } })
    pointer.pointerDown({ id: 7, point: { x: 20, y: 0 } })
    pointer.pointerUp({ id: 7, point: { x: 20, y: 0 } })
    pointer.pointerDown({ id: 7, point: { x: 1, y: 1 } })
    pointer.pointerUp({ id: 7, point: { x: 1, y: 1 } })
    const contour = engine.getScene().entities.shapesById.get("closed-bezier")?.pathContours?.[0]
    expect(contour?.closed).toBe(true)
    expect(contour?.segments).toHaveLength(2)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    const roundTrip = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(roundTrip.getScene().entities.shapesById.get("closed-bezier")?.pathContours?.[0]).toEqual(contour)
  })

  it("stores a sharp-click segment as a line beside dragged native cubic segments", () => {
    const engine = createDiagramEngine()
    const pointer = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    pointer.beginBezierCreation("mixed-pen", { id: 8, point: { x: 0, y: 0 } })
    pointer.pointerDown({ id: 8, point: { x: 20, y: 0 } })
    pointer.pointerUp({ id: 8, point: { x: 20, y: 0 } })
    pointer.pointerDown({ id: 8, point: { x: 40, y: 0 } })
    pointer.pointerMove({ id: 8, point: { x: 40, y: 10 } })
    pointer.pointerUp({ id: 8, point: { x: 40, y: 10 } })
    pointer.finishBezierCreation()
    const contour = engine.getScene().entities.shapesById.get("mixed-pen")?.pathContours?.[0]
    expect(contour?.segments.map((segment) => segment.kind)).toEqual(["line", "cubic"])
    const restored = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(restored.getScene().entities.shapesById.get("mixed-pen")?.pathContours?.[0]).toEqual(contour)
  })

  it("previews and commits cubic tangent edits as one undoable path update", () => {
    const original = { kind: "cubic" as const, start: { x: 0, y: 0 }, control1: { x: 10, y: 0 }, control2: { x: 20, y: 0 }, end: { x: 30, y: 0 } }
    const engine = createDiagramEngine({ shapes: [{ id: "curve-edit", kind: "shape", shape: "line", x: 0, y: 0, width: 30, height: 0, pathContours: [{ segments: [original], closed: false }] }] })
    const pointer = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callback(), snap: { enabled: false } })
    expect(pointer.beginBezierHandle("curve-edit", 0, 0, "outgoing", { id: 2, point: { x: 10, y: 0 } })).toBe(true)
    pointer.pointerMove({ id: 2, point: { x: 12, y: 8 } })
    const previewGeometry = pointer.getPreviewGeometry("curve-edit")!
    expect(previewGeometry.pathContours?.[0]?.segments[0]).toMatchObject({ kind: "cubic", control1: { x: 12, y: 8 } })
    pointer.pointerUp({ id: 2, point: { x: 12, y: 8 } })
    expect(engine.getGeometrySnapshot("curve-edit")?.pathContours?.[0]?.segments[0]).toMatchObject({ kind: "cubic", control1: { x: 12, y: 8 } })
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.get("curve-edit")?.pathContours?.[0]?.segments[0]).toEqual(original)
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("curve-edit")?.pathContours?.[0]?.segments[0]).toEqual(previewGeometry.pathContours?.[0]?.segments[0])
  })

  it("keeps transformed cubic handle preview identical to commit and undo", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "rotated-curve", kind: "shape", shape: "line", x: 20, y: 30, width: 40, height: 20, rotation: 90, flipX: true, pathContours: [{ segments: [{ kind: "cubic", start: { x: 0, y: 10 }, control1: { x: 10, y: 0 }, control2: { x: 30, y: 20 }, end: { x: 40, y: 10 } }] }] }] })
    const before = engine.getGeometrySnapshot("rotated-curve")!.pathContours![0]!.segments[0]
    const control = before.kind === "cubic" ? before.control1 : { x: 0, y: 0 }
    const pointer = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callback(), snap: { enabled: false } })
    pointer.beginBezierHandle("rotated-curve", 0, 0, "outgoing", { id: 3, point: control })
    pointer.pointerMove({ id: 3, point: { x: control.x + 8, y: control.y + 5 } })
    const preview = pointer.getPreviewGeometry("rotated-curve")!
    pointer.pointerUp({ id: 3, point: { x: control.x + 8, y: control.y + 5 } })
    expect(engine.getGeometrySnapshot("rotated-curve")?.pathContours).toEqual(preview.pathContours)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("rotated-curve")?.pathContours?.[0]?.segments[0]).toEqual(before)
  })

  it("updates render order and visible queries when pasting after order caches are read", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 900, height: 600, zoom: 1 } })
    engine.serialize()
    engine.getRenderOrder()
    const clipboard = {
      nodes: [], edges: [], texts: [],
      shapes: [
        { id: "figure-test", kind: "shape" as const, x: 100, y: 100, width: 100, height: 80, shape: "rect" as const },
        { id: "figure-second", kind: "shape" as const, x: 250, y: 100, width: 80, height: 60, shape: "rect" as const },
      ],
      ports: [], selection: { ids: [], primaryId: null }, viewport: engine.serialize().viewport,
    }

    expect(engine.dispatch({ type: "pasteClipboard", clipboard, offset: { x: 0, y: 0 } }).changed).toBe(true)
    const pastedIds = engine.serialize().shapes.map((shape) => shape.id)
    expect(engine.getRenderOrder()).toEqual(pastedIds)
    expect(engine.queryVisible({ x: 90, y: 90, width: 250, height: 100 })).toEqual(pastedIds)

    engine.dispatch({ type: "undo" })
    expect(engine.getRenderOrder()).toEqual([])
    expect(engine.queryVisible({ x: 90, y: 90, width: 250, height: 100 })).toEqual([])
    engine.dispatch({ type: "redo" })
    expect(engine.getRenderOrder()).toEqual(pastedIds)
    expect(engine.queryVisible({ x: 90, y: 90, width: 250, height: 100 })).toEqual(pastedIds)
  })

  it("updates render order when one paste inserts multiple entity types", () => {
    const engine = createDiagramEngine()
    engine.getRenderOrder()
    const clipboard = {
      nodes: [{ id: "node", kind: "node" as const, x: 10, y: 10, width: 20, height: 20 }],
      edges: [], texts: [{ id: "text", kind: "text" as const, x: 40, y: 10, text: "hello" }],
      shapes: [{ id: "shape", kind: "shape" as const, shape: "rect" as const, x: 70, y: 10, width: 20, height: 20 }],
      ports: [], selection: { ids: [], primaryId: null }, viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 1 },
    }
    engine.dispatch({ type: "pasteClipboard", clipboard, offset: { x: 0, y: 0 } })
    expect(engine.getRenderOrder()).toEqual(expect.arrayContaining(["node-copy-1", "text-copy-2", "shape-copy-3"]))
    expect(engine.getRenderOrder()).toHaveLength(3)
  })

  it("creates and round-trips a styled table through scene and document serialization", () => {
    const engine = createDiagramEngine()
    const table = {
      id: "table-1", kind: "table" as const, x: 20, y: 30, width: 200, height: 100, rowCount: 2, columnCount: 2,
      cells: [[{ text: "Name", horizontalAlign: "center" as const }, { text: "Value" }], [{ text: "A" }, { text: "12", verticalAlign: "bottom" as const }]],
      rowHeights: [40, 60], columnWidths: [80, 120],
      style: { grid: { visible: true, stroke: { color: "#123456", width: 2, style: "dashed" as const } }, border: { visible: true, stroke: { color: "#654321", width: 3, style: "solid" as const }, radius: 12 }, cellPadding: 6 },
    }
    expect(engine.dispatch({ type: "createTable", table }).changed).toBe(true)
    const saved = engine.serialize()
    expect(saved.tables?.[0]).toMatchObject({ cells: table.cells, style: table.style, rowHeights: [40, 60], columnWidths: [80, 120] })
    expect(createDiagramEngine(deserializeScene(saved)).serialize().tables).toEqual(saved.tables)
    expect(createDiagramEngine(deserializeDiagramDocument(engine.serializeDocument())).serialize().tables).toEqual(saved.tables)
  })

  it("updates rectangular corner radius with validation, one history entry, and legacy-safe serialization", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "plain", kind: "shape", shape: "rect", x: 0, y: 0, width: 40, height: 20 }, { id: "ellipse", kind: "shape", shape: "ellipse", x: 50, y: 0, width: 20, height: 20 }] })
    expect(engine.serialize().shapes?.[0]).not.toHaveProperty("cornerRadius")
    expect(engine.getGeometrySnapshot("plain")?.cornerRadius).toBe(0)
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    expect(engine.dispatch({ type: "updateShape", id: "plain", cornerRadius: 10 }).changed).toBe(true)
    expect(engine.getDocumentRevision()).toBe(revision + 1)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)
    expect(engine.getGeometrySnapshot("plain")?.cornerRadius).toBe(10)
    expect(engine.dispatch({ type: "updateShape", id: "plain", cornerRadius: 10 }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateShape", id: "plain", cornerRadius: 11 }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateShape", id: "plain", cornerRadius: -1 }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateShape", id: "plain", cornerRadius: Number.POSITIVE_INFINITY }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateShape", id: "ellipse", cornerRadius: 1 }).changed).toBe(false)
    expect(() => createDiagramEngine({ shapes: [{ id: "invalid", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 10, cornerRadius: 6 }] })).toThrow(TypeError)
    expect(() => createDiagramEngine({ shapes: [{ id: "invalid-infinite", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 10, cornerRadius: Number.NaN }] })).toThrow(TypeError)
    expect(() => createDiagramEngine({ shapes: [{ id: "invalid-line", kind: "shape", shape: "line", x: 0, y: 0, width: 20, height: 10, cornerRadius: 1 }] })).toThrow(TypeError)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.get("plain")).not.toHaveProperty("cornerRadius")
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.shapesById.get("plain")?.cornerRadius).toBe(10)
    const serialized = engine.serialize()
    expect(createDiagramEngine(deserializeScene(serialized)).serialize()).toEqual(serialized)
    engine.dispatch({ type: "setSelection", selection: { ids: ["plain"], primaryId: "plain" } })
    engine.duplicateSelection()
    expect([...engine.getScene().entities.shapesById.values()].find((shape) => !["plain", "ellipse"].includes(shape.id))?.cornerRadius).toBe(10)
    expect(engine.dispatch({ type: "resizeEntities", entries: [{ id: "plain", width: 10, height: 10 }] }).changed).toBe(false)
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => frames.push(callback) })
    expect(interaction.beginResizeHandle("plain", "se", { id: 41, point: { x: 40, y: 20 } })).toBe(true)
    interaction.pointerMove({ id: 41, point: { x: 5, y: 5 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().resizePreview).toMatchObject({ width: 20, height: 20 })
    interaction.pointerUp({ id: 41, point: { x: 5, y: 5 } })
    expect(engine.getScene().entities.shapesById.get("plain")).toMatchObject({ width: 20, height: 20, cornerRadius: 10 })
  })

  it("keeps optional table headers independent of data rows through editing, geometry, transforms, resize, and clipboard", () => {
    const engine = createDiagramEngine({ tables: [{ id: "table", kind: "table", x: 20, y: 40, width: 100, height: 40, rowCount: 1, columnCount: 1, cells: [[{ text: "cell" }]] }] })
    const legacy = engine.serialize()
    const revision = engine.getDocumentRevision()
    expect(legacy.tables?.[0]).not.toHaveProperty("header")
    expect(engine.getGeometrySnapshot("table")?.bounds).toEqual({ x: 20, y: 40, width: 100, height: 40 })
    expect(engine.dispatch({ type: "updateTableHeader", id: "table", header: { text: "Panel", height: 20, horizontalAlign: "center", verticalAlign: "top" } }).changed).toBe(true)
    expect(engine.getDocumentRevision()).toBe(revision + 1)
    expect(engine.dispatch({ type: "updateTableHeader", id: "table", header: { text: "Updated panel", height: 24, horizontalAlign: "right", verticalAlign: "bottom" } }).changed).toBe(true)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("table")?.header).toEqual({ text: "Panel", height: 20, horizontalAlign: "center", verticalAlign: "top" })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.tablesById.get("table")?.header).toEqual({ text: "Updated panel", height: 24, horizontalAlign: "right", verticalAlign: "bottom" })
    const headerRoundTrip = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(headerRoundTrip.getScene().entities.tablesById.get("table")?.header).toEqual(engine.getScene().entities.tablesById.get("table")?.header)
    engine.dispatch({ type: "undo" })
    let table = engine.getScene().entities.tablesById.get("table")!
    expect(table.rowCount).toBe(1)
    expect(table.cells?.[0]?.[0]?.text).toBe("cell")
    expect(engine.getGeometrySnapshot("table")?.bounds).toEqual({ x: 20, y: 20, width: 100, height: 60 })
    expect(engine.hitTest({ x: 30, y: 25 })?.id).toBe("table")
    expect(getDiagramTableCellAt(table, { x: 30, y: 25 })).toBeNull()
    engine.dispatch({ type: "insertTableRow", id: "table", index: 1 })
    engine.dispatch({ type: "insertTableColumn", id: "table", index: 1 })
    expect(engine.getScene().entities.tablesById.get("table")?.header?.text).toBe("Panel")
    engine.dispatch({ type: "deleteTableRow", id: "table", index: 1 })
    engine.dispatch({ type: "deleteTableColumn", id: "table", index: 1 })
    expect(engine.getScene().entities.tablesById.get("table")).toMatchObject({ rowCount: 1, columnCount: 1, cells: [[{ text: "cell" }]], header: { text: "Panel" } })
    engine.dispatch({ type: "resizeEntities", entries: [{ id: "table", x: 10, y: 10, width: 200, height: 120 }] })
    table = engine.getScene().entities.tablesById.get("table")!
    expect(table).toMatchObject({ x: 10, y: 50, width: 200, height: 80, header: { text: "Panel", height: 40 } })
    engine.dispatch({ type: "rotateEntities", entries: [{ id: "table", rotation: 90 }] })
    engine.dispatch({ type: "flipEntities", ids: ["table"], axis: "vertical" })
    expect(engine.getScene().entities.tablesById.get("table")?.header).toMatchObject({ text: "Panel", height: 40 })
    expect(createDiagramEngine(deserializeDiagramDocument(engine.serializeDocument())).serialize().tables).toEqual(engine.serialize().tables)
    engine.dispatch({ type: "setSelection", selection: { ids: ["table"], primaryId: "table" } })
    const clipboard = engine.exportSelection()
    engine.importClipboard(clipboard)
    expect([...engine.getScene().entities.tablesById.values()].find((item) => item.id !== "table")?.header?.text).toBe("Panel")
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "setSelection", selection: { ids: ["table"], primaryId: "table" } })
    engine.duplicateSelection()
    const duplicateId = [...engine.getScene().entities.tablesById.keys()].find((id) => id !== "table")!
    expect(engine.getScene().entities.tablesById.get(duplicateId)?.header?.text).toBe("Panel")
    engine.dispatch({ type: "groupEntities", id: "g", ids: ["table", duplicateId] })
    engine.dispatch({ type: "moveEntities", ids: ["g"], delta: { x: 5, y: 5 } })
    expect(engine.getScene().entities.tablesById.get("table")?.header?.text).toBe("Panel")
    engine.dispatch({ type: "ungroupEntities", ids: ["g"] })
    engine.dispatch({ type: "updateTableHeader", id: "table", header: null })
    expect(engine.getScene().entities.tablesById.get("table")).not.toHaveProperty("header")
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("table")?.header?.text).toBe("Panel")
    expect(engine.dispatch({ type: "updateTableHeader", id: "table", header: { text: "bad", height: 0 } }).changed).toBe(false)
    expect(() => createDiagramEngine({ tables: [{ id: "bad-header", kind: "table", x: 0, y: 0, width: 1, height: 1, rowCount: 1, columnCount: 1, header: { text: "bad", height: Number.NaN } }] })).toThrow(TypeError)
    const minimumTable = createDiagramEngine({ tables: [{ id: "minimum", kind: "table", x: 0, y: 0, width: 1, height: 1, rowCount: 1, columnCount: 1, header: { text: "", height: 0.01 } }] })
    expect(minimumTable.getGeometrySnapshot("minimum")?.bounds).toEqual({ x: 0, y: -0.01, width: 1, height: 1.01 })
  })

  it("inserts and deletes table rows and columns while preserving neighbor data and size", () => {
    const engine = createDiagramEngine({ tables: [{ id: "t", kind: "table", x: 0, y: 0, width: 120, height: 60, rowCount: 2, columnCount: 2, cells: [[{ text: "a" }, { text: "b" }], [{ text: "c" }, { text: "d" }]] }] })
    engine.dispatch({ type: "insertTableRow", id: "t", index: 1, cells: [{ text: "x" }, { text: "y" }] })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ rowCount: 3, rowHeights: [30, 15, 15], cells: [[{ text: "a" }, { text: "b" }], [{ text: "x" }, { text: "y" }], [{ text: "c" }, { text: "d" }]] })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("t")?.rowCount).toBe(2)
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "deleteTableRow", id: "t", index: 1 })
    expect(engine.getScene().entities.tablesById.get("t")?.rowHeights).toEqual([30, 30])
    engine.dispatch({ type: "insertTableColumn", id: "t", index: 1, cells: [{ text: "m" }, { text: "n" }] })
    expect(engine.getScene().entities.tablesById.get("t")?.cells).toEqual([[{ text: "a" }, { text: "m" }, { text: "b" }], [{ text: "c" }, { text: "n" }, { text: "d" }]])
    engine.dispatch({ type: "deleteTableColumn", id: "t", index: 1 })
    const finalTable = engine.getScene().entities.tablesById.get("t")!
    expect(finalTable.columnCount).toBe(2)
    expect(finalTable.cells).toEqual([[{ text: "a" }, { text: "b" }], [{ text: "c" }, { text: "d" }]])
    expect(finalTable.columnWidths!.reduce((sum, size) => sum + size, 0)).toBe(120)
    expect(engine.dispatch({ type: "deleteTableRow", id: "t", index: 0 }).changed).toBe(true)
    expect(engine.dispatch({ type: "deleteTableRow", id: "t", index: 0 }).changed).toBe(false)
    expect(engine.dispatch({ type: "deleteTableColumn", id: "t", index: 0 }).changed).toBe(true)
    expect(engine.dispatch({ type: "deleteTableColumn", id: "t", index: 0 }).changed).toBe(false)
  })

  it("edits cells and alignment as undoable changes and validates cell/style commands", () => {
    const engine = createDiagramEngine({ tables: [{ id: "t", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 1, columnCount: 2 }] })
    engine.dispatch({ type: "updateTableCell", id: "t", row: 0, column: 1, cell: { text: "hello", horizontalAlign: "right", verticalAlign: "middle" } })
    expect(engine.getScene().entities.tablesById.get("t")?.cells?.[0]?.[1]).toEqual({ text: "hello", horizontalAlign: "right", verticalAlign: "middle" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("t")?.cells?.[0]?.[1]?.text).toBe("")
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "updateTableStyle", id: "t", style: { grid: { visible: false }, border: { radius: 10, stroke: { color: "#ff0000", width: 2, style: "dotted" } } } })
    expect(engine.getScene().entities.tablesById.get("t")?.style).toMatchObject({ grid: { visible: false }, border: { radius: 10, stroke: { color: "#ff0000", width: 2, style: "dotted" } } })
    expect(engine.dispatch({ type: "updateTableCell", id: "t", row: 3, column: 0, cell: { text: "bad" } }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateTableCell", id: "t", row: 0, column: 0, cell: { horizontalAlign: "justify" as unknown as "left" } }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateTableStyle", id: "t", style: { border: { stroke: { width: -1 } } } }).changed).toBe(false)
  })

  it("resizes individual rows and columns as undoable geometry changes", () => {
    const engine = createDiagramEngine({ tables: [{ id: "t", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 2, columnCount: 2 }] })
    engine.dispatch({ type: "resizeTableRow", id: "t", index: 0, height: 30 })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ height: 50, rowHeights: [30, 20] })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ height: 40, rowHeights: [20, 20] })
    engine.dispatch({ type: "resizeTableColumn", id: "t", index: 1, width: 70 })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 120, columnWidths: [50, 70] })
    expect(engine.dispatch({ type: "resizeTableColumn", id: "t", index: 4, width: 100 }).changed).toBe(false)
  })

  it("previews a rotated table row resize and commits exactly once on pointer up", () => {
    const engine = createDiagramEngine({
      tables: [{ id: "rotated-table", kind: "table", x: 10, y: 20, width: 100, height: 40, rowCount: 2, columnCount: 2, rotation: 90 }],
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 0.5 },
    })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback) })
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    expect(interaction.beginTableResizeHandle("rotated-table", "row", 0, { id: 41, point: { x: 100, y: 100 } })).toBe(true)
    interaction.pointerMove({ id: 41, point: { x: 90, y: 100 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().tableResizePreview).toMatchObject({ axis: "row", index: 0, size: 30, width: 100, height: 50 })
    expect(engine.getScene().entities.tablesById.get("rotated-table")?.rowHeights).toEqual([20, 20])
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
    interaction.pointerUp({ id: 41, point: { x: 90, y: 100 } })
    expect(engine.getScene().entities.tablesById.get("rotated-table")).toMatchObject({ height: 50, rowHeights: [30, 20], rotation: 90 })
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)
    expect(engine.getGeometrySnapshot("rotated-table")?.unrotatedBounds).toMatchObject({ width: 100, height: 50 })
    expect(engine.getGeometrySnapshot("rotated-table")?.bounds).toMatchObject({ width: 50, height: 100 })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("rotated-table")?.rowHeights).toEqual([20, 20])
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.tablesById.get("rotated-table")?.rowHeights).toEqual([30, 20])
    engine.dispatch({ type: "resizeTableColumn", id: "rotated-table", index: 0, width: 70 })
    expect(engine.getScene().entities.tablesById.get("rotated-table")).toMatchObject({ width: 120, columnWidths: [70, 50] })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("rotated-table")).toMatchObject({ width: 100, columnWidths: [50, 50] })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.tablesById.get("rotated-table")).toMatchObject({ width: 120, columnWidths: [70, 50] })
  })

  it("cancels transient table axis resize without changing scene or history", () => {
    const engine = createDiagramEngine({ tables: [{ id: "cancel-table", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 2, columnCount: 2 }] })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback) })
    const before = engine.serialize()
    const undoDepth = engine.getDiagnostics().undoDepth
    interaction.beginTableResizeHandle("cancel-table", "column", 0, { id: 42, point: { x: 50, y: 20 } })
    interaction.pointerMove({ id: 42, point: { x: 80, y: 20 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().tableResizePreview?.columnWidths).toEqual([80, 50])
    interaction.cancel()
    expect(interaction.getSnapshot().tableResizePreview).toBeNull()
    expect(engine.serialize()).toEqual(before)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
  })

  it("applies table construction and edits atomically in one batch history entry", () => {
    const engine = createDiagramEngine()
    const result = engine.dispatchBatch([
      { type: "createTable", table: { id: "t", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 1, columnCount: 1 } },
      { type: "insertTableRow", id: "t", index: 1, cells: [{ text: "second" }] },
      { type: "updateTableCell", id: "t", row: 1, column: 0, cell: { horizontalAlign: "right" } },
    ])
    expect(result).toMatchObject({ ok: true, changed: true })
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    expect(engine.getScene().entities.tablesById.get("t")?.cells?.[1]?.[0]).toEqual({ text: "second", horizontalAlign: "right" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.has("t")).toBe(false)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.tablesById.get("t")?.rowCount).toBe(2)
  })

  it("previews and commits table resize with scaled row and column sizes", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      tables: [{ id: "t", kind: "table", x: 0, y: 0, width: 100, height: 50, rowCount: 2, columnCount: 2, rowHeights: [20, 30], columnWidths: [40, 60] }],
      selection: { ids: ["t"], primaryId: "t" },
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })
    expect(controller.beginResizeHandle("t", "se", { id: 4, point: { x: 100, y: 50 } })).toBe(true)
    controller.pointerMove({ id: 4, point: { x: 150, y: 100 } })
    callbacks.shift()?.()
    expect(controller.getSnapshot().resizePreview).toMatchObject({ id: "t", width: 150, height: 100 })
    expect(controller.getPreviewGeometry("t")?.bounds).toEqual({ x: 0, y: 0, width: 150, height: 100 })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 100, height: 50 })
    controller.pointerUp({ id: 4, point: { x: 150, y: 100 } })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 150, height: 100, rowHeights: [40, 60], columnWidths: [60, 90] })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 100, height: 50, rowHeights: [20, 30], columnWidths: [40, 60] })
  })

  it("projects group resize previews to member table geometry without changing committed state", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      tables: [
        { id: "a", kind: "table", x: 0, y: 0, width: 100, height: 50, rowCount: 1, columnCount: 1 },
        { id: "b", kind: "table", x: 150, y: 0, width: 50, height: 50, rowCount: 1, columnCount: 1 },
      ],
    })
    engine.dispatch({ type: "groupEntities", id: "g", ids: ["a", "b"] })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    expect(controller.beginResizeHandle("g", "se", { id: 5, point: { x: 200, y: 50 } })).toBe(true)
    const serialized = engine.serialize()
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    controller.pointerMove({ id: 5, point: { x: 240, y: 100 } })
    callbacks.shift()?.()
    expect(controller.getPreviewGeometry("a")?.bounds).toEqual({ x: 0, y: 0, width: 120, height: 100 })
    expect(controller.getPreviewGeometry("b")?.bounds).toEqual({ x: 180, y: 0, width: 60, height: 100 })
    expect(engine.serialize()).toEqual(serialized)
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
    controller.cancel()
    expect(controller.getPreviewGeometry("a")?.bounds).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(engine.serialize()).toEqual(serialized)
  })

  it("integrates table hit testing, selection, movement, resize, clipboard, duplicate, and delete", () => {
    const engine = createDiagramEngine({ tables: [{ id: "t", kind: "table", x: 10, y: 20, width: 100, height: 40, rowCount: 2, columnCount: 2, cells: [[{ text: "a" }, { text: "b" }], [{ text: "c" }, { text: "d" }]] }] })
    expect(engine.hitTest({ x: 15, y: 25 })?.id).toBe("t")
    const table = engine.getScene().entities.tablesById.get("t")!
    expect(getDiagramTableCellAt(table, { x: 15, y: 25 })).toEqual({ row: 0, column: 0 })
    expect(getDiagramTableCellAt(table, { x: 90, y: 50 })).toEqual({ row: 1, column: 1 })
    expect(getDiagramTableCellAt(table, { x: 200, y: 200 })).toBeNull()
    engine.dispatch({ type: "setSelection", selection: { ids: ["t"], primaryId: "t" } })
    engine.dispatch({ type: "moveEntities", ids: ["t"], delta: { x: 5, y: 7 } })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ x: 15, y: 27 })
    engine.dispatch({ type: "resizeEntities", entries: [{ id: "t", width: 200, height: 80 }] })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 200, height: 80, columnWidths: [100, 100], rowHeights: [40, 40] })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 100, height: 40, columnWidths: [50, 50], rowHeights: [20, 20] })
    const clipboard = engine.exportSelection()
    expect(engine.canPaste(clipboard)).toBe(true)
    engine.importClipboard(clipboard, { x: 30, y: 40 })
    const pasted = [...engine.getScene().entities.tablesById.values()].find((entity) => entity.id !== "t")!
    expect(pasted.id).not.toBe("t")
    expect(pasted.cells).toEqual(engine.getScene().entities.tablesById.get("t")?.cells)
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "setSelection", selection: { ids: ["t"], primaryId: "t" } })
    engine.duplicateSelection()
    expect(engine.getScene().entities.tablesById.size).toBe(2)
    engine.dispatch({ type: "deleteSelection" })
    expect(engine.getScene().entities.tablesById.size).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.tablesById.size).toBe(2)
  })

  it("groups, moves, resizes, serializes, and ungroups entities through public commands", () => {
    const engine = createDiagramEngine({
      shapes: [
        { id: "a", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 10 },
        { id: "b", kind: "shape", shape: "rect", x: 40, y: 0, width: 20, height: 10 },
      ],
    })
    expect(engine.dispatch({ type: "groupEntities", id: "g", ids: ["a", "b"] }).changed).toBe(true)
    expect(engine.getScene().entities.groupsById.get("g")?.childIds).toEqual(["a", "b"])
    expect(engine.canMove(["g"])).toBe(true)
    expect(engine.canResize(["g"])).toBe(true)
    expect(engine.getGeometrySnapshot("g")?.bounds).toEqual({ x: 0, y: 0, width: 60, height: 10 })

    engine.dispatch({ type: "moveEntities", ids: ["g"], delta: { x: 10, y: 5 } })
    expect(engine.getScene().entities.shapesById.get("a")).toMatchObject({ x: 10, y: 5 })
    expect(engine.getScene().entities.shapesById.get("b")).toMatchObject({ x: 50, y: 5 })
    engine.dispatch({ type: "resizeEntities", entries: [{ id: "g", x: 10, y: 5, width: 120, height: 20 }] })
    expect(engine.getScene().entities.shapesById.get("a")).toMatchObject({ x: 10, y: 5, width: 40, height: 20 })
    expect(engine.getScene().entities.shapesById.get("b")).toMatchObject({ x: 90, y: 5, width: 40, height: 20 })

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.get("b")).toMatchObject({ x: 50, y: 5, width: 20, height: 10 })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.shapesById.get("b")).toMatchObject({ x: 90, y: 5, width: 40, height: 20 })
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.get("a")).toMatchObject({ x: 0, y: 0, width: 20, height: 10 })
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.groupsById.get("g")?.childIds).toEqual(["a", "b"])

    const restored = createDiagramEngine(engine.serialize())
    expect(restored.serialize().groups).toEqual(engine.serialize().groups)
    const documentRestored = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(documentRestored.getGeometrySnapshot("g")?.bounds).toEqual(engine.getGeometrySnapshot("g")?.bounds)
    const document = createDiagramEngine(deserializeDiagramDocument(engine.serializeDocument()))
    expect(document.getScene().entities.groupsById.get("g")?.childIds).toEqual(["a", "b"])

    engine.dispatch({ type: "ungroupEntities", ids: ["g"] })
    expect(engine.getScene().entities.groupsById.has("g")).toBe(false)
    expect(engine.getScene().entities.shapesById.has("a")).toBe(true)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.groupsById.get("g")?.childIds).toEqual(["a", "b"])
  })

  it("copies, duplicates, and deletes groups with port and edge references intact", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["p1"] },
        { id: "n2", kind: "node", x: 80, y: 0, width: 20, height: 20, portIds: ["p2"] },
      ],
      ports: [
        { id: "p1", kind: "port", nodeId: "n1", x: 20, y: 10 },
        { id: "p2", kind: "port", nodeId: "n2", x: 0, y: 10 },
      ],
      edges: [{ id: "e", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "port", portId: "p2" }, points: [{ x: 50, y: 4 }] }],
    })
    engine.dispatch({ type: "groupEntities", id: "g", ids: ["n1", "n2"] })
    const clipboard = engine.exportSelection()
    expect(clipboard.groups?.[0]?.childIds).toEqual(["n1", "n2"])
    expect(engine.canPaste(clipboard)).toBe(true)
    engine.importClipboard(clipboard, { x: 10, y: 20 })
    const pastedGroup = [...engine.getScene().entities.groupsById.values()].find((group) => group.id !== "g")!
    const pastedNodes = pastedGroup.childIds
    const pastedEdge = [...engine.getScene().entities.edgesById.values()].find((edge) => edge.id !== "e")!
    expect(pastedEdge.source.kind).toBe("port")
    if (pastedEdge.source.kind === "port") expect(engine.getScene().entities.portsById.get(pastedEdge.source.portId)?.nodeId).toBe(pastedNodes[0])
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "setSelection", selection: { ids: ["g"], primaryId: "g" } })
    engine.duplicateSelection({ x: 30, y: 30 })
    expect(engine.getScene().entities.groupsById.size).toBe(2)
    engine.dispatch({ type: "deleteSelection" })
    expect(engine.getScene().entities.groupsById.size).toBe(1)
    expect(engine.getScene().entities.nodesById.size).toBe(2)
    expect(engine.getScene().entities.edgesById.size).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.groupsById.size).toBe(2)
    expect([...engine.getScene().entities.edgesById.values()]).toHaveLength(2)
  })

  it("applies clipboard offsets to free edge endpoints and waypoints without moving attachments", () => {
    const initial = {
      nodes: [{ id: "host", kind: "node" as const, x: 300, y: 0, width: 40, height: 40, portIds: ["host-port"] }],
      ports: [{ id: "host-port", kind: "port" as const, nodeId: "host", x: 0, y: 20 }],
      edges: [
        { id: "free", kind: "edge" as const, source: { kind: "point" as const, point: { x: 0, y: 0 } }, target: { kind: "point" as const, point: { x: 100, y: 0 } }, points: [{ x: 50, y: 20 }] },
        { id: "mixed", kind: "edge" as const, source: { kind: "port" as const, portId: "host-port" }, target: { kind: "point" as const, point: { x: 200, y: 30 } }, points: [{ x: 250, y: 25 }] },
      ],
    }
    const engine = createDiagramEngine(initial)
    engine.dispatch({ type: "setSelection", selection: { ids: ["host", "free", "mixed"], primaryId: "free" } })
    const clipboard = engine.exportSelection()
    expect(engine.importClipboard(clipboard, { x: 100, y: 50 }).changed).toBe(true)
    const freeCopy = [...engine.getScene().entities.edgesById.values()].find((edge) => edge.id !== "free" && edge.id !== "mixed" && edge.source.kind === "point" && edge.target.kind === "point")!
    expect(freeCopy).toMatchObject({ source: { kind: "point", point: { x: 100, y: 50 } }, target: { kind: "point", point: { x: 200, y: 50 } }, points: [{ x: 150, y: 70 }] })
    const mixedCopy = [...engine.getScene().entities.edgesById.values()].find((edge) => edge.id !== "free" && edge.id !== "mixed" && edge.source.kind === "port")!
    expect(mixedCopy).toMatchObject({ source: { kind: "port", portId: expect.not.stringMatching(/^host-port$/) }, target: { kind: "point", point: { x: 300, y: 80 } }, points: [{ x: 350, y: 75 }] })
    expect(engine.getGeometrySnapshot(mixedCopy.id)?.path?.[0]).toEqual(engine.getGeometrySnapshot(mixedCopy.source.kind === "port" ? mixedCopy.source.portId : "")?.point)

    const zeroOffset = createDiagramEngine(initial)
    zeroOffset.dispatch({ type: "setSelection", selection: { ids: ["host", "free", "mixed"], primaryId: "free" } })
    const zeroClipboard = zeroOffset.exportSelection()
    zeroOffset.importClipboard(zeroClipboard, { x: 0, y: 0 })
    const zeroCopy = [...zeroOffset.getScene().entities.edgesById.values()].find((edge) => edge.id !== "free" && edge.id !== "mixed" && edge.source.kind === "point")!
    expect(zeroCopy).toMatchObject({ source: { point: { x: 0, y: 0 } }, target: { point: { x: 100, y: 0 } }, points: [{ x: 50, y: 20 }] })
  })

  it("rejects nested and invalid groups at scene boundaries and supports groups in transact", () => {
    const invalid = { shapes: [{ id: "s", kind: "shape" as const, shape: "rect", x: 0, y: 0, width: 10, height: 10 }], groups: [{ id: "g", kind: "group" as const, childIds: ["s", "missing"] }] }
    expect(() => createDiagramEngine(invalid)).toThrow(/Invalid group/)
    const engine = createDiagramEngine()
    engine.transact(() => ({
      shapes: [...invalid.shapes, { id: "s2", kind: "shape" as const, shape: "rect", x: 20, y: 0, width: 10, height: 10 }],
      groups: [{ id: "g", kind: "group" as const, childIds: ["s", "s2"] }],
    }))
    expect(engine.getScene().entities.groupsById.has("g")).toBe(true)
    expect(() => deserializeScene({ ...engine.serialize(), groups: [{ id: "nested", kind: "group", childIds: ["g", "s"] }] })).toThrow(/nested/)
  })

  it("does not partially delete a group when a dependent port is protected", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["p1"] },
        { id: "n2", kind: "node", x: 40, y: 0, width: 20, height: 20 },
      ],
      ports: [{ id: "p1", kind: "port", nodeId: "n1", x: 20, y: 10, metadata: { locked: true } }],
    })
    engine.dispatch({ type: "groupEntities", id: "g", ids: ["n1", "n2"] })
    const before = engine.getScene()
    expect(engine.dispatch({ type: "deleteSelection" }).changed).toBe(false)
    expect(engine.getScene()).toBe(before)
    expect(engine.getScene().entities.groupsById.has("g")).toBe(true)
    expect(engine.getScene().entities.portsById.has("p1")).toBe(true)
  })

  it("applies graph batches atomically with one undo entry and document revision guard", () => {
    const engine = createDiagramEngine()
    const initialRevision = engine.getDocumentRevision()
    const result = engine.dispatchBatch([
      { type: "createNode", node: { id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20 } },
      { type: "createPort", port: { id: "p1", kind: "port", nodeId: "n1", x: 20, y: 10 } },
      { type: "createEdge", edge: { id: "e1", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "point", point: { x: 50, y: 10 } } } },
    ], { expectedRevision: initialRevision })
    expect(result.ok).toBe(true)
    expect(engine.canUndo()).toBe(true)
    expect(engine.getScene().entities.edgesById.has("e1")).toBe(true)
    expect(engine.getScene().entities.nodesById.get("n1")?.portIds).toContain("p1")
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.has("n1")).toBe(false)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.has("e1")).toBe(true)
  })

  it("previews command batches without publishing or changing revisions and history", () => {
    const engine = createDiagramEngine()
    let publications = 0
    const subscription = engine.subscribe(() => { publications += 1 })
    const publicationCount = publications
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    const commands = [
      { type: "createNode", node: { id: "preview-node", kind: "node", x: 0, y: 0, width: 20, height: 20 } },
      { type: "createPort", port: { id: "preview-port", kind: "port", nodeId: "preview-node", x: 20, y: 10 } },
    ] as const
    const preview = engine.previewBatch(commands, { expectedRevision: revision })
    expect(preview).toMatchObject({ ok: true, changed: true, documentRevision: revision, affectedIds: ["preview-node", "preview-port"] })
    expect(preview.scene?.nodes).toHaveLength(1)
    expect(preview.scene?.ports).toHaveLength(1)
    expect(engine.getScene().entities.nodesById.size).toBe(0)
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
    expect(publications).toBe(publicationCount)
    const rejected = engine.previewBatch([...commands, { type: "createPort", port: { id: "bad", kind: "port", nodeId: "missing", x: 0, y: 0 } } as const])
    expect(rejected).toMatchObject({ ok: false, failedCommandIndex: 2, reason: "invalid-command" })
    expect(publications).toBe(publicationCount)
    subscription.unsubscribe()
  })

  it("makes caller-identified batches idempotent and rejects reused IDs with different content", () => {
    const engine = createDiagramEngine()
    const commands = [{ type: "createNode", node: { id: "once", kind: "node", x: 0, y: 0, width: 20, height: 20 } }] as const
    const first = engine.dispatchBatch(commands, { operationId: "request-42" })
    const duplicate = engine.dispatchBatch(commands, { operationId: "request-42" })
    expect(duplicate).toEqual(first)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    const conflict = engine.dispatchBatch([{ type: "createNode", node: { id: "other", kind: "node", x: 0, y: 0, width: 20, height: 20 } }], { operationId: "request-42" })
    expect(conflict).toMatchObject({ ok: false, reason: "operation-id-conflict" })
    expect(engine.getScene().entities.nodesById.has("other")).toBe(false)
  })

  it("rejects a batch without publishing or changing redo, and does not conflict on viewport changes", () => {
    const engine = createDiagramEngine()
    engine.dispatch({ type: "createNode", node: { id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20 } })
    engine.dispatch({ type: "undo" })
    const before = engine.getScene()
    let publications = 0
    const subscription = engine.subscribe(() => { publications += 1 })
    const beforePublications = publications
    const rejected = engine.dispatchBatch([
      { type: "createNode", node: { id: "n2", kind: "node", x: 0, y: 0, width: 10, height: 10 } },
      { type: "createEdge", edge: { id: "bad", kind: "edge", source: { kind: "node", nodeId: "missing" }, target: { kind: "point", point: { x: 0, y: 0 } } } },
    ])
    expect(rejected).toMatchObject({ ok: false, failedCommandIndex: 1, reason: "invalid-command" })
    expect(engine.getScene()).toBe(before)
    expect(publications).toBe(beforePublications)
    expect(engine.canRedo()).toBe(true)
    const documentRevision = engine.getDocumentRevision()
    engine.dispatch({ type: "setViewport", viewport: { x: 10 } })
    expect(engine.dispatchBatch([{ type: "createNode", node: { id: "n3", kind: "node", x: 0, y: 0, width: 10, height: 10 } }], { expectedRevision: documentRevision }).ok).toBe(true)
    subscription.unsubscribe()
  })

  it("reconnects endpoints and restores deletion render order through repeated history cycles", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }],
      ports: [{ id: "p", kind: "port", nodeId: "n", x: 20, y: 10 }],
      edges: [{ id: "e", kind: "edge", source: { kind: "port", portId: "p" }, target: { kind: "point", point: { x: 50, y: 10 } }, points: [{ x: 35, y: 10 }] }],
      shapes: [{ id: "s", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }],
    })
    const order = engine.getRenderOrder({ includePorts: true })
    engine.dispatch({ type: "reconnectEdgeEndpoint", id: "e", endpoint: "target", connection: { kind: "node", nodeId: "n" } })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("e")?.target).toEqual({ kind: "point", point: { x: 50, y: 10 } })
    engine.dispatch({ type: "deleteEntities", ids: ["n"] })
    engine.dispatch({ type: "undo" })
    expect(engine.getRenderOrder({ includePorts: true })).toEqual(order)
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "undo" })
    expect(engine.getRenderOrder({ includePorts: true })).toEqual(order)
  })

  it("removes a port from its owner and restores the graph consistently", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["p"] }],
      ports: [{ id: "p", kind: "port", nodeId: "n", x: 20, y: 10 }],
      edges: [{ id: "e", kind: "edge", source: { kind: "port", portId: "p" }, target: { kind: "point", point: { x: 50, y: 10 } } }],
    })
    engine.dispatch({ type: "deleteEntities", ids: ["p"] })
    expect(engine.getScene().entities.portsById.has("p")).toBe(false)
    expect(engine.getScene().entities.edgesById.has("e")).toBe(false)
    expect(engine.getScene().entities.nodesById.get("n")?.portIds).toEqual([])
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.portsById.has("p")).toBe(true)
    expect(engine.getScene().entities.edgesById.has("e")).toBe(true)
    expect(engine.getScene().entities.nodesById.get("n")?.portIds).toEqual(["p"])
  })

  it("anchors ports to line vertices, transformed shapes, and groups with stable point geometry", () => {
    const engine = createDiagramEngine({
      shapes: [
        { id: "line", kind: "shape", shape: "line", x: 0, y: 0, width: 80, height: 0 },
        { id: "path", kind: "shape", shape: "line", x: 100, y: 30, width: 80, height: 30, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 30 }] },
        { id: "transformed", kind: "shape", shape: "rect", x: 250, y: 0, width: 40, height: 20, rotation: 90, flipX: true },
        { id: "g-a", kind: "shape", shape: "rect", x: 350, y: 0, width: 20, height: 20 },
        { id: "g-b", kind: "shape", shape: "rect", x: 380, y: 0, width: 20, height: 20 },
      ],
      groups: [{ id: "group", kind: "group", childIds: ["g-a", "g-b"] }],
      ports: [
        { id: "line-start", kind: "port", hostId: "line", anchor: { kind: "vertex", index: 0 } },
        { id: "path-bend", kind: "port", hostId: "path", anchor: { kind: "vertex", index: 1 } },
        { id: "rotated-point", kind: "port", hostId: "transformed", anchor: { kind: "local", x: 0, y: 5 } },
        { id: "group-point", kind: "port", hostId: "group", anchor: { kind: "local", x: 10, y: 5 } },
      ],
    })
    expect(engine.getGeometrySnapshot("line-start")).toMatchObject({ point: { x: 0, y: 0 }, hostId: "line", anchor: { kind: "vertex", index: 0 } })
    expect(engine.getGeometrySnapshot("path-bend")?.point).toEqual({ x: 140, y: 30 })
    expect(engine.getGeometrySnapshot("rotated-point")?.point).toEqual({ x: 275, y: 30 })
    expect(engine.getGeometrySnapshot("group-point")?.point).toEqual({ x: 360, y: 5 })
    expect(() => createDiagramEngine({ shapes: [{ id: "s", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }], ports: [{ id: "dangling", kind: "port", hostId: "missing", anchor: { kind: "local", x: 0, y: 0 } }] })).toThrow(/Invalid port anchor/)
    expect(() => createDiagramEngine({ shapes: [{ id: "s", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }], ports: [{ id: "outside", kind: "port", hostId: "s", anchor: { kind: "local", x: 21, y: 0 } }] })).toThrow(/Invalid port anchor/)
    expect(engine.dispatch({ type: "createPort", port: { id: "bad-index", kind: "port", hostId: "path", anchor: { kind: "vertex", index: 3 } } }).changed).toBe(false)
  })

  it("anchors ports to nodes, text, and tables and resolves attached edge geometry", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "node", kind: "node", x: 0, y: 0, width: 20, height: 10 }],
      texts: [{ id: "label", kind: "text", x: 40, y: 0, width: 30, height: 12, text: "x" }],
      tables: [{ id: "table", kind: "table", x: 90, y: 0, width: 40, height: 20, rowCount: 1, columnCount: 1 }],
      ports: [
        { id: "node-anchor", kind: "port", hostId: "node", anchor: { kind: "local", x: 20, y: 5 } },
        { id: "text-anchor", kind: "port", hostId: "label", anchor: { kind: "local", x: 30, y: 6 } },
        { id: "table-anchor", kind: "port", hostId: "table", anchor: { kind: "local", x: 40, y: 10 } },
      ],
      edges: [{ id: "wire", kind: "edge", source: { kind: "port", portId: "table-anchor" }, target: { kind: "port", portId: "node-anchor" } }],
    })
    expect(engine.getGeometrySnapshot("node-anchor")?.point).toEqual({ x: 20, y: 5 })
    expect(engine.getGeometrySnapshot("text-anchor")?.point).toEqual({ x: 70, y: 6 })
    expect(engine.getGeometrySnapshot("table-anchor")?.point).toEqual({ x: 130, y: 10 })
    expect(engine.getGeometrySnapshot("wire")?.path).toEqual([{ x: 130, y: 10 }, { x: 20, y: 5 }])
    expect(engine.dispatch({ type: "createPort", port: { id: "invalid", kind: "port", hostId: "table", anchor: { kind: "local", x: Number.NaN, y: 0 } } }).changed).toBe(false)
  })

  it("places ports on the topmost host and commits the exact preview as one undoable change", () => {
    const engine = createDiagramEngine({ shapes: [
      { id: "back", kind: "shape", shape: "rect", x: 0, y: 0, width: 100, height: 80 },
      { id: "front", kind: "shape", shape: "rect", x: 20, y: 10, width: 80, height: 60, metadata: { zIndex: 2 } },
    ] })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { snap: { tolerancePx: 8 }, scheduleFrame: (callback) => frames.push(callback) })
    expect(interaction.beginPortCreation("p1", { id: 1, point: { x: 40, y: 30 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 55, y: 35 } })
    frames.shift()?.()
    const preview = interaction.getSnapshot().portCreationPreview!
    expect(preview).toMatchObject({ id: "p1", hostId: "front", anchor: { kind: "local", x: 35, y: 25 }, point: { x: 55, y: 35 } })
    const before = engine.serialize()
    const depth = engine.getDiagnostics().undoDepth
    interaction.pointerDown({ id: 1, point: { x: 55, y: 35 } })
    interaction.pointerUp({ id: 1, point: { x: 55, y: 35 } })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ hostId: preview.hostId, anchor: preview.anchor })
    expect(engine.getGeometrySnapshot("p1")?.point).toEqual(preview.point)
    expect(engine.getDiagnostics().undoDepth).toBe(depth + 1)
    expect(engine.serialize()).not.toEqual(before)
    expect(interaction.getSnapshot().tool).toBe("create-port")
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.portsById.has("p1")).toBe(false)
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("p1")?.point).toEqual(preview.point)
  })

  it("snaps port placement to path vertices within screen tolerance and projects onto distant segments", () => {
    const engine = createDiagramEngine({
      shapes: [{ id: "path", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 0, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] }],
      viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 2 },
    })
    const interaction = createDiagramInteractionController(engine, { snap: { tolerancePx: 6 } })
    expect(interaction.beginPortCreation("vertex-port", { id: 1, point: { x: 52, y: 2 } })).toBe(true)
    expect(interaction.getSnapshot().portCreationPreview).toMatchObject({ hostId: "path", anchor: { kind: "vertex", index: 1 }, point: { x: 50, y: 0 }, snapResult: { source: "endpoint", snapped: true } })
    interaction.cancel()
    expect(interaction.beginPortCreation("segment-port", { id: 2, point: { x: 70, y: 2 } })).toBe(true)
    expect(interaction.getSnapshot().portCreationPreview).toMatchObject({ hostId: "path", anchor: { kind: "local", x: 70, y: 0 }, point: { x: 70, y: 0 }, snapResult: { source: "nearest" } })
    interaction.pointerDown({ id: 2, point: { x: 70, y: 2 } })
    interaction.pointerUp({ id: 2, point: { x: 70, y: 2 } })
    expect(engine.getGeometrySnapshot("segment-port")?.point).toEqual({ x: 70, y: 0 })
  })

  it("resolves transformed local anchors identically in preview and committed state", () => {
    const engine = createDiagramEngine({
      shapes: [{ id: "rotated", kind: "shape", shape: "rect", x: 100, y: 100, width: 80, height: 40, rotation: 90, flipX: true }],
      viewport: { x: 50, y: 70, width: 300, height: 200, zoom: 0.5 },
    })
    const interaction = createDiagramInteractionController(engine, { viewportConstraints: { bounds: { x: 0, y: 0, width: 400, height: 300 }, margin: 20 } })
    expect(interaction.beginPortCreation("rotated-port", { id: 1, point: { x: 150, y: 140 } }, { hostId: "rotated" })).toBe(true)
    const preview = interaction.getSnapshot().portCreationPreview!
    expect(preview).toMatchObject({ hostId: "rotated", anchor: { kind: "local", x: 20, y: 10 }, point: { x: 150, y: 140 } })
    interaction.pointerDown({ id: 1, point: { x: 150, y: 140 } })
    interaction.pointerUp({ id: 1, point: { x: 150, y: 140 } })
    expect(engine.getGeometrySnapshot("rotated-port")?.point).toEqual(preview.point)
    expect(engine.getScene().entities.portsById.get("rotated-port")).toMatchObject({ anchor: preview.anchor })
  })

  it("cancels port previews on pointer cancellation, explicit cancellation, host removal, and tool changes", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "s", kind: "shape", shape: "rect", x: 0, y: 0, width: 40, height: 40 }] })
    const interaction = createDiagramInteractionController(engine)
    const serialized = engine.serialize()
    const depth = engine.getDiagnostics().undoDepth
    interaction.beginPortCreation("cancelled", { id: 1, point: { x: 10, y: 10 } })
    interaction.pointerDown({ id: 1, point: { x: 10, y: 10 } })
    interaction.cancel()
    expect(engine.getScene().entities.portsById.has("cancelled")).toBe(false)
    expect(engine.serialize()).toEqual(serialized)
    interaction.beginPortCreation("cancelled-2", { id: 2, point: { x: 10, y: 10 } })
    interaction.cancel()
    expect(interaction.getSnapshot().portCreationPreview).toBeNull()
    expect(engine.serialize()).toEqual(serialized)
    expect(engine.getDiagnostics().undoDepth).toBe(depth)
    interaction.beginPortCreation("cancelled-3", { id: 3, point: { x: 10, y: 10 } })
    interaction.pointerDown({ id: 3, point: { x: 10, y: 10 } })
    engine.dispatch({ type: "deleteEntities", ids: ["s"] })
    interaction.pointerUp({ id: 3, point: { x: 10, y: 10 } })
    expect(engine.getScene().entities.portsById.has("cancelled-3")).toBe(false)
    expect(interaction.getSnapshot().portCreationPreview).toBeNull()
    interaction.beginPortCreation("cancelled-4", { id: 4, point: { x: 10, y: 10 } })
    interaction.setTool("select")
    expect(interaction.getSnapshot().portCreationPreview).toBeNull()
  })

  it("updates vertex port indexes on insertion and rejects removal of an anchored vertex", () => {
    const engine = createDiagramEngine({
      shapes: [{ id: "path", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 0, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }] }],
      ports: [{ id: "middle", kind: "port", hostId: "path", anchor: { kind: "vertex", index: 1 } }],
    })
    const original = engine.getGeometrySnapshot("middle")?.point
    expect(engine.dispatch({ type: "insertPathVertex", id: "path", index: 1, point: { x: 25, y: 10 } }).changed).toBe(true)
    expect(engine.getScene().entities.portsById.get("middle")).toMatchObject({ anchor: { kind: "vertex", index: 2 } })
    expect(engine.getGeometrySnapshot("middle")?.point).toEqual(original)
    expect(engine.dispatch({ type: "removePathVertex", id: "path", index: 2 }).changed).toBe(false)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.portsById.get("middle")).toMatchObject({ anchor: { kind: "vertex", index: 1 } })
    expect(engine.getGeometrySnapshot("middle")?.point).toEqual(original)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.portsById.get("middle")).toMatchObject({ anchor: { kind: "vertex", index: 2 } })
  })

  it("keeps anchored edge ports attached through host move, resize, rotation, flip, and undo", () => {
    const engine = createDiagramEngine({
      shapes: [{ id: "contact", kind: "shape", shape: "rect", x: 10, y: 20, width: 80, height: 40 }],
      ports: [{ id: "terminal", kind: "port", hostId: "contact", anchor: { kind: "local", x: 80, y: 20 } }],
      edges: [{ id: "wire", kind: "edge", source: { kind: "port", portId: "terminal" }, target: { kind: "point", point: { x: 160, y: 40 } } }],
    })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => frames.push(callback) })
    expect(interaction.beginResizeHandle("contact", "se", { id: 1, point: { x: 90, y: 60 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 110, y: 70 } })
    frames.shift()?.()
    const preview = interaction.getPreviewGeometry("terminal")?.point
    expect(preview).toEqual({ x: 110, y: 45 })
    interaction.pointerUp({ id: 1, point: { x: 110, y: 70 } })
    expect(engine.getGeometrySnapshot("terminal")?.point).toEqual(preview)
    expect(engine.getGeometrySnapshot("wire")?.path?.[0]).toEqual(preview)
    engine.dispatch({ type: "moveEntities", ids: ["contact"], delta: { x: 5, y: 7 } })
    expect(engine.getGeometrySnapshot("wire")?.path?.[0]).toEqual({ x: 115, y: 52 })
    engine.dispatch({ type: "rotateEntities", entries: [{ id: "contact", rotation: 90 }] })
    const rotatedPoint = engine.getGeometrySnapshot("terminal")?.point
    expect(engine.getGeometrySnapshot("wire")?.path?.[0]).toEqual(rotatedPoint)
    engine.dispatch({ type: "flipEntities", ids: ["contact"], axis: "horizontal" })
    const flippedPoint = engine.getGeometrySnapshot("terminal")?.point
    expect(engine.getGeometrySnapshot("wire")?.path?.[0]).toEqual(flippedPoint)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("terminal")?.point).toEqual(rotatedPoint)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("terminal")?.point).toEqual({ x: 115, y: 52 })
  })

  it("requires explicit atomic remaps for group-host ports and preserves their identity through paste and history", () => {
    const engine = createDiagramEngine({
      shapes: [
        { id: "a", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 },
        { id: "b", kind: "shape", shape: "rect", x: 40, y: 0, width: 20, height: 20 },
      ],
      groups: [{ id: "g", kind: "group", childIds: ["a", "b"] }],
      ports: [{ id: "gp", kind: "port", hostId: "g", anchor: { kind: "local", x: 20, y: 10 } }],
      edges: [{ id: "wire", kind: "edge", source: { kind: "port", portId: "gp" }, target: { kind: "point", point: { x: 100, y: 10 } } }],
    })
    const history = engine.getDiagnostics().undoDepth
    expect(engine.dispatch({ type: "ungroupEntities", ids: ["g"] }).changed).toBe(false)
    expect(engine.getDiagnostics().undoDepth).toBe(history)
    expect(engine.dispatch({ type: "ungroupEntities", ids: ["g"], portRemaps: { gp: { hostId: "a", anchor: { kind: "local", x: 20, y: 10 } } } }).changed).toBe(true)
    expect(engine.getScene().entities.portsById.get("gp")).toMatchObject({ hostId: "a", anchor: { kind: "local", x: 20, y: 10 } })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.portsById.get("gp")).toMatchObject({ hostId: "g", anchor: { kind: "local", x: 20, y: 10 } })
    const restored = createDiagramEngine(deserializeDiagramDocument(engine.serializeDocument()))
    expect(restored.getGeometrySnapshot("wire")?.path?.[0]).toEqual(engine.getGeometrySnapshot("gp")?.point)
    engine.dispatch({ type: "setSelection", selection: { ids: ["g"], primaryId: "g" } })
    const clipboard = engine.exportSelection()
    engine.importClipboard(clipboard)
    const pastedPort = [...engine.getScene().entities.portsById.values()].find((port) => port.id !== "gp")!
    const pastedWire = [...engine.getScene().entities.edgesById.values()].find((edge) => edge.id !== "wire")!
    expect(pastedPort.id).not.toBe("gp")
    expect("hostId" in pastedPort && pastedPort.hostId).not.toBe("g")
    expect(pastedWire.source).toEqual({ kind: "port", portId: pastedPort.id })
    expect(engine.getGeometrySnapshot(pastedWire.id)?.path?.[0]).toEqual(engine.getGeometrySnapshot(pastedPort.id)?.point)
  })

  it("round-trips versioned diagram content independently from view state", () => {
    const engine = createDiagramEngine(scene)
    const document = engine.serializeDocument({ includeView: false })
    expect(document).toMatchObject({ format: "affino-diagram", version: 1 })
    expect(document.view).toBeUndefined()
    const restored = createDiagramEngine(deserializeDiagramDocument(document))
    expect(restored.serialize()).toMatchObject({
      nodes: scene.nodes,
      edges: scene.edges,
      ports: scene.ports,
      texts: scene.texts,
      shapes: scene.shapes,
    })
    expect(() => deserializeDiagramDocument({ ...document, version: 2 } as never)).toThrow(/Unsupported/)
  })

  it("runs the public headless graph editing workflow through document reload", () => {
    const engine = createDiagramEngine()
    const batch = engine.dispatchBatch([
      { type: "createNode", node: { id: "a", kind: "node", x: 0, y: 0, width: 30, height: 30 } },
      { type: "createPort", port: { id: "ap", kind: "port", nodeId: "a", x: 30, y: 15 } },
      { type: "createNode", node: { id: "b", kind: "node", x: 100, y: 0, width: 30, height: 30 } },
      { type: "createPort", port: { id: "bp", kind: "port", nodeId: "b", x: 0, y: 15 } },
      { type: "createEdge", edge: { id: "ab", kind: "edge", source: { kind: "port", portId: "ap" }, target: { kind: "port", portId: "bp" }, points: [{ x: 65, y: 15 }] } },
    ])
    expect(batch.ok).toBe(true)
    engine.dispatch({ type: "moveNode", id: "a", delta: { x: 10, y: 5 } })
    engine.dispatch({ type: "reconnectEdgeEndpoint", id: "ab", endpoint: "target", connection: { kind: "point", point: { x: 160, y: 40 } } })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("ab")?.target).toEqual({ kind: "port", portId: "bp" })
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "deleteEntities", ids: ["b"] })
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "undo" })
    const restored = createDiagramEngine(deserializeDiagramDocument(engine.serializeDocument()))
    expect(restored.getScene().entities.nodesById.has("a")).toBe(true)
    expect(restored.getScene().entities.edgesById.get("ab")?.points).toEqual([{ x: 65, y: 15 }])
    expect(restored.getScene().entities.portsById.has("bp")).toBe(true)
  })

  it("keeps fit idempotent when ResizeObserver reports CSS pixels", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 1000, height: 600, zoom: 1 } })
    engine.fitBounds({ x: 0, y: 0, width: 400, height: 200 }, 0)
    const fitted = engine.getScene().viewport
    engine.dispatch({ type: "setViewport", viewport: { width: fitted.width, height: fitted.height } })
    engine.fitBounds({ x: 0, y: 0, width: 400, height: 200 }, 0)
    expect(engine.getScene().viewport).toEqual(fitted)
  })

  it("round-trips screen/world coordinates and preserves the zoom focus", () => {
    const viewport = { x: -20, y: 30, width: 400, height: 240, zoom: 2.5 }
    const world = { x: 42, y: 71 }
    expect(worldToScreen(viewport, screenToWorld(viewport, { x: 155, y: 90 }))).toEqual({ x: 155, y: 90 })
    const zoomed = zoomViewportAt(viewport, 1, { x: 155, y: 90 })
    expect(screenToWorld(zoomed, { x: 155, y: 90 })).toEqual(screenToWorld(viewport, { x: 155, y: 90 }))
    expect(worldToScreen(viewport, world)).toEqual({ x: 155, y: 102.5 })
  })

  it("clamps viewport to all world bounds, keeps zoom results bounded, and centers oversized views", () => {
    const constraints = { bounds: { x: 10, y: 20, width: 100, height: 80 }, margin: 5 }
    const base = { x: 50, y: 50, width: 40, height: 30, zoom: 1 }
    expect(clampViewportToBounds({ ...base, x: -500 }, constraints).x).toBe(5)
    expect(clampViewportToBounds({ ...base, x: 500 }, constraints).x).toBe(75)
    expect(clampViewportToBounds({ ...base, y: -500 }, constraints).y).toBe(15)
    expect(clampViewportToBounds({ ...base, y: 500 }, constraints).y).toBe(75)
    const zoomed = zoomViewportAt({ ...base, x: 500, y: 500 }, 2, { x: 0, y: 0 })
    expect(clampViewportToBounds(zoomed, constraints)).toMatchObject({ x: 75, y: 75, zoom: 2 })
    expect(clampViewportToBounds({ ...base, width: 200, height: 180 }, constraints)).toMatchObject({ x: -40, y: -30 })
  })

  it("uses the same bounded pan delta for preview and viewport commit", () => {
    const constraints = { bounds: { x: 0, y: 0, width: 100, height: 80 }, margin: 10 }
    const runPan = (pointerDelta: DiagramPoint, expected: DiagramPoint) => {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 40, height: 30, zoom: 1 } })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), viewportConstraints: constraints })
      controller.setTool("pan")
      controller.pointerDown({ id: 1, point: { x: 0, y: 0 } })
      controller.pointerMove({ id: 1, point: pointerDelta })
      callbacks.shift()?.()
      const previewDelta = controller.getSnapshot().previewDelta!
      const current = engine.getScene().viewport
      expect({ x: current.x - previewDelta.x, y: current.y - previewDelta.y }).toEqual(expected)
      controller.pointerUp({ id: 1, point: pointerDelta })
      expect(engine.getScene().viewport).toMatchObject(expected)
    }
    runPan({ x: 100, y: 100 }, { x: -10, y: -10 })
    runPan({ x: -100, y: -100 }, { x: 70, y: 60 })
  })

  it("keeps viewport updates out of undo history and preserves the redo branch", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }],
      viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 1 },
    })
    engine.dispatch({ type: "moveNode", id: "n", delta: { x: 12, y: 4 }, historyKey: "move:n" })
    engine.dispatch({ type: "moveNode", id: "n", delta: { x: 8, y: 6 }, historyKey: "move:n" })
    expect(engine.getDiagnostics().undoDepth).toBe(1)

    engine.dispatch({ type: "setViewport", viewport: { x: 10 } })
    engine.dispatch({ type: "setViewport", viewport: { x: 20, zoom: 2 } })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 0, y: 0 })
    expect(engine.getScene().viewport).toMatchObject({ x: 20, zoom: 2 })

    const undoDepth = engine.getDiagnostics().undoDepth
    const redoDepth = engine.getDiagnostics().redoDepth
    engine.dispatch({ type: "setViewport", viewport: { x: 35, zoom: 1.5 } })
    engine.dispatch({ type: "setViewport", viewport: { y: 15 } })
    expect(engine.getDiagnostics()).toMatchObject({ undoDepth, redoDepth })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 20, y: 10 })
    expect(engine.getScene().viewport).toMatchObject({ x: 35, y: 15, zoom: 1.5 })
    expect(engine.serialize().viewport).toMatchObject({ x: 35, y: 15, zoom: 1.5 })
  })

  it("keeps pan and fit operations out of undo and redo history", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 20, y: 30, width: 40, height: 20 }],
      viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 1 },
    })
    engine.dispatch({ type: "moveNode", id: "n", delta: { x: 10, y: 0 } })
    engine.dispatch({ type: "undo" })
    expect(engine.canRedo()).toBe(true)
    const depths = { undoDepth: engine.getDiagnostics().undoDepth, redoDepth: engine.getDiagnostics().redoDepth }

    const controller = createDiagramInteractionController(engine)
    controller.setTool("pan")
    controller.pointerDown({ id: 1, point: { x: 0, y: 0 } })
    controller.pointerMove({ id: 1, point: { x: 25, y: 10 } })
    controller.pointerUp({ id: 1, point: { x: 25, y: 10 } })
    engine.fitBounds({ x: 0, y: 0, width: 100, height: 80 })
    engine.dispatch({ type: "setSelection", selection: { ids: ["n"], primaryId: "n" } })
    engine.fitSelection()
    engine.fitScene()

    expect(engine.getDiagnostics()).toMatchObject(depths)
    expect(engine.canRedo()).toBe(true)
    const viewport = engine.getScene().viewport
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n")?.x).toBe(30)
    expect(engine.getScene().viewport).toEqual(viewport)
  })

  it("keeps viewport commands in mixed batches out of the document history patch", () => {
    const engine = createDiagramEngine({ nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }] })
    engine.dispatch({ type: "moveNode", id: "n", delta: { x: 10, y: 0 } })
    engine.dispatch({ type: "undo" })

    const batch = engine.dispatchBatch([
      { type: "setViewport", viewport: { x: 45, zoom: 1.25 } },
      { type: "moveNode", id: "n", delta: { x: 5, y: 0 } },
    ])
    expect(batch.ok).toBe(true)
    expect(engine.getDiagnostics()).toMatchObject({ undoDepth: 1, redoDepth: 0 })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n")?.x).toBe(0)
    expect(engine.getScene().viewport).toMatchObject({ x: 45, zoom: 1.25 })
  })

  it("preserves CSS size when fitting at common zoom levels", () => {
    for (const zoom of [0.25, 1, 2.5]) {
      const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 1000, height: 600, zoom } })
      engine.fitBounds({ x: 0, y: 0, width: 400, height: 200 }, 0)
      const viewport = engine.getScene().viewport
      expect(viewport.width * viewport.zoom).toBeCloseTo(1000 * zoom)
      expect(viewport.height * viewport.zoom).toBeCloseTo(600 * zoom)
    }
  })

  it("never produces non-finite fit values for empty or degenerate bounds", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 1000, height: 600, zoom: 1 } })
    engine.fitBounds({ x: 10, y: 20, width: 0, height: 0 }, 0)
    expect(Object.values(engine.getScene().viewport).every(Number.isFinite)).toBe(true)
    engine.fitBounds({ x: 10, y: 20, width: Number.NaN, height: Number.POSITIVE_INFINITY }, 0)
    expect(Object.values(engine.getScene().viewport).every(Number.isFinite)).toBe(true)
  })

  it("creates immutable snapshots and roundtrips serialization", () => {
    const engine = createDiagramEngine(scene)
    const snapshot = engine.getScene()

    expect(snapshot.entities.nodesById.get("n1")?.x).toBe(0)
    expect(Object.isFrozen(snapshot.order.nodeIds)).toBe(true)
    expect(() => {
      ;(snapshot.entities.nodesById as Map<string, unknown>).set("mutated", {})
    }).toThrow(TypeError)
    expect(() => {
      ;(snapshot.entities.nodesById.get("n1") as { x: number }).x = 999
    }).toThrow(TypeError)

    const roundtrip = createDiagramEngine(deserializeScene(serializeScene(snapshot))).serialize()

    expect(roundtrip.nodes.map((node) => node.id)).toEqual(["n1", "n2"])
    expect(roundtrip.edges.map((edge) => edge.id)).toEqual(["e1"])
  })

  it("shares unchanged entity snapshots across publications", () => {
    const engine = createDiagramEngine(scene)
    const before = engine.getScene()

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 5 } })

    const after = engine.getScene()
    expect(after.entities.nodesById.get("n1")).not.toBe(before.entities.nodesById.get("n1"))
    expect(after.entities.nodesById.get("n2")).toBe(before.entities.nodesById.get("n2"))
    expect(after.entities.edgesById).toBe(before.entities.edgesById)
    expect(after.entities.edgesById.get("e1")).toBe(before.entities.edgesById.get("e1"))
  })

  it("keeps caller-held snapshots valid across delete, undo, and replacement", () => {
    const engine = createDiagramEngine(scene)
    const before = engine.getScene()

    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    engine.dispatch({ type: "deleteSelection" })
    expect(engine.getScene().entities.nodesById.has("n1")).toBe(false)
    expect(before.entities.nodesById.get("n1")?.x).toBe(0)
    expect(before.entities.edgesById.get("e1")?.source).toEqual({ kind: "port", portId: "p1" })

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
    expect(before.entities.nodesById.get("n1")?.x).toBe(0)

    engine.transact(() => ({ nodes: [{ id: "replacement", kind: "node", x: 90, y: 10, width: 20, height: 20 }] }))
    expect(engine.getScene().entities.nodesById.has("replacement")).toBe(true)
    expect(before.entities.nodesById.has("replacement")).toBe(false)
    expect(before.entities.nodesById.get("n1")?.x).toBe(0)
  })

  it("owns input entities and invalidates an empty replacement", () => {
    const input = { id: "n1", kind: "node" as const, x: 0, y: 0, width: 20, height: 20 }
    const engine = createDiagramEngine({ nodes: [input] })
    input.x = 500
    engine.dispatch({ type: "setViewport", viewport: { x: 10 } })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)

    const revision = engine.getScene().revision
    const result = engine.transact(() => ({ nodes: [] }))
    expect(result.changed).toBe(true)
    expect(engine.getScene().revision).toBe(revision + 1)
    expect(engine.queryEntities()).toEqual([])
  })

  it("publishes viewport updates without making them undoable and rejects locked text edits", () => {
    const engine = createDiagramEngine({
      texts: [{ id: "locked-text", kind: "text", x: 0, y: 0, text: "before", metadata: { locked: true } }],
    })
    const states: boolean[] = []
    engine.subscribe(() => states.push(engine.canUndo()))
    engine.dispatch({ type: "editText", id: "locked-text", text: "after" })
    expect(engine.getScene().entities.textsById.get("locked-text")?.text).toBe("before")

    engine.dispatch({ type: "setViewport", viewport: { x: 1 } })
    expect(states.at(-1)).toBe(false)
  })

  it("tracks changed ids and invalidates only dependent geometry", () => {
    const engine = createDiagramEngine(scene)
    engine.queryVisible({ x: -10, y: -10, width: 500, height: 200 })
    const readsBefore = engine.getGeometryReadCount()
    const n2Version = engine.getEntityVersion("n2")

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 5 } })

    expect(engine.getLastChange().changedIds).toEqual(new Set(["n1"]))
    expect(engine.getLastChange().invalidatedIds).toEqual(new Set(["n1", "p1", "e1"]))
    expect(() => {
      ;(engine.getLastChange().changedIds as Set<string>).add("mutated")
    }).toThrow(TypeError)
    expect(engine.getLastChange().changedIds).toEqual(new Set(["n1"]))
    expect(engine.getEntityVersion("n2")).toBe(n2Version)

    engine.queryVisible({ x: -10, y: -10, width: 500, height: 200 })
    expect(engine.getGeometryReadCount() - readsBefore).toBe(3)
  })

  it("matches indexed visibility and nearest-port queries with brute force", () => {
    const engine = createDiagramEngine(scene)
    const bounds = { x: -5, y: -5, width: 180, height: 160 }

    expect(engine.queryVisible(bounds)).toEqual(engine.queryVisibleBruteForce(bounds))
    expect(engine.nearestPort({ x: 102, y: 30 }, 12)).toEqual(engine.nearestPortBruteForce({ x: 102, y: 30 }, 12))
  })

  it("keeps indexed geometry equivalent to the brute-force oracle across mutations", () => {
    const engine = createDiagramEngine(scene)
    const bounds = [
      { x: -20, y: -20, width: 220, height: 180 },
      { x: 120, y: -20, width: 240, height: 180 },
      { x: -1_000, y: -1_000, width: 2_000, height: 2_000 },
    ]
    const points = [
      { point: { x: 50, y: 70 }, radius: 16 },
      { point: { x: 290, y: 30 }, radius: 24 },
      { point: { x: 1_000, y: 1_000 }, radius: 8 },
    ]
    const assertOracle = () => {
      for (const queryBounds of bounds) {
        expect(engine.queryVisible(queryBounds)).toEqual(engine.queryVisibleBruteForce(queryBounds))
      }
      for (const query of points) {
        expect(engine.nearestPort(query.point, query.radius)).toEqual(
          engine.nearestPortBruteForce(query.point, query.radius),
        )
      }
    }

    assertOracle()
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 34, y: 18 } })
    assertOracle()
    engine.dispatch({ type: "resizeEntities", entries: [{ id: "n2", width: 140, height: 84 }] })
    assertOracle()
    engine.dispatch({ type: "insertEdgeWaypoint", id: "e1", index: 0, point: { x: 160, y: 120 } })
    assertOracle()
    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    engine.dispatch({ type: "deleteSelection" })
    assertOracle()
    engine.dispatch({ type: "undo" })
    assertOracle()
  })

  it("falls back to bounded scanning for huge visibility bounds", () => {
    const engine = createDiagramEngine(scene)
    expect(engine.queryVisible({ x: -1e12, y: -1e12, width: 2e12, height: 2e12 })).toEqual(
      engine.queryVisibleBruteForce({ x: -1e12, y: -1e12, width: 2e12, height: 2e12 }),
    )
  })

  it("queries entities by kind, bounds, text, metadata, ports, and limit", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 60, portIds: ["p1"], metadata: { label: "Bay Alpha", tags: ["primary", "switchgear"], status: "energized" } },
        { id: "n2", kind: "node", x: 260, y: 0, width: 100, height: 60, metadata: { label: "Bay Beta", status: "offline" } },
      ],
      ports: [{ id: "p1", kind: "port", nodeId: "n1", x: 100, y: 30 }],
      texts: [{ id: "t1", kind: "text", x: 10, y: 84, width: 80, height: 20, text: "Alpha label" }],
      shapes: [{ id: "s1", kind: "shape", shape: "rect", x: 20, y: 140, width: 40, height: 30, metadata: { status: "energized" } }],
    })

    expect(engine.queryEntities({ kinds: ["node"], text: "alpha" })).toEqual(["n1"])
    expect(engine.queryEntities({ text: "alpha" })).toEqual(["n1", "t1"])
    expect(engine.queryEntities({ metadata: { status: "energized" } })).toEqual(["s1", "n1"])
    expect(engine.queryEntities({ metadata: { tags: "primary" } })).toEqual(["n1"])
    expect(engine.queryEntities({ bounds: { x: -1, y: -1, width: 120, height: 90 }, boundsMode: "contains" })).toEqual(["n1"])
    expect(engine.queryEntities({ kinds: ["port"] })).toEqual(["p1"])
    expect(engine.queryEntities({ limit: 0 })).toEqual([])
    expect(engine.queryEntities({ includePorts: true, limit: 2 })).toHaveLength(2)
    expect(engine.getDiagnostics().entityQueryCount).toBe(8)
  })

  it("hit-tests topmost text and precise edge paths", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 80 }],
      texts: [{ id: "t1", kind: "text", x: 10, y: 10, width: 60, height: 20, text: "Top" }],
      edges: [{ id: "e1", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 300, y: 300 } } }],
    })

    engine.dispatch({ type: "bringToFront", ids: ["t1"] })

    expect(engine.hitTest({ x: 20, y: 18 }, { radius: 2 })?.id).toBe("t1")
    expect(engine.hitTest({ x: 20, y: 280 }, { radius: 2 })?.id).not.toBe("e1")
    expect(engine.hitTest({ x: 150, y: 151 }, { radius: 2 })?.id).toBe("e1")
  })

  it("uses rotated geometry for bounds, ports, hit testing, and capabilities", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 40, rotation: 90, portIds: ["p1"] }],
      ports: [{ id: "p1", kind: "port", nodeId: "n1", x: 100, y: 20 }],
      texts: [{ id: "t1", kind: "text", x: 10, y: 10, width: 30, height: 12, text: "T", metadata: { readOnly: true } }],
    })

    const geometry = engine.getGeometrySnapshot("n1")
    expect(geometry?.rotation).toBe(90)
    expect(geometry?.bounds.width).toBeCloseTo(40)
    expect(geometry?.bounds.height).toBeCloseTo(100)
    expect(engine.getGeometrySnapshot("p1")?.point).toEqual({ x: 50, y: 70 })
    expect(engine.hitTest({ x: 50, y: 70 }, { radius: 1 })?.id).toBe("p1")
    expect(engine.hitTest({ x: 0, y: 0 }, { radius: 1 })?.id).not.toBe("n1")
    expect(engine.queryVisible({ x: 25, y: -30, width: 50, height: 100 })).toContain("n1")

    expect(engine.canRotate(["n1"])).toBe(true)
    expect(engine.canResize(["t1"])).toBe(false)
    expect(engine.canAlign(["n1", "t1"])).toBe(false)
    expect(engine.canEditText("t1")).toBe(false)
    expect(engine.canPaste({ nodes: [], edges: [], texts: [], shapes: [], ports: [], selection: { ids: [], primaryId: null }, viewport: { x: 0, y: 0, width: 1, height: 1, zoom: 1 } })).toBe(false)
  })

  it("supports command undo and redo without full snapshot replacement", () => {
    const engine = createDiagramEngine(scene)

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 20, y: 0 } })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(20)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)

    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(20)
  })

  it("undoes and redoes entity metadata in order with movement and serialization", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "switchgear", kind: "node", x: 0, y: 0, width: 100, height: 60, metadata: { type: "LV" } }],
    })
    const switchgear = () => engine.getScene().entities.nodesById.get("switchgear")!

    engine.dispatch({ type: "moveNode", id: "switchgear", delta: { x: 24, y: 0 } })
    engine.dispatch({ type: "setEntityMetadata", id: "switchgear", metadata: { type: "SLD" } })
    expect(switchgear().metadata?.type).toBe("SLD")
    expect(engine.serialize().nodes[0]?.metadata?.type).toBe("SLD")

    engine.dispatch({ type: "undo" })
    expect(switchgear().metadata?.type).toBe("LV")
    expect(switchgear().x).toBe(24)
    expect(engine.serialize().nodes[0]?.metadata?.type).toBe("LV")

    engine.dispatch({ type: "undo" })
    expect(switchgear().x).toBe(0)
    engine.dispatch({ type: "redo" })
    expect(switchgear().x).toBe(24)
    expect(switchgear().metadata?.type).toBe("LV")
    engine.dispatch({ type: "redo" })
    expect(switchgear().metadata?.type).toBe("SLD")
    expect(engine.serialize().nodes[0]).toMatchObject({ x: 24, metadata: { type: "SLD" } })
  })

  it("groups metadata updates and counts them toward the history limit", () => {
    const grouped = createDiagramEngine({
      nodes: [{ id: "switchgear", kind: "node", x: 0, y: 0, width: 100, height: 60, metadata: { type: "LV" } }],
    })
    grouped.dispatch({ type: "setEntityMetadata", id: "switchgear", metadata: { type: "MV" }, historyKey: "type:switchgear" })
    grouped.dispatch({ type: "setEntityMetadata", id: "switchgear", metadata: { type: "SLD" }, historyKey: "type:switchgear" })
    expect(grouped.getDiagnostics().undoDepth).toBe(1)
    grouped.dispatch({ type: "undo" })
    expect(grouped.getScene().entities.nodesById.get("switchgear")?.metadata?.type).toBe("LV")
    grouped.dispatch({ type: "redo" })
    expect(grouped.getScene().entities.nodesById.get("switchgear")?.metadata?.type).toBe("SLD")

    const bounded = createDiagramEngine({
      nodes: [{ id: "switchgear", kind: "node", x: 0, y: 0, width: 100, height: 60, metadata: { type: "LV" } }],
    }, { history: { maxEntries: 1 } })
    bounded.dispatch({ type: "moveNode", id: "switchgear", delta: { x: 10, y: 0 } })
    bounded.dispatch({ type: "setEntityMetadata", id: "switchgear", metadata: { type: "SLD" } })
    expect(bounded.getDiagnostics().undoDepth).toBe(1)
    bounded.dispatch({ type: "undo" })
    expect(bounded.getScene().entities.nodesById.get("switchgear")).toMatchObject({ x: 10, metadata: { type: "LV" } })
    expect(bounded.dispatch({ type: "undo" }).changed).toBe(false)
  })

  it("updates multiple entity metadata values as one undoable patch", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20, metadata: { keep: true, edgeWidth: 1 } }],
      edges: [{ id: "e1", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 20, y: 0 } }, metadata: { edgeStyle: "solid" } }],
    })
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 4, y: 0 } })
    const untouched = engine.getScene().entities.nodesById.get("n1")

    engine.dispatch({ type: "updateEntities", updates: [
      { id: "n1", metadata: { edgeWidth: 3 } },
      { id: "e1", metadata: { edgeStyle: "dashed" } },
    ] })
    expect(engine.getDiagnostics().undoDepth).toBe(2)
    expect(engine.getScene().entities.nodesById.get("n1")?.metadata).toEqual({ keep: true, edgeWidth: 3 })
    expect(engine.getScene().entities.edgesById.get("e1")?.metadata).toEqual({ edgeStyle: "dashed" })
    expect(engine.getScene().entities.nodesById.get("n1")).not.toBe(untouched)
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(4)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.metadata).toEqual({ keep: true, edgeWidth: 1 })
    expect(engine.getScene().entities.edgesById.get("e1")?.metadata?.edgeStyle).toBe("solid")
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.metadata?.edgeWidth).toBe(3)
  })

  it("treats empty, unchanged, and unknown entity updates as no-ops", () => {
    const engine = createDiagramEngine({ nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20, metadata: { keep: true } }] })
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 1, y: 0 } })
    const depth = engine.getDiagnostics().undoDepth
    expect(engine.dispatch({ type: "updateEntities", updates: [] }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateEntities", updates: [{ id: "missing", metadata: { a: 1 } }] }).changed).toBe(false)
    expect(engine.dispatch({ type: "updateEntities", updates: [{ id: "n1", metadata: { keep: true } }] }).changed).toBe(false)
    expect(engine.getDiagnostics().undoDepth).toBe(depth)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
  })

  it("deletes and restores selected entities", () => {
    const engine = createDiagramEngine(scene)

    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    engine.dispatch({ type: "deleteSelection" })
    expect(engine.getScene().entities.nodesById.has("n1")).toBe(false)
    expect(engine.getScene().entities.portsById.has("p1")).toBe(false)
    expect(engine.getScene().entities.edgesById.has("e1")).toBe(false)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
    expect(engine.getScene().entities.portsById.get("p1")?.nodeId).toBe("n1")
    expect(engine.getScene().entities.edgesById.get("e1")?.id).toBe("e1")
  })

  it("supports repeated undo and redo for adjacent history groups", () => {
    const engine = createDiagramEngine(scene)

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 0 }, historyKey: "drag:n1" })
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 5, y: 0 }, historyKey: "drag:n1" })
    engine.dispatch({ type: "moveNode", id: "n2", delta: { x: 20, y: 0 } })

    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(15)
    expect(engine.getScene().entities.nodesById.get("n2")?.x).toBe(280)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(15)
    expect(engine.getScene().entities.nodesById.get("n2")?.x).toBe(260)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)

    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(15)
  })

  it("evicts oldest entries when bounded history is configured", () => {
    const engine = createDiagramEngine(scene, { history: { maxEntries: 2 } })

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 0 } })
    engine.dispatch({ type: "moveNode", id: "n2", delta: { x: 20, y: 0 } })
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 30, y: 0 } })

    expect(engine.getDiagnostics().undoDepth).toBe(2)
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(10)
    expect(engine.getScene().entities.nodesById.get("n2")?.x).toBe(260)
    expect(engine.dispatch({ type: "undo" }).changed).toBe(false)
  })

  it("rejects invalid bounded history options", () => {
    expect(() => createDiagramEngine(scene, { history: { maxEntries: -1 } })).toThrow(
      "history.maxEntries must be a non-negative integer",
    )
    expect(() => createDiagramEngine(scene, { history: { maxEntries: 1.5 } })).toThrow(
      "history.maxEntries must be a non-negative integer",
    )
  })

  it("coalesces long gesture histories without nested patch chains", () => {
    const engine = createDiagramEngine(scene)
    for (let index = 0; index < 1000; index += 1) {
      engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 1, y: 0 }, historyKey: "drag:n1" })
    }

    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(1000)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
  })

  it("keeps drag previews transient and commits one history entry", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })

    controller.pointerDown({ id: 1, point: { x: 10, y: 10 } })
    controller.pointerMove({ id: 1, point: { x: 15, y: 10 } })
    controller.pointerMove({ id: 1, point: { x: 25, y: 20 } })

    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
    expect(callbacks).toHaveLength(1)
    callbacks[0]()
    expect(controller.getSnapshot().previewDelta).toEqual({ x: 15, y: 10 })
    expect(controller.getPreviewGeometry("n1")?.bounds).toMatchObject({ x: 15, y: 10 })

    controller.pointerUp({ id: 1, point: { x: 25, y: 20 } })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(15)
    expect(controller.getCommitCount()).toBe(1)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(0)
  })

  it("locks Shift-drag movement to the dominant axis for nodes, shapes, text, and edges", () => {
    const scenarios = [
      { id: "node", point: { x: 10, y: 10 }, scene: { nodes: [{ id: "node", kind: "node" as const, x: 0, y: 0, width: 20, height: 20 }] } },
      { id: "shape", point: { x: 40, y: 10 }, scene: { shapes: [{ id: "shape", kind: "shape" as const, shape: "rect" as const, x: 30, y: 0, width: 20, height: 20 }] } },
      { id: "text", point: { x: 61, y: 5 }, scene: { texts: [{ id: "text", kind: "text" as const, x: 60, y: 0, text: "Label" }] } },
      { id: "edge", point: { x: 120, y: 10 }, scene: { edges: [{ id: "edge", kind: "edge" as const, source: { kind: "point" as const, point: { x: 100, y: 10 } }, target: { kind: "point" as const, point: { x: 140, y: 10 } }, points: [{ x: 120, y: 10 }] }] } },
    ]

    for (const scenario of scenarios) {
      for (const axis of ["x", "y"] as const) {
        const callbacks: Array<() => void> = []
        const engine = createDiagramEngine(scenario.scene)
        engine.dispatch({ type: "setSelection", selection: { ids: [scenario.id], primaryId: scenario.id } })
        const original = engine.getGeometrySnapshot(scenario.id)!.bounds
        const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
        const movement = axis === "x" ? { x: 30, y: 8 } : { x: 8, y: 30 }
        const expectedDelta = axis === "x" ? { x: 30, y: 0 } : { x: 0, y: 30 }

        interaction.pointerDown({ id: 1, point: scenario.point })
        interaction.pointerMove({ id: 1, point: { x: scenario.point.x + movement.x, y: scenario.point.y + movement.y }, shiftKey: true })
        callbacks.shift()?.()
        expect(interaction.getSnapshot().previewDelta, `${scenario.id} ${axis} preview`).toEqual(expectedDelta)
        const previewBounds = interaction.getPreviewGeometry(scenario.id)!.bounds
        interaction.pointerUp({ id: 1, point: { x: scenario.point.x + movement.x, y: scenario.point.y + movement.y }, shiftKey: true })
        const committedBounds = engine.getGeometrySnapshot(scenario.id)!.bounds
        expect(committedBounds).toEqual(previewBounds)
        expect(committedBounds).toMatchObject({ x: original.x + expectedDelta.x, y: original.y + expectedDelta.y })
        engine.dispatch({ type: "undo" })
        expect(engine.getGeometrySnapshot(scenario.id)?.bounds).toEqual(original)
        engine.dispatch({ type: "redo" })
        expect(engine.getGeometrySnapshot(scenario.id)?.bounds).toEqual(committedBounds)
      }
    }
  })

  it("updates Shift axis lock while dragging and applies translation snaps only on the locked axis", () => {
    const frames: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [
        { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
      ],
      ports: [{ id: "fixed-port", kind: "port", nodeId: "fixed", x: 50, y: 2 }],
    })
    const interaction = createDiagramInteractionController(engine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { tolerancePx: 8, snapToPorts: false, snapToAlignment: true, snapToEqualSpacing: false },
    })
    interaction.pointerDown({ id: 1, point: { x: 5, y: 5 } })
    interaction.pointerMove({ id: 1, point: { x: 42, y: 15 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 40, y: 0 })
    expect(interaction.getSnapshot().snapGuides.length).toBeGreaterThan(0)
    expect(interaction.getSnapshot().snapGuides.every((guide) => guide.axis === "x")).toBe(true)
    const alignedPreview = interaction.getPreviewGeometry("moving")!.bounds
    interaction.pointerUp({ id: 1, point: { x: 42, y: 15 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("moving")?.bounds).toEqual(alignedPreview)

    const spacingEngine = createDiagramEngine({
      nodes: [
        { id: "before", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "spacing-moving", kind: "node", x: 31, y: 0, width: 10, height: 10 },
        { id: "after", kind: "node", x: 60, y: 0, width: 10, height: 10 },
      ],
    })
    const spacingInteraction = createDiagramInteractionController(spacingEngine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { tolerancePx: 6, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: true },
    })
    spacingInteraction.pointerDown({ id: 2, point: { x: 36, y: 5 } })
    spacingInteraction.pointerMove({ id: 2, point: { x: 30, y: 10 }, shiftKey: true })
    frames.shift()?.()
    expect(spacingInteraction.getSnapshot().previewDelta).toEqual({ x: -1, y: 0 })
    expect(spacingInteraction.getSnapshot().snapGuides).toHaveLength(2)
    expect(spacingInteraction.getSnapshot().snapGuides.every((guide) => guide.kind === "equal-spacing" && guide.axis === "x")).toBe(true)
    spacingInteraction.pointerUp({ id: 2, point: { x: 30, y: 10 }, shiftKey: true })
    expect(spacingEngine.getGeometrySnapshot("spacing-moving")?.bounds.y).toBe(0)
    expect(spacingEngine.getGeometrySnapshot("spacing-moving")?.bounds.x).toBe(30)

    const portEngine = createDiagramEngine({
      nodes: [
        { id: "port-moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "port-owner", kind: "node", x: 40, y: 0, width: 20, height: 20 },
      ],
      ports: [{ id: "snap-port", kind: "port", nodeId: "port-owner", x: 10, y: 2 }],
    })
    const portInteraction = createDiagramInteractionController(portEngine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { tolerancePx: 8, snapToPorts: true, snapToAlignment: false, snapToEqualSpacing: false },
    })
    portInteraction.pointerDown({ id: 3, point: { x: 5, y: 5 } })
    portInteraction.pointerMove({ id: 3, point: { x: 48, y: 8 }, shiftKey: true })
    frames.shift()?.()
    expect(portInteraction.getSnapshot().previewDelta).toEqual({ x: 50, y: 0 })
    portInteraction.pointerUp({ id: 3, point: { x: 48, y: 8 }, shiftKey: true })
    expect(portEngine.getScene().entities.nodesById.get("port-moving")).toMatchObject({ x: 50, y: 0 })
  })

  it("latches the selection axis across direction changes and chooses again after Shift is pressed", () => {
    const frames: Array<() => void> = []
    const engine = createDiagramEngine({ nodes: [{ id: "moving", kind: "node", x: 0, y: 0, width: 20, height: 20 }] })
    const interaction = createDiagramInteractionController(engine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { gridSize: 10, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false },
    })
    interaction.pointerDown({ id: 1, point: { x: 10, y: 10 } })
    interaction.pointerMove({ id: 1, point: { x: 40, y: 20 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 30, y: 0 })

    interaction.pointerMove({ id: 1, point: { x: 40, y: 41 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 30, y: 0 })
    const horizontalPreview = interaction.getPreviewGeometry("moving")!.bounds

    interaction.pointerMove({ id: 1, point: { x: 40, y: 41 }, shiftKey: false })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 30, y: 30 })
    interaction.pointerMove({ id: 1, point: { x: 40, y: 41 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 0, y: 30 })
    interaction.pointerMove({ id: 1, point: { x: 40, y: 20 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 0, y: 10 })
    const preview = interaction.getPreviewGeometry("moving")!.bounds
    interaction.pointerUp({ id: 1, point: { x: 40, y: 20 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("moving")!.bounds).toEqual(preview)
    expect(preview.y).toBe(10)
    expect(horizontalPreview.x).toBe(30)
  })

  it("keeps Shift-click additive selection and releases the axis lock when Shift is lifted", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    interaction.pointerDown({ id: 1, point: { x: 300, y: 30 }, shiftKey: true })
    expect(engine.getScene().selection.ids).toEqual(["n1", "n2"])
    interaction.pointerUp({ id: 1, point: { x: 300, y: 30 }, shiftKey: true })

    interaction.pointerDown({ id: 2, point: { x: 10, y: 10 } })
    interaction.pointerMove({ id: 2, point: { x: 40, y: 18 }, shiftKey: true })
    callbacks.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 30, y: 0 })
    interaction.pointerMove({ id: 2, point: { x: 40, y: 18 }, shiftKey: false })
    callbacks.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 30, y: 8 })
    interaction.pointerUp({ id: 2, point: { x: 40, y: 18 }, shiftKey: false })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ x: 30, y: 8 })
  })

  it("keeps grid snapping on the active Shift-drag axis", () => {
    const frames: Array<() => void> = []
    const engine = createDiagramEngine({ nodes: [{ id: "grid-moving", kind: "node", x: 3, y: 5, width: 10, height: 10 }] })
    const interaction = createDiagramInteractionController(engine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { gridSize: 10, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false },
    })
    interaction.pointerDown({ id: 1, point: { x: 8, y: 10 } })
    interaction.pointerMove({ id: 1, point: { x: 21, y: 17 }, shiftKey: true })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toEqual({ x: 17, y: 0 })
    interaction.pointerUp({ id: 1, point: { x: 21, y: 17 }, shiftKey: true })
    expect(engine.getScene().entities.nodesById.get("grid-moving")).toMatchObject({ x: 20, y: 5 })
  })

  it("selects and moves a port owner instead of selecting the immovable port", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    expect(engine.canMove(["p1"])).toBe(false)
    controller.pointerDown({ id: 1, point: { x: 100, y: 30 } })
    expect(engine.getScene().selection.ids).toEqual(["n1"])
    expect(controller.getSnapshot().tool).toBe("drag-selection")
    controller.pointerMove({ id: 1, point: { x: 115, y: 40 } })
    callbacks[0]()
    expect(controller.getPreviewGeometry("n1")?.bounds).toMatchObject({ x: 15, y: 10 })
    controller.pointerUp({ id: 1, point: { x: 115, y: 40 } })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ x: 15, y: 10 })
    expect(engine.getScene().selection.ids).toEqual(["n1"])
  })

  it("does not snap or commit selection clicks or sub-threshold movement", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 14, y: 14, width: 20, height: 20, portIds: [] }],
      edges: [], ports: [], texts: [], shapes: [],
      viewport: { x: 0, y: 0, width: 100, height: 100, zoom: 1 },
    })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { snap: { gridSize: 10, tolerancePx: 8, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false }, scheduleFrame: (callback) => frames.push(callback) })
    const history = engine.getDiagnostics().undoDepth

    interaction.pointerDown({ id: 1, point: { x: 16, y: 16 } })
    interaction.pointerUp({ id: 1, point: { x: 16, y: 16 } })
    expect(engine.getScene().selection.ids).toEqual(["n"])
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 14, y: 14 })
    expect(interaction.getCommitCount()).toBe(0)
    expect(engine.getDiagnostics().undoDepth).toBe(history)

    interaction.pointerDown({ id: 2, point: { x: 16, y: 16 } })
    interaction.pointerMove({ id: 2, point: { x: 18, y: 18 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().previewDelta).toBeNull()
    expect(interaction.getSnapshot().snapResult).toBeNull()
    interaction.pointerUp({ id: 2, point: { x: 18, y: 18 } })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 14, y: 14 })
    expect(interaction.getCommitCount()).toBe(0)
    expect(engine.getDiagnostics().undoDepth).toBe(history)

    interaction.pointerDown({ id: 3, point: { x: 16, y: 16 }, shiftKey: true })
    interaction.pointerUp({ id: 3, point: { x: 16, y: 16 }, shiftKey: true })
    expect(engine.getScene().selection.ids).toEqual([])
    expect(interaction.getCommitCount()).toBe(0)
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 14, y: 14 })

    interaction.pointerDown({ id: 4, point: { x: 16, y: 16 } })
    interaction.pointerMove({ id: 4, point: { x: 23, y: 16 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().snapResult?.source).toBe("grid")
    const snapped = interaction.getSnapshot().previewDelta!
    interaction.pointerUp({ id: 4, point: { x: 23, y: 16 } })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 14 + snapped.x, y: 14 + snapped.y })
    expect(interaction.getCommitCount()).toBe(1)
  })

  it("moves free edge endpoints and route points as one undoable drag", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      edges: [{ id: "free", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } }, points: [{ x: 50, y: 20 }] }],
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    controller.pointerDown({ id: 1, point: { x: 50, y: 20 } })
    expect(engine.getScene().selection.ids).toEqual(["free"])
    controller.pointerMove({ id: 1, point: { x: 70, y: 35 } })
    callbacks[0]()
    expect(controller.getPreviewGeometry("free")?.path).toEqual([{ x: 20, y: 15 }, { x: 70, y: 35 }, { x: 120, y: 15 }])
    controller.pointerUp({ id: 1, point: { x: 70, y: 35 } })
    const moved = engine.getScene().entities.edgesById.get("free")!
    expect(moved).toMatchObject({
      source: { kind: "point", point: { x: 20, y: 15 } },
      target: { kind: "point", point: { x: 120, y: 15 } },
      points: [{ x: 70, y: 35 }],
    })
    expect(controller.getCommitCount()).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("free")).toMatchObject({ source: { point: { x: 0, y: 0 } }, target: { point: { x: 100, y: 0 } }, points: [{ x: 50, y: 20 }] })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.get("free")).toEqual(moved)
  })

  it("moves an attached edge route without detaching node or port endpoints", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [
        { id: "a", kind: "node", x: 0, y: 0, width: 20, height: 20 },
        { id: "b", kind: "node", x: 200, y: 0, width: 20, height: 20 },
      ],
      ports: [
        { id: "pa", kind: "port", nodeId: "a", x: 20, y: 10 },
        { id: "pb", kind: "port", nodeId: "b", x: 0, y: 10 },
      ],
      edges: [{ id: "attached", kind: "edge", source: { kind: "port", portId: "pa" }, target: { kind: "node", nodeId: "b" }, points: [{ x: 80, y: 40 }, { x: 120, y: 40 }] }],
    })
    const original = engine.getScene().entities.edgesById.get("attached")!
    engine.dispatch({ type: "setSelection", selection: { ids: ["attached"], primaryId: "attached" } })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    controller.pointerDown({ id: 1, point: { x: 80, y: 40 } })
    controller.pointerMove({ id: 1, point: { x: 95, y: 35 } })
    callbacks[0]()
    expect(controller.getPreviewGeometry("attached")?.path).toEqual([{ x: 20, y: 10 }, { x: 95, y: 35 }, { x: 135, y: 35 }, { x: 210, y: 10 }])
    controller.pointerUp({ id: 1, point: { x: 95, y: 35 } })
    const moved = engine.getScene().entities.edgesById.get("attached")!
    expect(moved.source).toEqual(original.source)
    expect(moved.target).toEqual(original.target)
    expect(moved.points).toEqual([{ x: 95, y: 35 }, { x: 135, y: 35 }])
    expect(engine.getGeometrySnapshot("attached")?.path?.[0]).toEqual({ x: 20, y: 10 })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("attached")).toEqual(original)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.get("attached")).toEqual(moved)
  })

  it("uses identical snapped deltas for preview and commit with zoom-scaled tolerance", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [{ id: "moving", kind: "node", x: 3, y: 5, width: 10, height: 10 }],
      viewport: { x: 0, y: 0, width: 500, height: 300, zoom: 2 },
    })
    const controller = createDiagramInteractionController(engine, {
      scheduleFrame: (callback) => callbacks.push(callback),
      snap: { gridSize: 10, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false, tolerancePx: 6 },
    })
    controller.pointerDown({ id: 1, point: { x: 8, y: 10 } })
    controller.pointerMove({ id: 1, point: { x: 21, y: 17 } })
    callbacks[0]()
    const preview = controller.getPreviewGeometry("moving")!.bounds
    expect(preview).toMatchObject({ x: 20, y: 10 })
    controller.pointerUp({ id: 1, point: { x: 21, y: 17 } })
    const committed = engine.getGeometrySnapshot("moving")!.bounds
    expect(committed).toEqual(preview)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("moving")!.bounds).toMatchObject({ x: 3, y: 5 })
  })

  it("lets applications enable or disable port snapping independently", () => {
    const createEngine = () => createDiagramEngine({
      nodes: [
        { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "target", kind: "node", x: 90, y: 90, width: 20, height: 20 },
      ],
      ports: [{ id: "target-port", kind: "port", nodeId: "target", x: 10, y: 10 }],
    })
    for (const snapToPorts of [true, false]) {
      const callbacks: Array<() => void> = []
      const engine = createEngine()
      const controller = createDiagramInteractionController(engine, {
        scheduleFrame: (callback) => callbacks.push(callback),
        snap: { snapToPorts, snapToAlignment: false, snapToEqualSpacing: false, tolerancePx: 8 },
      })
      controller.pointerDown({ id: 1, point: { x: 5, y: 5 } })
      controller.pointerMove({ id: 1, point: { x: 101, y: 101 } })
      callbacks[0]()
      expect(controller.getPreviewGeometry("moving")?.bounds.x).toBe(snapToPorts ? 100 : 96)
      controller.cancel()
    }
  })

  it("emits alignment and equal-spacing guides only within tolerance", () => {
    const alignment = createDiagramEngine({
      nodes: [
        { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
      ],
    })
    const aligned = alignment.snapTranslation({ ids: ["moving"], primaryId: "moving" }, { x: 39, y: 0 }, { radius: 2, snapToPorts: false })
    expect(aligned.point).toEqual({ x: 40, y: 0 })
    expect(aligned.guides.some((guide) => guide.kind === "alignment")).toBe(true)
    const outside = alignment.snapTranslation({ ids: ["moving"], primaryId: "moving" }, { x: 20, y: 20 }, { radius: 2, snapToPorts: false })
    expect(outside.guides).toEqual([])

    const spacing = createDiagramEngine({
      nodes: [
        { id: "left", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "moving", kind: "node", x: 31, y: 0, width: 10, height: 10 },
        { id: "right", kind: "node", x: 60, y: 0, width: 10, height: 10 },
      ],
    })
    const spaced = spacing.snapTranslation({ ids: ["moving"], primaryId: "moving" }, { x: 0, y: 0 }, { radius: 2, snapToPorts: false, snapToEqualSpacing: true })
    expect(spaced.point).toEqual({ x: -1, y: 0 })
    expect(spaced.guides.filter((guide) => guide.kind === "equal-spacing")).toHaveLength(2)
    const outsideSpacing = spacing.snapTranslation({ ids: ["moving"], primaryId: "moving" }, { x: 10, y: 0 }, { radius: 2, snapToPorts: false, snapToEqualSpacing: true })
    expect(outsideSpacing.guides.filter((guide) => guide.kind === "equal-spacing")).toEqual([])

    const runAtZoom = (zoom: number) => {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({
        nodes: [
          { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
          { id: "fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
        ],
        viewport: { x: 0, y: 0, width: 200, height: 100, zoom },
      })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { tolerancePx: 6, snapToPorts: false, snapToEqualSpacing: false } })
      controller.pointerDown({ id: 1, point: { x: 5, y: 5 } })
      controller.pointerMove({ id: 1, point: { x: 42, y: 5 } })
      callbacks[0]()
      return controller.getSnapshot().snapGuides
    }
    expect(runAtZoom(2).some((guide) => guide.kind === "alignment" && guide.start.x === guide.end.x)).toBe(true)
    expect(runAtZoom(4).some((guide) => guide.kind === "alignment" && guide.start.x === guide.end.x)).toBe(false)
  })

  it("keeps nearest equal-spacing guides stable near a farther exact pair across zoom levels", () => {
    for (const zoom of [0.5, 1, 2]) {
      const engine = createDiagramEngine({
        nodes: [
          { id: "near-before", kind: "node", x: -10, y: 0, width: 20, height: 10 },
          { id: "near-after", kind: "node", x: 41, y: 0, width: 10, height: 10 },
          { id: "far-before", kind: "node", x: -100, y: 0, width: 20, height: 10 },
          { id: "far-after", kind: "node", x: 136, y: 0, width: 10, height: 10 },
          { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        ],
        viewport: { x: 0, y: 0, width: 200, height: 100, zoom },
      })
      const frames: Array<() => void> = []
      const interaction = createDiagramInteractionController(engine, {
        scheduleFrame: (callback) => { frames.push(callback) },
        snap: { tolerancePx: 6, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: true },
      })
      interaction.pointerDown({ id: 1, point: { x: 5, y: 5 } })
      const guideStarts: number[] = []
      for (const x of [28, 28.1, 28.2]) {
        interaction.pointerMove({ id: 1, point: { x, y: 5 } })
        frames.shift()?.()
        const snapshot = interaction.getSnapshot()
        const guide = snapshot.snapGuides.find((entry) => entry.kind === "equal-spacing" && entry.axis === "x")
        expect(guide).toBeDefined()
        guideStarts.push(guide!.start.x)
      }
      expect(guideStarts).toEqual([10, 10, 10])
      const preview = interaction.getSnapshot().previewDelta!
      interaction.pointerUp({ id: 1, point: { x: 28.2, y: 5 } })
      expect(engine.getGeometrySnapshot("moving")?.bounds.x).toBeCloseTo(preview.x)
      expect(engine.hitTest({ x: preview.x + 5, y: 5 })?.id).toBe("moving")
      engine.dispatch({ type: "undo" })
      expect(engine.getScene().entities.nodesById.get("moving")?.x).toBe(0)

      const alignmentEngine = createDiagramEngine({
        nodes: [
          { id: "align-moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
          { id: "align-fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
        ],
        viewport: { x: 0, y: 0, width: 200, height: 100, zoom },
      })
      const alignmentController = createDiagramInteractionController(alignmentEngine, {
        scheduleFrame: (callback) => { frames.push(callback) },
        snap: { tolerancePx: 6, snapToPorts: false, snapToEqualSpacing: false },
      })
      frames.length = 0
      alignmentController.pointerDown({ id: 2, point: { x: 5, y: 5 } })
      alignmentController.pointerMove({ id: 2, point: { x: 42, y: 5 } })
      frames.shift()?.()
      expect(alignmentController.getSnapshot().snapGuides.some((entry) => entry.kind === "alignment")).toBe(true)
    }
  })

  it("keeps viewport and selection outside document revision while undo restores overlap order", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "lower", kind: "node", x: 0, y: 0, width: 30, height: 30 },
        { id: "upper", kind: "node", x: 0, y: 0, width: 30, height: 30 },
      ],
    })
    const initialRevision = engine.getDocumentRevision()
    const initialOrder = engine.getRenderOrder()
    engine.dispatch({ type: "setSelection", selection: { ids: ["upper"], primaryId: "upper" } })
    engine.dispatch({ type: "setViewport", viewport: { x: 20, zoom: 1.25 } })
    expect(engine.getDocumentRevision()).toBe(initialRevision)
    engine.dispatch({ type: "moveNode", id: "upper", delta: { x: 40, y: 0 } })
    const changedRevision = engine.getDocumentRevision()
    engine.dispatch({ type: "setSelection", selection: { ids: ["lower"], primaryId: "lower" } })
    const pan = createDiagramInteractionController(engine)
    pan.setTool("pan")
    pan.pointerDown({ id: 9, point: { x: 0, y: 0 } })
    pan.pointerMove({ id: 9, point: { x: 10, y: 0 } })
    pan.pointerUp({ id: 9, point: { x: 10, y: 0 } })
    engine.dispatch({ type: "setViewport", viewport: { zoom: 0.8 } })
    expect(engine.getDocumentRevision()).toBe(changedRevision)
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("upper")?.x).toBe(0)
    expect(engine.getRenderOrder()).toEqual(initialOrder)
    expect(engine.hitTest({ x: 5, y: 5 })?.id).toBe("upper")
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("upper")?.x).toBe(40)
  })

  it("cancels a snapped selection drag without changing scene or history", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [
        { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
        { id: "fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
      ],
      selection: { ids: ["moving"], primaryId: "moving" },
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })
    const before = engine.getScene().entities.nodesById.get("moving")
    const historyDepth = engine.getDiagnostics().undoDepth
    controller.pointerDown({ id: 1, point: { x: 5, y: 5 } })
    controller.pointerMove({ id: 1, point: { x: 42, y: 5 } })
    callbacks[0]()
    expect(controller.getSnapshot().snapGuides.length).toBeGreaterThan(0)
    controller.cancel()
    expect(engine.getScene().entities.nodesById.get("moving")).toBe(before)
    expect(engine.getDiagnostics().undoDepth).toBe(historyDepth)
    expect(controller.getSnapshot().snapGuides).toEqual([])
  })

  it("previews and commits resize-handle gestures as one history entry", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    expect(controller.beginResizeHandle("n1", "se", { id: 1, point: { x: 100, y: 60 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: 130, y: 80 } })
    callbacks[0]()

    expect(controller.getSnapshot().resizePreview).toEqual({ id: "n1", width: 130, height: 80 })
    expect(controller.getPreviewGeometry("n1")?.bounds).toEqual({ x: 0, y: 0, width: 130, height: 80 })
    expect(controller.getPreviewGeometry("p1")?.point).toEqual({ x: 130, y: 40 })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 100, height: 60 })

    controller.pointerUp({ id: 1, point: { x: 130, y: 80 } })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 130, height: 80 })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ x: 130, y: 40 })
    expect(controller.getCommitCount()).toBe(1)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 100, height: 60 })
  })

  it("previews edge endpoint drags by frame and commits one undoable endpoint change", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } }, points: [{ x: 40, y: 20 }] }],
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })
    const original = engine.getScene().entities.edgesById.get("edge")!

    expect(controller.beginEdgeEndpointHandle("edge", "source", { id: 1, point: { x: 0, y: 0 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: -10, y: 15 } })
    controller.pointerMove({ id: 1, point: { x: -20, y: 25 } })
    expect(engine.getScene().entities.edgesById.get("edge")).toBe(original)
    expect(callbacks).toHaveLength(1)
    callbacks[0]()
    expect(controller.getSnapshot().edgeEndpointPreview).toEqual({ id: "edge", endpoint: "source", point: { x: -20, y: 25 } })
    expect(controller.getPreviewGeometry("edge")?.path).toEqual([{ x: -20, y: 25 }, { x: 40, y: 20 }, { x: 100, y: 0 }])
    expect(engine.getScene().entities.edgesById.get("edge")).toBe(original)

    controller.pointerUp({ id: 1, point: { x: -20, y: 25 } })
    expect(engine.getScene().entities.edgesById.get("edge")).toMatchObject({
      source: { kind: "point", point: { x: -20, y: 25 } },
      target: original.target,
      points: original.points,
    })
    expect(controller.getCommitCount()).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("edge")).toEqual(original)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: { x: -20, y: 25 } })
  })

  it("projects shifted endpoint drags from the stationary endpoint and restores free movement on release", () => {
    const run = (start: DiagramPoint, end: DiagramPoint) => {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({
        edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 100, y: 0 } }, target: { kind: "point", point: { x: 200, y: 0 } }, points: [{ x: 150, y: 20 }] }],
      })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
      controller.beginEdgeEndpointHandle("edge", "source", { id: 1, point: start })
      controller.pointerMove({ id: 1, point: end, shiftKey: true })
      callbacks.shift()?.()
      return { engine, controller, callbacks }
    }

    const horizontal = run({ x: 100, y: 0 }, { x: 120, y: 15 })
    expect(horizontal.controller.getSnapshot().edgeEndpointPreview?.point.x).toBeCloseTo(200 - Math.hypot(80, 15))
    expect(horizontal.controller.getSnapshot().edgeEndpointPreview?.point.y).toBe(0)
    expect(horizontal.controller.getPreviewGeometry("edge")?.path?.[0]).toEqual(horizontal.controller.getSnapshot().edgeEndpointPreview?.point)
    const horizontalPoint = horizontal.controller.getSnapshot().edgeEndpointPreview!.point
    horizontal.controller.pointerUp({ id: 1, point: { x: 120, y: 15 }, shiftKey: true })
    expect(horizontal.engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: horizontalPoint })

    const vertical = run({ x: 100, y: 0 }, { x: 215, y: 40 })
    expect(vertical.controller.getSnapshot().edgeEndpointPreview?.point.x).toBe(200)
    expect(vertical.controller.getSnapshot().edgeEndpointPreview?.point.y).toBeCloseTo(Math.hypot(15, 40))
    const verticalPoint = vertical.controller.getSnapshot().edgeEndpointPreview!.point
    vertical.controller.pointerUp({ id: 1, point: { x: 215, y: 40 }, shiftKey: true })
    expect(vertical.engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: verticalPoint })

    const snappedEngine = createDiagramEngine({
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 100, y: 0 } }, target: { kind: "point", point: { x: 200, y: 0 } } }],
    })
    const snappedCallbacks: Array<() => void> = []
    const snapped = createDiagramInteractionController(snappedEngine, { scheduleFrame: (callback) => snappedCallbacks.push(callback), snap: { gridSize: 10 } })
    snapped.beginEdgeEndpointHandle("edge", "source", { id: 1, point: { x: 100, y: 0 } })
    snapped.pointerMove({ id: 1, point: { x: 127, y: 20 }, shiftKey: true })
    snappedCallbacks[0]?.()
    expect(snapped.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 120, y: 0 })
    snapped.pointerUp({ id: 1, point: { x: 127, y: 20 }, shiftKey: true })
    expect(snappedEngine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: { x: 120, y: 0 } })

    const toggled = run({ x: 100, y: 0 }, { x: 120, y: 15 })
    toggled.controller.pointerMove({ id: 1, point: { x: 120, y: 15 }, shiftKey: false })
    toggled.callbacks[0]?.()
    expect(toggled.controller.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 120, y: 15 })
    toggled.controller.pointerUp({ id: 1, point: { x: 120, y: 15 }, shiftKey: false })
    expect(toggled.engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: { x: 120, y: 15 } })
  })

  it("keeps the edge endpoint cardinal angle latched across 45 degrees and matches the committed route", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 100, y: 0 } }, target: { kind: "point", point: { x: 200, y: 0 } }, points: [{ x: 150, y: 20 }] }],
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { gridSize: 10 } })
    controller.beginEdgeEndpointHandle("edge", "source", { id: 1, point: { x: 100, y: 0 } })
    controller.pointerMove({ id: 1, point: { x: 130, y: 10 }, shiftKey: true })
    callbacks.shift()?.()
    expect(controller.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 130, y: 0 })

    controller.pointerMove({ id: 1, point: { x: 130, y: 31 }, shiftKey: true })
    callbacks.shift()?.()
    expect(controller.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 120, y: 0 })
    const previewPath = controller.getPreviewGeometry("edge")?.path
    controller.pointerUp({ id: 1, point: { x: 130, y: 31 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("edge")?.path).toEqual(previewPath)
    expect(engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: { x: 120, y: 0 } })

    const toggleCallbacks: Array<() => void> = []
    const toggleEngine = createDiagramEngine({ edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 100, y: 0 } }, target: { kind: "point", point: { x: 200, y: 0 } } }] })
    const toggle = createDiagramInteractionController(toggleEngine, { scheduleFrame: (callback) => toggleCallbacks.push(callback), snap: { enabled: false } })
    toggle.beginEdgeEndpointHandle("edge", "source", { id: 2, point: { x: 100, y: 0 } })
    toggle.pointerMove({ id: 2, point: { x: 130, y: 10 }, shiftKey: true })
    toggleCallbacks.shift()?.()
    toggle.pointerMove({ id: 2, point: { x: 220, y: 100 }, shiftKey: false })
    toggleCallbacks.shift()?.()
    expect(toggle.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 220, y: 100 })
    toggle.pointerMove({ id: 2, point: { x: 220, y: 100 }, shiftKey: true })
    toggleCallbacks.shift()?.()
    expect(toggle.getSnapshot().edgeEndpointPreview?.point.x).toBe(200)
    expect(toggle.getSnapshot().edgeEndpointPreview?.point.y).toBeCloseTo(Math.hypot(20, 100))
    const relockedPoint = toggle.getSnapshot().edgeEndpointPreview!.point
    toggle.pointerUp({ id: 2, point: { x: 220, y: 100 }, shiftKey: true })
    expect(toggleEngine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "point", point: relockedPoint })
  })

  it("snaps shifted endpoint vectors to all four cardinal angles from either endpoint", () => {
    const cases = [
      { endpoint: "target", point: { x: 110, y: 20 }, expected: { x: Math.hypot(110, 20), y: 0 } },
      { endpoint: "target", point: { x: 20, y: 100 }, expected: { x: 0, y: Math.hypot(20, 100) } },
      { endpoint: "target", point: { x: -100, y: 20 }, expected: { x: -Math.hypot(100, 20), y: 0 } },
      { endpoint: "target", point: { x: 20, y: -100 }, expected: { x: 0, y: -Math.hypot(20, 100) } },
      { endpoint: "source", point: { x: 200, y: 40 }, expected: { x: 100 + Math.hypot(100, 20), y: 20 } },
      { endpoint: "source", point: { x: 120, y: 120 }, expected: { x: 100, y: 20 + Math.hypot(20, 100) } },
      { endpoint: "source", point: { x: 0, y: 40 }, expected: { x: 100 - Math.hypot(100, 20), y: 20 } },
      { endpoint: "source", point: { x: 120, y: -80 }, expected: { x: 100, y: 20 - Math.hypot(20, 100) } },
    ] as const

    for (const [index, scenario] of cases.entries()) {
      const frames: Array<() => void> = []
      const engine = createDiagramEngine({ edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 20 } } }] })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { enabled: false } })
      const start = scenario.endpoint === "target" ? { x: 100, y: 20 } : { x: 0, y: 0 }
      controller.beginEdgeEndpointHandle("edge", scenario.endpoint, { id: index, point: start, shiftKey: true })
      controller.pointerMove({ id: index, point: scenario.point, shiftKey: true })
      frames[0]?.()
      const preview = controller.getSnapshot().edgeEndpointPreview!.point
      expect(preview.x).toBeCloseTo(scenario.expected.x)
      expect(preview.y).toBeCloseTo(scenario.expected.y)
      controller.pointerUp({ id: index, point: scenario.point, shiftKey: true })
      const committed = engine.getScene().entities.edgesById.get("edge")![scenario.endpoint]
      expect(committed).toEqual({ kind: "point", point: preview })
      const path = engine.getGeometrySnapshot("edge")?.path
      expect(path?.[scenario.endpoint === "source" ? 0 : path.length - 1]).toEqual(preview)
    }
  })

  it("latches endpoint cardinal direction through 45 degrees and relatches after Shift is pressed", () => {
    const frames: Array<() => void> = []
    const engine = createDiagramEngine({ edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 20 } } }] })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { enabled: false } })
    controller.beginEdgeEndpointHandle("edge", "target", { id: 1, point: { x: 100, y: 20 } })
    controller.pointerMove({ id: 1, point: { x: 130, y: 30 }, shiftKey: true })
    frames.shift()?.()
    const firstRadius = Math.hypot(130, 30)
    expect(controller.getSnapshot().edgeEndpointPreview?.point.x).toBeCloseTo(firstRadius)
    expect(controller.getSnapshot().edgeEndpointPreview?.point.y).toBe(0)

    controller.pointerMove({ id: 1, point: { x: 90, y: 100 }, shiftKey: true })
    frames.shift()?.()
    expect(controller.getSnapshot().edgeEndpointPreview?.point.x).toBeCloseTo(Math.hypot(90, 100))
    expect(controller.getSnapshot().edgeEndpointPreview?.point.y).toBe(0)

    controller.pointerMove({ id: 1, point: { x: 90, y: 100 }, shiftKey: false })
    frames.shift()?.()
    expect(controller.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 90, y: 100 })
    controller.pointerMove({ id: 1, point: { x: 90, y: 100 }, shiftKey: true })
    frames.shift()?.()
    expect(controller.getSnapshot().edgeEndpointPreview?.point.x).toBe(0)
    expect(controller.getSnapshot().edgeEndpointPreview?.point.y).toBeCloseTo(Math.hypot(90, 100))
    const preview = controller.getPreviewGeometry("edge")?.path
    controller.pointerUp({ id: 1, point: { x: 90, y: 100 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("edge")?.path).toEqual(preview)
    expect(engine.getScene().entities.edgesById.get("edge")?.target).toEqual({ kind: "point", point: preview?.[preview.length - 1] })
  })

  it("keeps cardinal snapping and orthogonal connector routes in preview and committed geometry", () => {
    const frames: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [{ id: "port-owner", kind: "node", x: 132, y: 3, width: 10, height: 10 }],
      ports: [{ id: "snap-port", kind: "port", nodeId: "port-owner", x: 0, y: 0 }],
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 20 } }, points: [{ x: 0, y: 20 }, { x: 80, y: 20 }] }],
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { tolerancePx: 8, snapToPorts: true, snapToAlignment: false, snapToEqualSpacing: false } })
    controller.beginEdgeEndpointHandle("edge", "target", { id: 1, point: { x: 100, y: 20 } })
    controller.pointerMove({ id: 1, point: { x: 130, y: 30 }, shiftKey: true })
    frames.shift()?.()
    const preview = controller.getPreviewGeometry("edge")?.path
    expect(preview?.[preview.length - 1]).toEqual({ x: 132, y: 0 })
    expect(preview?.[2]).toEqual({ x: 132, y: 20 })
    for (let index = 1; index < (preview?.length ?? 0); index += 1) {
      expect(Math.abs(preview![index - 1]!.x - preview![index]!.x) < 1e-6 || Math.abs(preview![index - 1]!.y - preview![index]!.y) < 1e-6).toBe(true)
    }
    controller.pointerUp({ id: 1, point: { x: 130, y: 30 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("edge")?.path).toEqual(preview)
    expect(engine.getScene().entities.edgesById.get("edge")?.points).toEqual([{ x: 0, y: 20 }, { x: 132, y: 20 }])
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("edge")?.points).toEqual([{ x: 0, y: 20 }, { x: 80, y: 20 }])

    const alignmentFrames: Array<() => void> = []
    const alignmentEngine = createDiagramEngine({
      nodes: [{ id: "alignment-node", kind: "node", x: 131, y: -5, width: 10, height: 10 }],
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 20 } } }],
    })
    const alignment = createDiagramInteractionController(alignmentEngine, {
      scheduleFrame: (callback) => alignmentFrames.push(callback),
      snap: { tolerancePx: 8, snapToPorts: false, snapToAlignment: true, snapToEqualSpacing: false },
    })
    alignment.beginEdgeEndpointHandle("edge", "target", { id: 2, point: { x: 100, y: 20 } })
    alignment.pointerMove({ id: 2, point: { x: 130, y: 30 }, shiftKey: true })
    alignmentFrames[0]?.()
    expect(alignment.getSnapshot().edgeEndpointPreview?.point).toEqual({ x: 136, y: 0 })
    alignment.pointerUp({ id: 2, point: { x: 130, y: 30 }, shiftKey: true })
    expect(alignmentEngine.getGeometrySnapshot("edge")?.path?.[1]).toEqual({ x: 136, y: 0 })
  })

  it("preserves resize aspect ratio under Shift and grid snapping in preview and commit", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 0, y: 0, width: 100, height: 50 }] })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { gridSize: 10 } })
    expect(controller.beginResizeHandle("shape", "se", { id: 1, point: { x: 100, y: 50 }, shiftKey: true })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: 127, y: 73 }, shiftKey: true })
    callbacks[0]?.()
    expect(controller.getSnapshot().resizePreview).toEqual({ id: "shape", width: 150, height: 75 })
    controller.pointerUp({ id: 1, point: { x: 127, y: 73 }, shiftKey: true })
    expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject({ width: 150, height: 75 })
    expect(engine.getScene().entities.nodesById.get("shape")!.width / engine.getScene().entities.nodesById.get("shape")!.height).toBe(2)

    const toggleCallbacks: Array<() => void> = []
    const toggleEngine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 0, y: 0, width: 100, height: 50 }] })
    const toggle = createDiagramInteractionController(toggleEngine, { scheduleFrame: (callback) => toggleCallbacks.push(callback) })
    toggle.beginResizeHandle("shape", "se", { id: 1, point: { x: 100, y: 50 } })
    toggle.pointerMove({ id: 1, point: { x: 130, y: 70 }, shiftKey: true })
    toggleCallbacks[0]?.()
    expect(toggle.getSnapshot().resizePreview?.width).toBe(140)
    expect(toggle.getSnapshot().resizePreview?.height).toBe(70)
    toggle.pointerMove({ id: 1, point: { x: 130, y: 70 }, shiftKey: false })
    toggleCallbacks[1]?.()
    expect(toggle.getSnapshot().resizePreview?.width).toBe(130)
    expect(toggle.getSnapshot().resizePreview?.height).toBe(70)
    toggle.pointerUp({ id: 1, point: { x: 130, y: 70 }, shiftKey: false })
    expect(toggleEngine.getScene().entities.nodesById.get("shape")).toMatchObject({ width: 130, height: 70 })
  })

  it("resizes side handles on one axis, anchors the opposite side, and supports undo and redo", () => {
    const cases = [
      { handle: "n", point: { x: 50, y: -10 }, expected: { x: 0, y: -10, width: 100, height: 50 }, anchor: { x: 50, y: 40 } },
      { handle: "e", point: { x: 110, y: 20 }, expected: { x: 0, y: 0, width: 110, height: 40 }, anchor: { x: 0, y: 20 } },
      { handle: "s", point: { x: 50, y: 50 }, expected: { x: 0, y: 0, width: 100, height: 50 }, anchor: { x: 50, y: 0 } },
      { handle: "w", point: { x: -10, y: 20 }, expected: { x: -10, y: 0, width: 110, height: 40 }, anchor: { x: 100, y: 20 } },
    ] as const

    for (const [index, scenario] of cases.entries()) {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 0, y: 0, width: 100, height: 40 }] })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
      const starts = { n: { x: 50, y: 0 }, e: { x: 100, y: 20 }, s: { x: 50, y: 40 }, w: { x: 0, y: 20 } } as const
      expect(controller.beginResizeHandle("shape", scenario.handle, { id: index + 1, point: starts[scenario.handle], shiftKey: true })).toBe(true)
      controller.pointerMove({ id: index + 1, point: scenario.point, shiftKey: true })
      callbacks[0]?.()
      const preview = controller.getSnapshot().resizePreview!
      const previewBounds = { x: preview.x ?? 0, y: preview.y ?? 0, width: preview.width!, height: preview.height! }
      expect({ id: preview.id, ...previewBounds }).toEqual({ id: "shape", ...scenario.expected })
      const oppositeAfter = scenario.handle === "n" || scenario.handle === "s"
        ? { x: previewBounds.x + previewBounds.width / 2, y: scenario.handle === "n" ? previewBounds.y + previewBounds.height : previewBounds.y }
        : { x: scenario.handle === "e" ? previewBounds.x : previewBounds.x + previewBounds.width, y: previewBounds.y + previewBounds.height / 2 }
      expect(oppositeAfter).toEqual(scenario.anchor)
      controller.pointerUp({ id: index + 1, point: scenario.point, shiftKey: true })
      expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject(scenario.expected)
      expect(engine.getDiagnostics().undoDepth).toBe(1)
      engine.dispatch({ type: "undo" })
      expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject({ x: 0, y: 0, width: 100, height: 40 })
      engine.dispatch({ type: "redo" })
      expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject(scenario.expected)
    }
  })

  it("resizes side handles along rotated local axes and cancels without committing", () => {
    for (const rotation of [90, 31]) {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 20, y: 30, width: 100, height: 40, rotation }] })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
      const center = { x: 70, y: 50 }
      const start = rotatePoint({ x: center.x, y: 30 }, center, rotation)
      const end = rotatePoint({ x: center.x, y: 20 }, center, rotation)
      const opposite = rotatePoint({ x: center.x, y: 70 }, center, rotation)
      const depth = engine.getDiagnostics().undoDepth
      expect(controller.beginResizeHandle("shape", "n", { id: 1, point: start })).toBe(true)
      controller.pointerMove({ id: 1, point: end })
      callbacks[0]?.()
      expect(controller.getSnapshot().resizePreview).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: 100 })
      expect(controller.getSnapshot().resizePreview?.height).toBeCloseTo(50)
      controller.cancel()
      expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject({ x: 20, y: 30, width: 100, height: 40 })
      expect(engine.getDiagnostics().undoDepth).toBe(depth)

      controller.beginResizeHandle("shape", "n", { id: 2, point: start })
      controller.pointerMove({ id: 2, point: end })
      callbacks[1]?.()
      const preview = controller.getPreviewGeometry("shape")!
      const resizedBounds = preview.unrotatedBounds!
      const resizedCenter = { x: resizedBounds.x + resizedBounds.width / 2, y: resizedBounds.y + resizedBounds.height / 2 }
      const oppositeAfter = rotatePoint({ x: resizedCenter.x, y: resizedBounds.y + resizedBounds.height }, resizedCenter, rotation)
      expect(oppositeAfter.x).toBeCloseTo(opposite.x)
      expect(oppositeAfter.y).toBeCloseTo(opposite.y)
      const previewEntry = controller.getSnapshot().resizePreview
      controller.pointerUp({ id: 2, point: end })
      expect(engine.getScene().entities.nodesById.get("shape")).toMatchObject({ ...previewEntry })
    }
  })

  it("snaps side resize and enforces the minimum size", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 0, y: 0, width: 100, height: 40 }] })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { gridSize: 10 } })
    controller.beginResizeHandle("shape", "e", { id: 1, point: { x: 100, y: 20 } })
    controller.pointerMove({ id: 1, point: { x: 113, y: 20 } })
    callbacks.shift()?.()
    expect(controller.getSnapshot().resizePreview).toMatchObject({ width: 110, height: 40 })
    controller.pointerMove({ id: 1, point: { x: 1, y: 20 } })
    callbacks.shift()?.()
    expect(controller.getSnapshot().resizePreview?.width).toBeGreaterThanOrEqual(8)
    controller.cancel()
  })

  it("keeps flipped side handles aligned to their projected local side", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({ nodes: [{ id: "shape", kind: "node", x: 0, y: 0, width: 100, height: 40, flipX: true }] })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback), snap: { enabled: false } })
    expect(controller.beginResizeHandle("shape", "e", { id: 1, point: { x: 0, y: 20 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: -20, y: 20 } })
    callbacks[0]?.()
    expect(controller.getSnapshot().resizePreview).toMatchObject({ x: -20, width: 120, height: 40 })
    controller.pointerUp({ id: 1, point: { x: -20, y: 20 } })
    const entity = engine.getScene().entities.nodesById.get("shape")!
    expect(entity).toMatchObject({ x: -20, width: 120, height: 40, flipX: true })
    expect(engine.getGeometrySnapshot("shape")?.bounds).toMatchObject({ x: -20, width: 120 })
  })

  it("supports dragging either edge endpoint and cancels without history changes", () => {
    for (const endpoint of ["source", "target"] as const) {
      const callbacks: Array<() => void> = []
      const engine = createDiagramEngine({
        edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } }, points: [{ x: 50, y: 10 }] }],
      })
      const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })
      const original = engine.getScene().entities.edgesById.get("edge")!
      engine.dispatch({ type: "setViewport", viewport: { x: 10 } })
      const historyDepth = engine.getDiagnostics().undoDepth
      expect(controller.beginEdgeEndpointHandle("edge", endpoint, { id: 1, point: { x: 0, y: 0 } })).toBe(true)
      controller.pointerMove({ id: 1, point: { x: 30, y: 40 } })
      callbacks[0]()
      expect(controller.getPreviewGeometry("edge")?.path?.[endpoint === "source" ? 0 : 2]).toEqual({ x: 30, y: 40 })
      controller.cancel()
      expect(engine.getScene().entities.edgesById.get("edge")).toBe(original)
      expect(engine.getDiagnostics().undoDepth).toBe(historyDepth)
      expect(controller.getSnapshot().edgeEndpointPreview).toBeNull()
    }
  })

  it("maps resize-handle drag deltas through entity rotation", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 40, rotation: 90 }],
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    const anchorBefore = engine.getGeometrySnapshot("n1")?.corners?.[0]

    expect(controller.beginResizeHandle("n1", "se", { id: 1, point: { x: 30, y: 70 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: 30, y: 90 } })
    callbacks[0]()

    const preview = controller.getSnapshot().resizePreview
    expect(preview).toMatchObject({ id: "n1", width: 120, height: 40 })
    expect(preview?.x).toBeCloseTo(-10)
    expect(preview?.y).toBeCloseTo(10)
    controller.pointerUp({ id: 1, point: { x: 30, y: 90 } })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 120, height: 40 })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBeCloseTo(-10)
    expect(engine.getScene().entities.nodesById.get("n1")?.y).toBeCloseTo(10)
    const anchorAfter = engine.getGeometrySnapshot("n1")?.corners?.[0]
    expect(anchorAfter?.x).toBeCloseTo(anchorBefore?.x ?? 0)
    expect(anchorAfter?.y).toBeCloseTo(anchorBefore?.y ?? 0)
  })

  it("previews and commits group resize as one history entry", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 50 },
        { id: "n2", kind: "node", x: 200, y: 50, width: 100, height: 50 },
      ],
      selection: { ids: ["n1", "n2"], primaryId: "n1" },
    })
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    expect(controller.beginResizeSelectionHandle("se", { id: 1, point: { x: 300, y: 100 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: 360, y: 120 } })
    callbacks[0]()

    expect(controller.getSnapshot().resizePreviewEntries).toEqual([
      { id: "n1", x: 0, y: 0, width: 120, height: 60 },
      { id: "n2", x: 240, y: 60, width: 120, height: 60 },
    ])
    expect(controller.getPreviewGeometry("n2")?.bounds).toEqual({ x: 240, y: 60, width: 120, height: 60 })
    expect(engine.getScene().entities.nodesById.get("n2")).toMatchObject({ x: 200, y: 50, width: 100, height: 50 })

    controller.pointerUp({ id: 1, point: { x: 360, y: 120 } })
    expect(engine.getScene().entities.nodesById.get("n2")).toMatchObject({ x: 240, y: 60, width: 120, height: 60 })
    expect(controller.getCommitCount()).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n2")).toMatchObject({ x: 200, y: 50, width: 100, height: 50 })
  })

  it("selects groups with strict containment marquee by default", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    controller.pointerDown({ id: 1, point: { x: -20, y: -20 } })
    controller.pointerMove({ id: 1, point: { x: 190, y: 150 } })
    callbacks[0]()

    expect(controller.getSnapshot().marquee).toEqual({ x: -20, y: -20, width: 210, height: 170 })

    controller.pointerUp({ id: 1, point: { x: 190, y: 150 } })

    expect(engine.getScene().selection.ids).toEqual(["n1", "s1", "t1"])
    expect(engine.getScene().selection.primaryId).toBe("n1")
    expect(engine.getScene().selection.ids).not.toContain("e1")
    expect(engine.getScene().selection.ids).not.toContain("p1")
  })

  it("can opt into intersecting marquee selection", () => {
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { marqueeMode: "intersect" })

    controller.pointerDown({ id: 1, point: { x: -20, y: -20 } })
    controller.pointerMove({ id: 1, point: { x: 190, y: 150 } })
    controller.pointerUp({ id: 1, point: { x: 190, y: 150 } })

    expect(engine.getScene().selection.ids).toContain("e1")
  })

  it("drags the existing group selection when pointer starts on a selected entity", () => {
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine)

    engine.dispatch({ type: "setSelection", selection: { ids: ["n1", "n2"], primaryId: "n1" } })
    controller.pointerDown({ id: 1, point: { x: 20, y: 20 } })
    controller.pointerMove({ id: 1, point: { x: 40, y: 30 } })
    controller.pointerUp({ id: 1, point: { x: 40, y: 30 } })

    expect(engine.getScene().selection.ids).toEqual(["n1", "n2"])
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(20)
    expect(engine.getScene().entities.nodesById.get("n2")?.x).toBe(280)
  })

  it("covers editor must-have commands and helpers", () => {
    const engine = createDiagramEngine({
      ...scene,
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 60, portIds: ["p1"] },
        { id: "n2", kind: "node", x: 260, y: 0, width: 100, height: 60, portIds: ["p2"], metadata: { locked: true } },
      ],
      edges: [
        { id: "e1", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "port", portId: "p2" }, points: [{ x: 150, y: 30 }] },
      ],
      shapes: [
        { id: "s1", kind: "shape", shape: "rect", x: 120, y: 80, width: 50, height: 40, metadata: { layerRole: "background" } },
      ],
    })

    expect(engine.canUndo()).toBe(false)
    expect(engine.canMove(["n1"])).toBe(true)
    expect(engine.canMove(["n2"])).toBe(false)

    engine.dispatch({ type: "resizeEntities", entries: [{ id: "n1", width: 120, height: 80 }] })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 120, height: 80 })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ x: 120, y: 40 })
    expect(engine.getScene().entities.edgesById.get("e1")?.points?.[0]).toEqual({ x: 150, y: 30 })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 100, height: 60 })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ x: 100, y: 30 })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ x: 120, y: 40 })

    engine.dispatch({ type: "insertEdgeWaypoint", id: "e1", index: 1, point: { x: 180, y: 60 } })
    expect(engine.getScene().entities.edgesById.get("e1")?.points).toHaveLength(2)
    engine.dispatch({ type: "moveEdgeWaypoint", id: "e1", index: 0, point: { x: 140, y: 20 } })
    expect(engine.getScene().entities.edgesById.get("e1")?.points?.[0]).toEqual({ x: 140, y: 20 })
    engine.dispatch({ type: "removeEdgeWaypoint", id: "e1", index: 1 })
    expect(engine.getScene().entities.edgesById.get("e1")?.points).toHaveLength(1)

    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    const exported = engine.exportSelection()
    expect(exported.nodes.map((node) => node.id)).toEqual(["n1"])
    expect(exported.ports.map((port) => port.id)).toEqual(["p1"])

    engine.duplicateSelection({ x: 30, y: 30 })
    expect(engine.getScene().selection.ids[0]).toMatch(/^n1-copy-/)
    expect(engine.canUndo()).toBe(true)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.size).toBe(2)
    engine.importClipboard(exported, { x: 48, y: 0 })
    expect(engine.getScene().entities.nodesById.size).toBe(3)

    engine.dispatch({ type: "setSelection", selection: { ids: ["n1"], primaryId: "n1" } })
    engine.dispatch({ type: "keyboard", command: "nudge-right", options: { shiftKey: true, largeStep: 25 } })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(25)
    engine.dispatch({ type: "keyboard", command: "escape" })
    expect(engine.getScene().selection.ids).toEqual([])

    engine.dispatch({ type: "setLayer", ids: ["n1"], layer: "controls", layerRole: "foreground" })
    expect(engine.getScene().entities.nodesById.get("n1")?.metadata).toMatchObject({ layer: "controls", layerRole: "foreground" })
    expect(engine.getRenderOrder()[0]).toBe("s1")
    engine.dispatch({ type: "bringToFront", ids: ["s1"] })
    expect(engine.getScene().order.shapeIds.at(-1)).toBe("s1")

    engine.fitSelection()
    const fittedSelection = engine.getScene().viewport
    expect(fittedSelection.width * fittedSelection.zoom).toBeCloseTo(500)
    expect(fittedSelection.height * fittedSelection.zoom).toBeCloseTo(300)
    engine.fitScene()
    const fittedScene = engine.getScene().viewport
    expect(fittedScene.width).toBeGreaterThan(100)
    expect(fittedScene.width * fittedScene.zoom).toBeCloseTo(500)
    expect(fittedScene.height * fittedScene.zoom).toBeCloseTo(300)

    engine.queryVisible({ x: -100, y: -100, width: 800, height: 400 })
    engine.hitTest({ x: 10, y: 10 })
    expect(engine.getDiagnostics()).toMatchObject({ visibleQueryCount: 1, hitTestCount: 1 })
  })

  it("moves selected ids through z-order in the expected direction", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 20, height: 20 },
        { id: "n2", kind: "node", x: 0, y: 0, width: 20, height: 20 },
        { id: "n3", kind: "node", x: 0, y: 0, width: 20, height: 20 },
      ],
      shapes: [{ id: "s1", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }],
      texts: [{ id: "t1", kind: "text", x: 0, y: 0, text: "Label" }],
    })

    engine.dispatch({ type: "bringForward", ids: ["n1"] })
    expect(engine.getScene().order.nodeIds).toEqual(["n2", "n1", "n3"])
    engine.dispatch({ type: "bringForward", ids: ["n1"] })
    expect(engine.getScene().order.nodeIds).toEqual(["n2", "n3", "n1"])
    engine.dispatch({ type: "sendBackward", ids: ["n1"] })
    expect(engine.getScene().order.nodeIds).toEqual(["n2", "n1", "n3"])

    engine.dispatch({ type: "bringToFront", ids: ["s1"] })
    expect(engine.getScene().entities.shapesById.get("s1")?.metadata).toMatchObject({ zIndex: 1 })
    expect(engine.queryVisible({ x: -10, y: -10, width: 40, height: 40 }).at(-1)).toBe("s1")
    engine.dispatch({ type: "sendToBack", ids: ["t1"] })
    expect(engine.queryVisible({ x: -10, y: -10, width: 40, height: 40 })[0]).toBe("t1")
  })

  it("rotates and aligns entities through core commands", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 40, y: 30, width: 40, height: 20 },
        { id: "n2", kind: "node", x: 100, y: 80, width: 20, height: 20 },
        { id: "locked", kind: "node", x: 160, y: 120, width: 20, height: 20, metadata: { locked: true } },
      ],
      texts: [{ id: "t1", kind: "text", x: 10, y: 10, width: 40, height: 12, text: "Label" }],
    })

    engine.dispatch({ type: "rotateEntities", entries: [{ id: "n1", rotation: 390 }, { id: "locked", rotation: 45 }] })
    expect(engine.getScene().entities.nodesById.get("n1")?.rotation).toBe(30)
    expect(engine.getScene().entities.nodesById.get("locked")?.rotation).toBeUndefined()
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.rotation).toBe(0)
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n1")?.rotation).toBe(30)
    engine.dispatch({ type: "undo" })

    engine.dispatch({ type: "alignEntities", ids: ["n1", "n2", "t1"], edge: "left" })
    expect(engine.getScene().entities.nodesById.get("n1")?.x).toBe(10)
    expect(engine.getScene().entities.nodesById.get("n2")?.x).toBe(10)
    expect(engine.getScene().entities.textsById.get("t1")?.x).toBe(10)
    engine.dispatch({ type: "alignEntities", ids: ["n1", "n2"], edge: "bottom" })
    expect(engine.getScene().entities.nodesById.get("n1")?.y).toBe(80)
    expect(engine.getScene().entities.nodesById.get("n2")?.y).toBe(80)
  })

  it("rotates free straight edges around their center and preserves selection through undo and redo", () => {
    const engine = createDiagramEngine({
      edges: [
        { id: "free-edge", kind: "edge", source: { kind: "point", point: { x: 20, y: 40 } }, target: { kind: "point", point: { x: 120, y: 40 } } },
        { id: "locked-edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 10, y: 0 } }, metadata: { locked: true } },
        { id: "readonly-edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 10 } }, target: { kind: "point", point: { x: 10, y: 10 } }, metadata: { readOnly: true } },
      ],
      selection: { ids: ["free-edge"], primaryId: "free-edge" },
    })
    expect(engine.canRotate()).toBe(true)
    expect(engine.canRotate(["locked-edge"])).toBe(false)
    expect(engine.canRotate(["readonly-edge"])).toBe(false)
    expect(engine.dispatch({ type: "rotateEntities", entries: [{ id: "free-edge", rotation: 90 }] }).changed).toBe(true)
    expect(engine.getScene().entities.edgesById.get("free-edge")).toMatchObject({
      source: { kind: "point", point: { x: 70, y: -10 } },
      target: { kind: "point", point: { x: 70, y: 90 } },
      rotation: 90,
    })
    expect(engine.getScene().selection).toEqual({ ids: ["free-edge"], primaryId: "free-edge" })
    expect(engine.getGeometrySnapshot("free-edge")?.bounds).toEqual({ x: 70, y: -10, width: 0, height: 100 })
    const rotated = engine.getScene().entities.edgesById.get("free-edge")
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("free-edge")?.source).toEqual({ kind: "point", point: { x: 20, y: 40 } })
    expect(engine.getScene().selection).toEqual({ ids: ["free-edge"], primaryId: "free-edge" })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.get("free-edge")).toEqual(rotated)
    expect(engine.getScene().selection).toEqual({ ids: ["free-edge"], primaryId: "free-edge" })
  })

  it("rotates free multi-waypoint routes deterministically and keeps connected references attached", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "host", kind: "node", x: 200, y: 0, width: 20, height: 20, portIds: ["port"] }],
      ports: [{ id: "port", kind: "port", nodeId: "host", x: 0, y: 10 }],
      edges: [
        { id: "routed", kind: "edge", source: { kind: "point", point: { x: 20, y: 40 } }, target: { kind: "point", point: { x: 120, y: 40 } }, points: [{ x: 40, y: 80 }, { x: 80, y: 100 }] },
        { id: "connected", kind: "edge", source: { kind: "port", portId: "port" }, target: { kind: "point", point: { x: 140, y: 10 } }, points: [{ x: 160, y: 30 }] },
      ],
      groups: [{ id: "connected-group", kind: "group", childIds: ["host", "connected"] }],
    })
    expect(engine.canRotate(["routed"])).toBe(true)
    expect(engine.canRotate(["connected"])).toBe(false)
    engine.dispatch({ type: "rotateEntities", entries: [{ id: "routed", rotation: 90 }] })
    expect(engine.getScene().entities.edgesById.get("routed")).toMatchObject({
      source: { kind: "point", point: { x: 100, y: 20 } },
      target: { kind: "point", point: { x: 100, y: 120 } },
      points: [{ x: 60, y: 40 }, { x: 40, y: 80 }],
    })
    const connectedBefore = engine.getScene().entities.edgesById.get("connected")!
    expect(engine.dispatch({ type: "rotateEntities", entries: [{ id: "connected", rotation: 90 }] }).changed).toBe(false)
    expect(engine.getScene().entities.edgesById.get("connected")).toEqual(connectedBefore)
    expect(engine.dispatch({ type: "rotateEntities", entries: [{ id: "connected-group", rotation: 90 }] }).changed).toBe(true)
    expect(engine.getScene().entities.edgesById.get("connected")?.source).toEqual(connectedBefore.source)
    expect(engine.getGeometrySnapshot("connected")?.path?.[0]).toEqual(engine.getGeometrySnapshot("port")?.point)
  })

  it("rotates a selected group around its shared bounds center and supports both quarter-turn directions", () => {
    const createEngine = () => {
      const engine = createDiagramEngine({
        nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 10 }],
        shapes: [{ id: "s", kind: "shape", shape: "rect", x: 30, y: 0, width: 10, height: 20 }],
      })
      engine.dispatch({ type: "groupEntities", id: "g", ids: ["n", "s"] })
      return engine
    }
    const clockwise = createEngine()
    expect(clockwise.canRotate()).toBe(true)
    const ids = [clockwise.getScene().entities.nodesById.get("n")?.id, clockwise.getScene().entities.shapesById.get("s")?.id]
    clockwise.dispatch({ type: "rotateEntities", entries: [{ id: "g", rotation: 90 }] })
    expect(clockwise.getScene().entities.nodesById.get("n")).toMatchObject({ x: 15, y: -5, rotation: 90 })
    expect(clockwise.getScene().entities.shapesById.get("s")).toMatchObject({ x: 15, y: 15, rotation: 90 })
    expect(clockwise.getGeometrySnapshot("g")?.bounds).toEqual({ x: 10, y: -10, width: 20, height: 40 })
    clockwise.dispatch({ type: "undo" })
    expect(clockwise.getScene().entities.nodesById.get("n")).toMatchObject({ x: 0, y: 0 })
    expect(clockwise.getScene().entities.nodesById.get("n")?.rotation).toBeUndefined()
    expect(clockwise.getScene().entities.shapesById.get("s")).toMatchObject({ x: 30, y: 0 })
    expect(clockwise.getScene().entities.shapesById.get("s")?.rotation).toBeUndefined()
    clockwise.dispatch({ type: "redo" })
    expect(clockwise.getScene().entities.nodesById.get("n")).toMatchObject({ x: 15, y: -5, rotation: 90 })
    expect([clockwise.getScene().entities.nodesById.get("n")?.id, clockwise.getScene().entities.shapesById.get("s")?.id]).toEqual(ids)

    const counterClockwise = createEngine()
    counterClockwise.dispatch({ type: "rotateEntities", entries: [{ id: "g", rotation: -90 }] })
    expect(counterClockwise.getScene().entities.nodesById.get("n")).toMatchObject({ x: 5, y: 15, rotation: 270 })
    expect(counterClockwise.getScene().entities.shapesById.get("s")).toMatchObject({ x: 15, y: -15, rotation: 270 })
  })

  it("rotates mixed groupable entities and preserves connections, serialization, and IDs through undo/redo", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "node", kind: "node", x: 0, y: 0, width: 10, height: 10, portIds: ["port"] }],
      ports: [{ id: "port", kind: "port", nodeId: "node", x: 0, y: 0 }],
      shapes: [{ id: "shape", kind: "shape", shape: "line", x: 20, y: 0, width: 10, height: 10 }],
      texts: [{ id: "text", kind: "text", x: 0, y: 20, width: 10, height: 10, text: "T" }],
      tables: [{ id: "table", kind: "table", x: 20, y: 20, width: 10, height: 10, rowCount: 1, columnCount: 1 }],
      edges: [{ id: "edge", kind: "edge", source: { kind: "port", portId: "port" }, target: { kind: "point", point: { x: 25, y: 25 } }, points: [{ x: 15, y: 15 }] }],
      groups: [{ id: "group", kind: "group", childIds: ["node", "shape", "text", "table", "edge"] }],
      selection: { ids: ["group"], primaryId: "group" },
    })
    expect(engine.canRotate()).toBe(true)
    const idOrder = ["node", "shape", "text", "table", "edge", "port"]
    engine.dispatch({ type: "rotateEntities", entries: [{ id: "group", rotation: 90 }] })
    expect(engine.getScene().entities.nodesById.get("node")).toMatchObject({ x: 20, y: 0, rotation: 90 })
    expect(engine.getScene().entities.shapesById.get("shape")).toMatchObject({ x: 20, y: 20, rotation: 90 })
    expect(engine.getScene().entities.textsById.get("text")).toMatchObject({ x: 0, y: 0, rotation: 90 })
    expect(engine.getScene().entities.tablesById.get("table")).toMatchObject({ x: 0, y: 20, rotation: 90 })
    expect(engine.getGeometrySnapshot("port")?.point?.x).toBeCloseTo(30)
    expect(engine.getGeometrySnapshot("port")?.point?.y).toBeCloseTo(0)
    expect(engine.getScene().entities.edgesById.get("edge")?.source).toEqual({ kind: "port", portId: "port" })
    const edgePath = engine.getGeometrySnapshot("edge")?.path
    expect(edgePath?.[0]?.x).toBeCloseTo(30)
    expect(edgePath?.[0]?.y).toBeCloseTo(0)
    expect(edgePath?.[1]).toEqual({ x: 15, y: 15 })
    expect(edgePath?.[2]).toEqual({ x: 5, y: 25 })
    expect(engine.getGeometrySnapshot("table")?.rotation).toBe(90)
    const restored = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(restored.getScene().entities.groupsById.get("group")?.rotation).toBe(90)
    expect(restored.getScene().entities.tablesById.get("table")?.rotation).toBe(90)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.groupsById.get("group")?.rotation).toBeUndefined()
    expect(engine.getScene().entities.edgesById.get("edge")?.points).toEqual([{ x: 15, y: 15 }])
    engine.dispatch({ type: "redo" })
    expect([
      engine.getScene().entities.nodesById.get("node")?.id,
      engine.getScene().entities.shapesById.get("shape")?.id,
      engine.getScene().entities.textsById.get("text")?.id,
      engine.getScene().entities.tablesById.get("table")?.id,
      engine.getScene().entities.edgesById.get("edge")?.id,
      engine.getScene().entities.portsById.get("port")?.id,
    ]).toEqual(idOrder)
    expect(engine.getGeometrySnapshot("group")?.bounds).toEqual(restored.getGeometrySnapshot("group")?.bounds)
  })

  it("reflects a node around its own center and preserves attached ports and edge identity", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 10, y: 20, width: 100, height: 40, portIds: ["p"] }],
      ports: [{ id: "p", kind: "port", nodeId: "n", x: 10, y: 5 }],
      edges: [{ id: "e", kind: "edge", source: { kind: "port", portId: "p" }, target: { kind: "point", point: { x: 180, y: 25 } }, points: [{ x: 120, y: 10 }] }],
      selection: { ids: ["n"], primaryId: "n" },
    })
    const originalPort = engine.getGeometrySnapshot("p")?.point
    const originalScene = engine.serialize()
    engine.dispatch({ type: "flipEntities", axis: "horizontal" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ id: "n", x: 10, y: 20, flipX: true })
    expect(engine.getGeometrySnapshot("p")?.point).toEqual({ x: 100, y: 25 })
    expect(engine.getScene().entities.edgesById.get("e")?.source).toEqual({ kind: "port", portId: "p" })
    expect(engine.getGeometrySnapshot("e")?.path?.[0]).toEqual({ x: 100, y: 25 })
    engine.dispatch({ type: "flipEntities", ids: ["n"], axis: "vertical" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ flipX: true, flipY: true })
    expect(engine.getGeometrySnapshot("p")?.point).toEqual({ x: 100, y: 55 })
    const restored = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(restored.getScene().entities.nodesById.get("n")).toMatchObject({ flipX: true, flipY: true })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ flipX: true, flipY: undefined })
    engine.dispatch({ type: "undo" })
    expect(engine.serialize()).toEqual(originalScene)
    expect(engine.getGeometrySnapshot("p")?.point).toEqual(originalPort)
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ flipX: true, flipY: true })
  })

  it("reflects mixed grouped selections around their common center and serializes the transforms", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }],
      shapes: [{ id: "s", kind: "shape", shape: "line", x: 40, y: 0, width: 10, height: 20 }],
      texts: [{ id: "t", kind: "text", x: 0, y: 40, width: 20, height: 10, text: "label" }],
      tables: [{ id: "table", kind: "table", x: 30, y: 40, width: 20, height: 10, rowCount: 1, columnCount: 1 }],
      edges: [{ id: "e", kind: "edge", source: { kind: "point", point: { x: 10, y: 10 } }, target: { kind: "point", point: { x: 50, y: 50 } }, points: [{ x: 30, y: 30 }] }],
      groups: [{ id: "g", kind: "group", childIds: ["n", "s", "t", "table", "e"] }],
      selection: { ids: ["g"], primaryId: "g" },
    })
    const identity = [
      engine.getScene().entities.nodesById.get("n"),
      engine.getScene().entities.shapesById.get("s"),
      engine.getScene().entities.textsById.get("t"),
      engine.getScene().entities.tablesById.get("table"),
      engine.getScene().entities.edgesById.get("e"),
    ].map((entity) => entity?.id)
    engine.dispatch({ type: "flipEntities", axis: "horizontal" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 30, flipX: true })
    expect(engine.getScene().entities.shapesById.get("s")).toMatchObject({ x: 0, flipX: true })
    expect(engine.getScene().entities.textsById.get("t")).toMatchObject({ x: 30, flipX: true })
    expect(engine.getScene().entities.tablesById.get("table")).toMatchObject({ x: 0, flipX: true })
    expect(engine.getGeometrySnapshot("e")?.path).toEqual([{ x: 40, y: 10 }, { x: 20, y: 30 }, { x: 0, y: 50 }])
    engine.dispatch({ type: "flipEntities", ids: ["g"], axis: "vertical" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 30, y: 30, flipX: true, flipY: true })
    const loaded = createDiagramEngine(deserializeScene(engine.serialize()))
    expect(loaded.getScene().entities.nodesById.get("n")).toMatchObject({ flipX: true, flipY: true })
    expect(loaded.getScene().entities.shapesById.get("s")).toMatchObject({ flipX: true, flipY: true })
    expect(loaded.getScene().entities.textsById.get("t")).toMatchObject({ flipX: true, flipY: true })
    expect(loaded.getScene().entities.tablesById.get("table")).toMatchObject({ x: 0, y: 0, flipX: true, flipY: true })
    expect(loaded.getScene().entities.edgesById.get("e")?.points).toEqual(engine.getScene().entities.edgesById.get("e")?.points)
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
    expect(engine.serialize()).toMatchObject({ nodes: [{ id: "n", x: 0 }], shapes: [{ id: "s", x: 40 }], texts: [{ id: "t", x: 0 }], tables: [{ id: "table", x: 30 }] })
    engine.dispatch({ type: "redo" })
    engine.dispatch({ type: "redo" })
    expect([
      engine.getScene().entities.nodesById.get("n")?.id,
      engine.getScene().entities.shapesById.get("s")?.id,
      engine.getScene().entities.textsById.get("t")?.id,
      engine.getScene().entities.tablesById.get("table")?.id,
      engine.getScene().entities.edgesById.get("e")?.id,
    ]).toEqual(identity)
  })

  it("honors constraints for locked and non-deletable entities", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "locked", kind: "node", x: 0, y: 0, width: 20, height: 20, metadata: { locked: true } },
        { id: "fixed", kind: "node", x: 40, y: 0, width: 20, height: 20, metadata: { nonDeletable: true } },
      ],
    })

    engine.dispatch({ type: "moveNode", id: "locked", delta: { x: 10, y: 0 } })
    expect(engine.getScene().entities.nodesById.get("locked")?.x).toBe(0)
    expect(engine.canDelete(["fixed"])).toBe(false)

    engine.dispatch({ type: "setSelection", selection: { ids: ["locked", "fixed"], primaryId: "locked" } })
    engine.dispatch({ type: "deleteSelection" })
    expect(engine.getScene().entities.nodesById.has("locked")).toBe(true)
    expect(engine.getScene().entities.nodesById.has("fixed")).toBe(true)
  })

  it("snaps to ports, alignment, angles, and grid", () => {
    const engine = createDiagramEngine(scene)

    expect(engine.snapPoint({ x: 101, y: 31 }, { radius: 8 }).source).toBe("port")
    expect(engine.snapPoint({ x: 50, y: 200 }, { radius: 3 }).source).toBe("alignment")
    expect(engine.snapPoint({ x: 50, y: 100 }, { radius: 3, excludeIds: new Set(["n1"]) }).snapped).toBe(false)
    expect(engine.snapPoint({ x: 10, y: 7 }, { angleConstraint: 45 }).source).toBe("angle")
    expect(engine.snapPoint({ x: 13, y: 17 }, { gridSize: 10 })).toEqual({ point: { x: 10, y: 20 }, snapped: true, source: "grid" })
  })

  it("returns deterministic indexed snap candidates with screen tolerance and segment geometry", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "center-node", kind: "node", x: 45, y: -5, width: 10, height: 10 }],
      edges: [
        { id: "horizontal", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } } },
        { id: "vertical", kind: "edge", source: { kind: "point", point: { x: 50, y: -50 } }, target: { kind: "point", point: { x: 50, y: 50 } } },
      ],
      viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 2 },
    })
    const point = { x: 50.5, y: 1 }
    const options = { tolerancePx: 10, kinds: ["endpoint", "midpoint", "center", "intersection", "nearest", "perpendicular"] as const, origin: { x: 50, y: 40 } }
    const candidates = engine.getSnapCandidates(point, options)
    expect(candidates).toEqual(engine.getSnapCandidates(point, options))
    expect(candidates[0]).toMatchObject({ kind: "intersection", targetId: "horizontal|vertical", point: { x: 50, y: 0 } })
    expect(candidates.some((candidate) => candidate.kind === "midpoint" && candidate.targetId === "horizontal")).toBe(true)
    expect(candidates.some((candidate) => candidate.kind === "center" && candidate.targetId === "center-node")).toBe(true)
    expect(candidates.some((candidate) => candidate.kind === "nearest" && candidate.targetId === "horizontal")).toBe(true)
    expect(candidates.some((candidate) => candidate.kind === "perpendicular" && candidate.targetId === "horizontal")).toBe(true)
    expect(candidates.every((candidate) => candidate.distancePx <= 10)).toBe(true)
    const snapped = engine.snapPoint(point, { tolerancePx: 10, kinds: ["intersection"] })
    expect(snapped).toMatchObject({ point: { x: 50, y: 0 }, source: "intersection", targetId: "horizontal|vertical" })
    expect(engine.getSnapCandidates({ x: 10.5, y: 11 }, { tolerancePx: 10, gridSize: 10, kinds: ["grid"] })[0]).toMatchObject({ kind: "grid", point: { x: 10, y: 10 } })
  })

  it("constrains angular snapping relative to a caller origin", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 100, height: 100, zoom: 1 } })
    const result = engine.snapPoint({ x: 30, y: 40 }, { kinds: [], origin: { x: 10, y: 10 }, angleIncrement: 90 })
    expect(result.source).toBe("angle")
    expect(result.point.x).toBeCloseTo(10)
    expect(result.point.y).toBeCloseTo(10 + Math.hypot(20, 30))
  })

  it("returns structured scene validation issues without throwing", () => {
    expect(validateDiagramScene({ nodes: [{ id: "bad-node", kind: "node", x: Number.NaN, y: 0, width: 20, height: 20 }] })).toMatchObject([
      { code: "invalid-geometry", severity: "error", entityIds: ["bad-node"] },
    ])
    expect(validateDiagramScene({ nodes: [{ id: "ok", kind: "node", x: 0, y: 0, width: 20, height: 20 }] })).toEqual([])
  })

  it("creates validated line shapes through the undoable command API", () => {
    const engine = createDiagramEngine()
    const line = { id: "line", kind: "shape" as const, shape: "line", x: 5, y: 8, width: 30, height: 12 }
    expect(engine.dispatch({ type: "createShape", shape: line }).changed).toBe(true)
    expect(engine.getScene().entities.shapesById.get("line")).toEqual(line)
    expect(engine.dispatch({ type: "undo" }).changed).toBe(true)
    expect(engine.getScene().entities.shapesById.has("line")).toBe(false)
    expect(engine.dispatch({ type: "redo" }).changed).toBe(true)
    expect(engine.getScene().entities.shapesById.get("line")).toEqual(line)
    expect(engine.dispatch({ type: "createShape", shape: { ...line, id: "bad", x: Number.NaN } }).changed).toBe(false)
  })

  it("applies configured grid snapping to resize preview and commit", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "shape", kind: "shape", shape: "rect", x: 0, y: 0, width: 100, height: 50 }] })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { gridSize: 10 } })
    interaction.beginResizeHandle("shape", "se", { id: 1, point: { x: 100, y: 50 } })
    interaction.pointerMove({ id: 1, point: { x: 127, y: 72 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().resizePreview).toMatchObject({ width: 130, height: 70 })
    interaction.pointerUp({ id: 1, point: { x: 127, y: 72 } })
    expect(engine.getScene().entities.shapesById.get("shape")).toMatchObject({ width: 130, height: 70 })
  })

  it("applies polar constraints to selection preview and commit and cancels numeric input cleanly", () => {
    const engine = createDiagramEngine({ nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }] })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { enabled: false, angleIncrement: 45 } })
    interaction.pointerDown({ id: 1, point: { x: 10, y: 10 } })
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    interaction.pointerMove({ id: 1, point: { x: 50, y: 30 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().constraint).toMatchObject({ kind: "angle", angle: 45 })
    expect(interaction.getSnapshot().previewDelta?.x).toBeCloseTo(interaction.getSnapshot().previewDelta?.y ?? 0)
    interaction.setDynamicInput({ dx: 100, dy: 0 })
    interaction.cancelDynamicInput()
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.getScene().entities.nodesById.get("n")?.x).toBe(0)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
  })

  it("creates orthogonal connectors with stable local routes and snaps endpoint ports", () => {
    const route = routeOrthogonalConnector({ x: 0, y: 0 }, { x: 100, y: 40 }, { terminalLead: 12 })
    expect(route.firstAxis).toBe("horizontal")
    expect(route.path).toEqual([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 88, y: 0 }, { x: 88, y: 40 }, { x: 100, y: 40 }])
    expect(route.diagnostics).toEqual([])
    const engine = createDiagramEngine({
      nodes: [
        { id: "a", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["pa"] },
        { id: "b", kind: "node", x: 100, y: 0, width: 20, height: 20, portIds: ["pb"] },
      ],
      ports: [
        { id: "pa", kind: "port", nodeId: "a", x: 20, y: 10 },
        { id: "pb", kind: "port", nodeId: "b", x: 0, y: 10 },
      ],
    })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, {
      scheduleFrame: (callback) => frames.push(callback),
      snap: { tolerancePx: 8, kinds: ["port"], snapToPorts: true },
    })
    expect(interaction.beginEdgeCreation("a", { id: 1, point: { x: 20, y: 10 } })).toBe(false)
    expect(interaction.beginEdgeCreation("invalid-route", { id: 1, point: { x: 20, y: 10 } }, { terminalLead: -1 })).toBe(false)
    expect(interaction.beginEdgeCreation("new-edge", { id: 1, point: { x: 20, y: 10 } }, { terminalLead: 8 })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 100, y: 10 } })
    frames.shift()?.()
    const preview = interaction.getSnapshot().edgeCreationPreview!
    expect(preview.source).toEqual({ kind: "port", portId: "pa" })
    expect(preview.target).toEqual({ kind: "port", portId: "pb" })
    interaction.pointerUp({ id: 1, point: { x: 100, y: 10 } })
    expect(engine.getScene().entities.edgesById.get("new-edge")).toMatchObject({ source: preview.source, target: preview.target, points: preview.points })
    expect(engine.canUndo()).toBe(true)
  })

  it("uses a port-only screen tolerance consistently across viewport zoom levels", () => {
    for (const zoom of [0.5, 1, 2]) {
      const engine = createDiagramEngine({
        nodes: [{ id: "host", kind: "node", x: 100, y: 0, width: 10, height: 10, portIds: ["port"] }],
        ports: [{ id: "port", kind: "port", nodeId: "host", x: 0, y: 0 }],
        viewport: { x: 0, y: 0, width: 300, height: 200, zoom },
      })
      const interaction = createDiagramInteractionController(engine, {
        scheduleFrame: (callback) => callback(),
        snap: { kinds: ["port"], tolerancePx: 2, portTolerancePx: 8 },
      })
      const inside = { x: 100, y: 7 / zoom }
      expect(interaction.beginEdgeCreation(`inside-${zoom}`, { id: 1, point: { x: 0, y: 0 } })).toBe(true)
      interaction.pointerMove({ id: 1, point: inside })
      expect(interaction.getSnapshot().edgeCreationPreview?.target).toEqual({ kind: "port", portId: "port" })
      interaction.cancel()

      const outside = { x: 100, y: 9 / zoom }
      expect(interaction.beginEdgeCreation(`outside-${zoom}`, { id: 2, point: { x: 0, y: 0 } })).toBe(true)
      interaction.pointerMove({ id: 2, point: outside })
      expect(interaction.getSnapshot().edgeCreationPreview?.target).toEqual({ kind: "point", point: outside })
      interaction.cancel()
    }
  })

  it("applies portTolerancePx only to ports and preserves legacy tolerance fallback", () => {
    const edgeEngine = createDiagramEngine({
      shapes: [{ id: "reference", kind: "shape", shape: "line", x: 96, y: 0, width: 8, height: 0 }],
      nodes: [{ id: "host", kind: "node", x: 200, y: 0, width: 10, height: 10, portIds: ["port"] }],
      ports: [{ id: "port", kind: "port", nodeId: "host", x: 0, y: 0 }],
    })
    const edgeInteraction = createDiagramInteractionController(edgeEngine, {
      snap: { kinds: ["port", "endpoint"], tolerancePx: 2, portTolerancePx: 12 },
      scheduleFrame: (callback) => callback(),
    })
    edgeInteraction.beginEdgeCreation("endpoint-outside", { id: 1, point: { x: 0, y: 0 } })
    edgeInteraction.pointerMove({ id: 1, point: { x: 100, y: 0 } })
    expect(edgeInteraction.getSnapshot().edgeCreationPreview?.target).toEqual({ kind: "point", point: { x: 100, y: 0 } })

    const makeLegacyEngine = () => createDiagramEngine({
      nodes: [{ id: "legacy-host", kind: "node", x: 100, y: 0, width: 10, height: 10, portIds: ["legacy-port"] }],
      ports: [{ id: "legacy-port", kind: "port", nodeId: "legacy-host", x: 0, y: 0 }],
    })
    const legacy = createDiagramInteractionController(makeLegacyEngine(), {
      snap: { kinds: ["port"], tolerancePx: 8 },
      scheduleFrame: (callback) => callback(),
    })
    legacy.beginEdgeCreation("legacy-edge", { id: 1, point: { x: 0, y: 0 } })
    legacy.pointerMove({ id: 1, point: { x: 100, y: 7 } })
    expect(legacy.getSnapshot().edgeCreationPreview?.target).toEqual({ kind: "port", portId: "legacy-port" })
  })

  it("uses stable port selection for preview and commit and honors snapToPorts=false", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "z-host", kind: "node", x: 100, y: 5, width: 10, height: 10, portIds: ["z-port"] },
        { id: "a-host", kind: "node", x: 100, y: -5, width: 10, height: 10, portIds: ["a-port"] },
      ],
      ports: [
        { id: "z-port", kind: "port", nodeId: "z-host", x: 0, y: 0 },
        { id: "a-port", kind: "port", nodeId: "a-host", x: 0, y: 0 },
      ],
    })
    const interaction = createDiagramInteractionController(engine, {
      snap: { kinds: ["port"], tolerancePx: 2, portTolerancePx: 8 },
      scheduleFrame: (callback) => callback(),
    })
    interaction.beginEdgeCreation("tie-edge", { id: 1, point: { x: 0, y: 0 } })
    interaction.pointerMove({ id: 1, point: { x: 100, y: 0 } })
    const preview = interaction.getSnapshot().edgeCreationPreview!
    expect(preview.target).toEqual({ kind: "port", portId: "a-port" })
    interaction.pointerUp({ id: 1, point: { x: 100, y: 0 } })
    expect(engine.getScene().entities.edgesById.get("tie-edge")?.target).toEqual(preview.target)

    const disabledEngine = createDiagramEngine({
      nodes: [{ id: "disabled-host", kind: "node", x: 100, y: 0, width: 10, height: 10, portIds: ["disabled-port"] }],
      ports: [{ id: "disabled-port", kind: "port", nodeId: "disabled-host", x: 0, y: 0 }],
    })
    const disabled = createDiagramInteractionController(disabledEngine, {
      snap: { kinds: ["port"], tolerancePx: 2, portTolerancePx: 12, snapToPorts: false },
      scheduleFrame: (callback) => callback(),
    })
    disabled.beginEdgeCreation("disabled-edge", { id: 1, point: { x: 0, y: 0 } })
    disabled.pointerMove({ id: 1, point: { x: 100, y: 5 } })
    expect(disabled.getSnapshot().edgeCreationPreview?.target).toEqual({ kind: "point", point: { x: 100, y: 5 } })
    disabled.pointerUp({ id: 1, point: { x: 100, y: 5 } })
    expect(disabledEngine.getScene().entities.edgesById.get("disabled-edge")?.target).toEqual({ kind: "point", point: { x: 100, y: 5 } })
  })

  it("previews and commits a snapped free line as one undoable shape command", () => {
    const engine = createDiagramEngine({ viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 1 } })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { enabled: false, angleIncrement: 90 } })
    expect(interaction.beginLineCreation("line", { id: 1, point: { x: 10, y: 10 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 40, y: 20 } })
    frames.shift()?.()
    const preview = interaction.getSnapshot().shapeCreationPreview
    expect(preview).toMatchObject({ id: "line", shape: "line", height: 0, flipY: false })
    expect(preview?.width).toBeCloseTo(Math.hypot(30, 10))
    expect(engine.getScene().entities.shapesById.size).toBe(0)
    interaction.pointerUp({ id: 1, point: { x: 40, y: 20 } })
    expect(engine.getScene().entities.shapesById.get("line")).toEqual(preview)
    expect(engine.canUndo()).toBe(true)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.has("line")).toBe(false)
  })

  it("reattaches an endpoint to a snapped port only in explicit connector mode", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "owner", kind: "node", x: 140, y: -10, width: 20, height: 20, portIds: ["port"] }],
      ports: [{ id: "port", kind: "port", nodeId: "owner", x: 10, y: 10 }],
      edges: [{ id: "edge", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } } }],
    })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { kinds: ["port"], endpointMode: "reattach", tolerancePx: 8 } })
    expect(interaction.beginEdgeEndpointHandle("edge", "target", { id: 1, point: { x: 100, y: 0 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 150, y: 0 } })
    frames.shift()?.()
    expect(interaction.getSnapshot().edgeEndpointPreview?.connection).toEqual({ kind: "port", portId: "port" })
    interaction.pointerUp({ id: 1, point: { x: 150, y: 0 } })
    expect(engine.getScene().entities.edgesById.get("edge")?.target).toEqual({ kind: "port", portId: "port" })
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("edge")?.target).toEqual({ kind: "point", point: { x: 100, y: 0 } })
  })

  it("supports finite dynamic input and confirms one undoable drag", () => {
    const engine = createDiagramEngine({ nodes: [{ id: "n", kind: "node", x: 0, y: 0, width: 20, height: 20 }] })
    const frames: Array<() => void> = []
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => frames.push(callback), snap: { enabled: false } })
    interaction.pointerDown({ id: 1, point: { x: 10, y: 10 } })
    const historyDepth = engine.getDiagnostics().undoDepth
    expect(interaction.getSnapshot().tool).toBe("drag-selection")
    expect(interaction.setDynamicInput({ dx: 35, dy: 15 })).toBe(true)
    expect(interaction.getSnapshot().dynamicInput).toMatchObject({ x: 45, y: 25, dx: 35, dy: 15 })
    expect(interaction.getPreviewGeometry("n")?.bounds).toMatchObject({ x: 35, y: 15 })
    expect(interaction.setDynamicInput({ x: Number.NaN })).toBe(false)
    expect(interaction.confirmDynamicInput()).toBe(true)
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 35, y: 15 })
    expect(engine.getDiagnostics().undoDepth).toBe(historyDepth + 1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n")).toMatchObject({ x: 0, y: 0 })
  })

  it("builds click-to-place free paths with transient preview and atomic history", () => {
    const engine = createDiagramEngine()
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: true, snapToPorts: true }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginPathCreation("path", { id: 1, point: { x: 10, y: 10 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 30, y: 10 } })
    expect(interaction.getSnapshot().pathCreationPreview).toMatchObject({ vertices: [{ x: 10, y: 10 }], current: { x: 30, y: 10 } })
    interaction.pointerDown({ id: 1, point: { x: 30, y: 10 } })
    interaction.pointerUp({ id: 1, point: { x: 30, y: 10 } })
    interaction.pointerMove({ id: 1, point: { x: 30, y: 40 } })
    interaction.pointerDown({ id: 1, point: { x: 30, y: 40 } })
    interaction.pointerUp({ id: 1, point: { x: 30, y: 40 }, clickCount: 2 })
    const path = engine.getScene().entities.shapesById.get("path")
    expect(path?.points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }])
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.shapesById.has("path")).toBe(false)
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("path")?.path).toEqual([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 40 }])
    expect(engine.dispatch({ type: "removePathVertex", id: "path", index: 0 }).changed).toBe(false)
    expect(interaction.beginPathVertexHandle("path", 1, { id: 2, point: { x: 30, y: 10 } })).toBe(true)
    interaction.pointerMove({ id: 2, point: { x: 35, y: 12 } })
    expect(interaction.getPreviewGeometry("path")?.path?.[1]).toEqual({ x: 35, y: 12 })
    interaction.pointerUp({ id: 2, point: { x: 35, y: 12 } })
    expect(engine.getGeometrySnapshot("path")?.path?.[1]).toEqual({ x: 35, y: 12 })
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("path")?.path?.[1]).toEqual({ x: 30, y: 10 })
  })

  it("cardinal-locks a two-point path endpoint with live Shift and preserves compatible snaps", () => {
    const createLine = () => createDiagramEngine({
      shapes: [{ id: "line", kind: "shape", shape: "line", x: 10, y: 10, width: 100, height: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }],
      viewport: { x: 0, y: 0, width: 500, height: 500, zoom: 1 },
    })
    const scheduleFrame = (callback: () => void) => callback()

    const held = createLine()
    const heldInteraction = createDiagramInteractionController(held, { snap: { enabled: false }, scheduleFrame })
    expect(heldInteraction.beginPathVertexHandle("line", 1, { id: 1, point: { x: 110, y: 110 }, shiftKey: true })).toBe(true)
    heldInteraction.pointerMove({ id: 1, point: { x: 125, y: 100 }, shiftKey: true })
    const heldPreview = heldInteraction.getSnapshot().pathVertexPreview!.point
    expect(heldPreview.x).toBeCloseTo(10 + Math.hypot(115, 90))
    expect(heldPreview.y).toBe(10)
    heldInteraction.pointerUp({ id: 1, point: { x: 125, y: 100 }, shiftKey: true })
    expect(held.getGeometrySnapshot("line")?.path?.[1]).toEqual(heldPreview)
    expect(held.getDiagnostics().undoDepth).toBe(1)

    const toggled = createLine()
    const toggledInteraction = createDiagramInteractionController(toggled, { snap: { enabled: false }, scheduleFrame })
    toggledInteraction.beginPathVertexHandle("line", 1, { id: 2, point: { x: 110, y: 110 } })
    toggledInteraction.pointerMove({ id: 2, point: { x: 125, y: 100 } })
    expect(toggledInteraction.getSnapshot().pathVertexPreview?.point).toEqual({ x: 125, y: 100 })
    toggledInteraction.pointerMove({ id: 2, point: { x: 125, y: 100 }, shiftKey: true })
    expect(toggledInteraction.getSnapshot().pathVertexPreview?.point.y).toBe(10)
    const constrained = toggledInteraction.getSnapshot().pathVertexPreview!.point
    toggledInteraction.pointerMove({ id: 2, point: { x: 125, y: 100 }, shiftKey: false })
    expect(toggledInteraction.getSnapshot().pathVertexPreview?.point).toEqual({ x: 125, y: 100 })
    toggledInteraction.pointerUp({ id: 2, point: { x: 125, y: 100 }, shiftKey: false })
    expect(toggled.getGeometrySnapshot("line")?.path?.[1]).toEqual({ x: 125, y: 100 })
    expect(constrained.y).toBe(10)

    const vertical = createDiagramEngine({ shapes: [{ id: "line", kind: "shape", shape: "line", x: 10, y: 10, width: 100, height: 200, points: [{ x: 0, y: 0 }, { x: 100, y: 200 }] }] })
    const verticalInteraction = createDiagramInteractionController(vertical, { snap: { enabled: false }, scheduleFrame })
    verticalInteraction.beginPathVertexHandle("line", 1, { id: 3, point: { x: 110, y: 210 }, shiftKey: true })
    verticalInteraction.pointerMove({ id: 3, point: { x: 100, y: 225 }, shiftKey: true })
    const verticalPreview = verticalInteraction.getSnapshot().pathVertexPreview!.point
    expect(verticalPreview.x).toBe(10)
    expect(verticalPreview.y).toBeCloseTo(10 + Math.hypot(90, 215))
    verticalInteraction.pointerUp({ id: 3, point: { x: 100, y: 225 }, shiftKey: true })
    expect(vertical.getGeometrySnapshot("line")?.path?.[1]).toEqual(verticalPreview)

    const sourceEnd = createLine()
    const sourceInteraction = createDiagramInteractionController(sourceEnd, { snap: { enabled: false }, scheduleFrame })
    sourceInteraction.beginPathVertexHandle("line", 0, { id: 4, point: { x: 10, y: 10 }, shiftKey: true })
    sourceInteraction.pointerMove({ id: 4, point: { x: 0, y: 100 }, shiftKey: true })
    const sourcePreview = sourceInteraction.getSnapshot().pathVertexPreview!.point
    expect(sourcePreview.y).toBe(110)
    sourceInteraction.pointerUp({ id: 4, point: { x: 0, y: 100 }, shiftKey: true })
    expect(sourceEnd.getGeometrySnapshot("line")?.path?.[0]).toEqual(sourcePreview)
  })

  it("keeps grid and object snapping on the Shift-locked path endpoint axis", () => {
    const engine = createDiagramEngine({
      nodes: [{ id: "snap-owner", kind: "node", x: 154, y: 8, width: 4, height: 4, portIds: ["snap-port"] }],
      ports: [{ id: "snap-port", kind: "port", nodeId: "snap-owner", x: 1, y: 2 }],
      shapes: [{ id: "line", kind: "shape", shape: "line", x: 10, y: 10, width: 100, height: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }],
    })
    const interaction = createDiagramInteractionController(engine, { snap: { gridSize: 10, tolerancePx: 8, snapToPorts: true, snapToAlignment: false }, scheduleFrame: (callback) => callback() })
    interaction.beginPathVertexHandle("line", 1, { id: 1, point: { x: 110, y: 110 }, shiftKey: true })
    interaction.pointerMove({ id: 1, point: { x: 125, y: 100 }, shiftKey: true })
    const preview = interaction.getSnapshot().pathVertexPreview!.point
    expect(preview).toEqual({ x: 155, y: 10 })
    expect(interaction.getSnapshot().snapResult?.source).toBe("port")
    interaction.pointerUp({ id: 1, point: { x: 125, y: 100 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("line")?.path?.[1]).toEqual(preview)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("line")?.path?.[1]).toEqual({ x: 110, y: 110 })

    const gridEngine = createDiagramEngine({ shapes: [{ id: "grid-line", kind: "shape", shape: "line", x: 10, y: 10, width: 100, height: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }] })
    const gridInteraction = createDiagramInteractionController(gridEngine, { snap: { gridSize: 10, snapToPorts: false, snapToAlignment: false }, scheduleFrame: (callback) => callback() })
    gridInteraction.beginPathVertexHandle("grid-line", 1, { id: 2, point: { x: 110, y: 110 }, shiftKey: true })
    gridInteraction.pointerMove({ id: 2, point: { x: 124, y: 100 }, shiftKey: true })
    const gridPreview = gridInteraction.getSnapshot().pathVertexPreview!.point
    expect(gridPreview.y).toBe(10)
    expect(gridPreview.x % 10).toBe(0)
    expect(gridInteraction.getSnapshot().snapResult?.source).toBe("grid")
    gridInteraction.pointerUp({ id: 2, point: { x: 124, y: 100 }, shiftKey: true })
    expect(gridEngine.getGeometrySnapshot("grid-line")?.path?.[1]).toEqual(gridPreview)
  })

  it("locks click-to-place path segments to a live Shift cardinal from the last vertex", () => {
    const engine = createDiagramEngine()
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginPathCreation("shift-path", { id: 1, point: { x: 10, y: 10 } })).toBe(true)

    interaction.pointerMove({ id: 1, point: { x: 30, y: 20 }, shiftKey: true })
    expect(interaction.getSnapshot().pathCreationPreview?.current?.x).toBeCloseTo(10 + Math.hypot(20, 10))
    expect(interaction.getSnapshot().pathCreationPreview?.current?.y).toBe(10)
    interaction.pointerDown({ id: 1, point: { x: 30, y: 20 }, shiftKey: true })
    interaction.pointerUp({ id: 1, point: { x: 30, y: 20 }, shiftKey: true })
    const firstEndX = 10 + Math.hypot(20, 10)
    expect(interaction.getSnapshot().pathCreationPreview?.vertices).toEqual([{ x: 10, y: 10 }, { x: firstEndX, y: 10 }])

    // The next segment uses its newly committed vertex as the angle origin.
    interaction.pointerMove({ id: 1, point: { x: 40, y: 40 }, shiftKey: true })
    expect(interaction.getSnapshot().pathCreationPreview?.current?.x).toBe(firstEndX)
    expect(interaction.getSnapshot().pathCreationPreview?.current?.y).toBeCloseTo(10 + Math.hypot(40 - firstEndX, 30))
    // Releasing Shift immediately restores the unsnapped preview.
    interaction.pointerMove({ id: 1, point: { x: 40, y: 45 }, shiftKey: false })
    expect(interaction.getSnapshot().pathCreationPreview?.current).toEqual({ x: 40, y: 45 })
    interaction.pointerDown({ id: 1, point: { x: 40, y: 45 }, shiftKey: false })
    interaction.pointerUp({ id: 1, point: { x: 40, y: 45 }, shiftKey: false, clickCount: 2 })

    expect(engine.getGeometrySnapshot("shift-path")?.path).toEqual([{ x: 10, y: 10 }, { x: firstEndX, y: 10 }, { x: 40, y: 45 }])
    expect(engine.getDiagnostics().undoDepth).toBe(1)
  })

  it("re-latches Shift after release and Enter finishes only confirmed path vertices", () => {
    const engine = createDiagramEngine()
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    interaction.beginPathCreation("enter-path", { id: 1, point: { x: 0, y: 0 } })
    interaction.pointerMove({ id: 1, point: { x: 20, y: 10 }, shiftKey: true })
    expect(interaction.getSnapshot().pathCreationPreview?.current?.x).toBeCloseTo(Math.hypot(20, 10))
    expect(interaction.getSnapshot().pathCreationPreview?.current?.y).toBe(0)
    interaction.pointerMove({ id: 1, point: { x: 20, y: 10 }, shiftKey: false })
    expect(interaction.getSnapshot().pathCreationPreview?.current).toEqual({ x: 20, y: 10 })
    interaction.pointerDown({ id: 1, point: { x: 20, y: 10 }, shiftKey: false })
    interaction.pointerUp({ id: 1, point: { x: 20, y: 10 }, shiftKey: false })
    interaction.pointerMove({ id: 1, point: { x: 10, y: 30 }, shiftKey: true })
    expect(interaction.getSnapshot().pathCreationPreview?.current?.x).toBe(20)
    expect(interaction.getSnapshot().pathCreationPreview?.current?.y).toBeCloseTo(10 + Math.hypot(10, 20))
    interaction.pointerMove({ id: 1, point: { x: 10, y: 30 }, shiftKey: false })
    expect(interaction.confirmDynamicInput()).toBe(true)
    expect(engine.getGeometrySnapshot("enter-path")?.path).toEqual([{ x: 0, y: 0 }, { x: 20, y: 10 }])
  })

  it("uses the same Shift-constrained endpoint for click-to-place lines and their commit", () => {
    const engine = createDiagramEngine()
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    interaction.beginPathCreation("click-line", { id: 1, point: { x: 5, y: 5 } }, "line")
    interaction.pointerMove({ id: 1, point: { x: 20, y: 15 }, shiftKey: true })
    const preview = interaction.getSnapshot().pathCreationPreview!
    expect(preview.current.y).toBe(5)
    interaction.pointerDown({ id: 1, point: { x: 20, y: 15 }, shiftKey: true })
    interaction.pointerUp({ id: 1, point: { x: 20, y: 15 }, shiftKey: true })
    expect(engine.getGeometrySnapshot("click-line")?.path).toEqual([preview.vertices[0], preview.current])
    expect(engine.getDiagnostics().undoDepth).toBe(1)
  })

  it("routes click-to-place edges through bends and edits a waypoint as one undoable change", () => {
    const engine = createDiagramEngine({ nodes: [
      { id: "a", kind: "node", x: 0, y: 0, width: 20, height: 20 },
      { id: "b", kind: "node", x: 100, y: 0, width: 20, height: 20 },
    ], ports: [
      { id: "pa", nodeId: "a", x: 20, y: 10 },
      { id: "pb", nodeId: "b", x: 0, y: 10 },
    ] })
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: true, snapToPorts: true }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginEdgePathCreation("wire", { id: 1, point: { x: 20, y: 10 } })).toBe(true)
    interaction.pointerDown({ id: 1, point: { x: 50, y: 40 } })
    interaction.pointerUp({ id: 1, point: { x: 50, y: 40 } })
    interaction.pointerDown({ id: 1, point: { x: 100, y: 10 } })
    interaction.pointerUp({ id: 1, point: { x: 100, y: 10 } })
    expect(engine.getScene().entities.edgesById.get("wire")).toMatchObject({ source: { kind: "port", portId: "pa" }, target: { kind: "port", portId: "pb" } })
    expect(engine.getScene().entities.edgesById.get("wire")?.points?.length).toBeGreaterThan(0)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    const waypoint = engine.getScene().entities.edgesById.get("wire")!.points![0]!
    expect(interaction.beginEdgeWaypointHandle("wire", 0, { id: 2, point: waypoint })).toBe(true)
    interaction.pointerMove({ id: 2, point: { x: waypoint.x + 5, y: waypoint.y + 7 } })
    expect(interaction.getPreviewGeometry("wire")?.path).toContainEqual({ x: waypoint.x + 5, y: waypoint.y + 7 })
    interaction.pointerUp({ id: 2, point: { x: waypoint.x + 5, y: waypoint.y + 7 } })
    expect(engine.getDiagnostics().undoDepth).toBe(2)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("wire")?.points?.[0]).toEqual(waypoint)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.has("wire")).toBe(false)
  })

  it("applies Shift to connector click previews from the latest bend and constrains waypoint edits", () => {
    const engine = createDiagramEngine()
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginEdgePathCreation("shift-wire", { id: 1, point: { x: 0, y: 0 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 30, y: 15 }, shiftKey: true })
    expect(interaction.getSnapshot().edgeCreationPreview?.target).toMatchObject({ kind: "point", point: { y: 0 } })
    interaction.pointerDown({ id: 1, point: { x: 30, y: 15 }, shiftKey: true })
    interaction.pointerUp({ id: 1, point: { x: 30, y: 15 }, shiftKey: true })
    const firstBend = interaction.getSnapshot().edgeCreationPreview?.points.find((point) => point.y === 0 && point.x > 30)
    expect(firstBend).toBeDefined()
    interaction.pointerMove({ id: 1, point: { x: 50, y: 8 }, shiftKey: true })
    expect(interaction.getSnapshot().edgeCreationPreview?.target).toMatchObject({ kind: "point", point: { y: 0 } })
    const preview = interaction.getSnapshot().edgeCreationPreview!
    expect(interaction.finishEdgePathCreation()).toBe(true)
    expect(engine.getScene().entities.edgesById.get("shift-wire")?.points).toEqual(preview.points)
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    engine.dispatch({ type: "undo" })

    engine.dispatch({ type: "createEdge", edge: { id: "waypoint-wire", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 100 } }, points: [{ x: 50, y: 50 }] } })
    const point = { x: 50, y: 50 }
    expect(interaction.beginEdgeWaypointHandle("waypoint-wire", 0, { id: 2, point })).toBe(true)
    interaction.pointerMove({ id: 2, point: { x: 80, y: 60 }, shiftKey: true })
    const waypointPreview = interaction.getSnapshot().pathVertexPreview!.point
    expect(waypointPreview.y).toBe(50)
    expect(waypointPreview.x).toBeGreaterThan(80)
    expect(interaction.getPreviewGeometry("waypoint-wire")?.path).toContainEqual(waypointPreview)
    interaction.pointerUp({ id: 2, point: { x: 80, y: 60 }, shiftKey: true })
    expect(engine.getScene().entities.edgesById.get("waypoint-wire")?.points?.[0]).toEqual(waypointPreview)
  })

  it("drags orthogonal connector segments in parallel, preserves attachments, and commits the exact preview once", () => {
    const engine = createDiagramEngine({
      nodes: [
        { id: "a", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["pa"] },
        { id: "b", kind: "node", x: 200, y: 0, width: 20, height: 20, portIds: ["pb"] },
      ],
      ports: [
        { id: "pa", kind: "port", nodeId: "a", x: 20, y: 10 },
        { id: "pb", kind: "port", nodeId: "b", x: 0, y: 10 },
      ],
      edges: [{ id: "attached", kind: "edge", source: { kind: "port", portId: "pa" }, target: { kind: "port", portId: "pb" }, points: [{ x: 60, y: 10 }, { x: 60, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 10 }] }],
    })
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    const initial = engine.serialize()
    const undoDepth = engine.getDiagnostics().undoDepth
    expect(interaction.beginEdgeSegmentHandle("attached", 1, { id: 1, point: { x: 60, y: 45 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 80, y: 45 } })
    const preview = interaction.getSnapshot().edgeSegmentPreview!
    expect(preview).toMatchObject({ id: "attached", segmentIndex: 1, axis: "vertical" })
    expect(preview.points).toEqual([{ x: 80, y: 10 }, { x: 80, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 10 }])
    expect(interaction.getPreviewGeometry("attached")?.path).toEqual(preview.path)
    expect(engine.serialize()).toEqual(initial)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)
    interaction.pointerUp({ id: 1, point: { x: 80, y: 45 } })
    const committed = engine.getScene().entities.edgesById.get("attached")!
    expect(committed).toMatchObject({ source: { kind: "port", portId: "pa" }, target: { kind: "port", portId: "pb" }, points: preview.points })
    expect(engine.getGeometrySnapshot("attached")?.path).toEqual(preview.path)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)
    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.edgesById.get("attached")?.points).toEqual([{ x: 60, y: 10 }, { x: 60, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 10 }])
    engine.dispatch({ type: "redo" })
    expect(engine.getScene().entities.edgesById.get("attached")?.points).toEqual(preview.points)
  })

  it("keeps free endpoints movable and adds a bend at attached endpoints when dragging terminal segments", () => {
    const free = createDiagramEngine({ edges: [{ id: "free", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } } }] })
    const interaction = createDiagramInteractionController(free, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginEdgeSegmentHandle("free", 0, { id: 1, point: { x: 50, y: 0 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 50, y: 20 } })
    expect(interaction.getSnapshot().edgeSegmentPreview).toMatchObject({ path: [{ x: 0, y: 20 }, { x: 100, y: 20 }], points: [], source: { kind: "point", point: { x: 0, y: 20 } }, target: { kind: "point", point: { x: 100, y: 20 } } })
    interaction.pointerUp({ id: 1, point: { x: 50, y: 20 } })
    expect(free.getScene().entities.edgesById.get("free")).toMatchObject({ source: { point: { x: 0, y: 20 } }, target: { point: { x: 100, y: 20 } } })

    const attached = createDiagramEngine({ nodes: [{ id: "host", kind: "node", x: 0, y: 0, width: 20, height: 20, portIds: ["p"] }], ports: [{ id: "p", kind: "port", nodeId: "host", x: 20, y: 10 }], edges: [{ id: "edge", kind: "edge", source: { kind: "port", portId: "p" }, target: { kind: "point", point: { x: 100, y: 10 } }, points: [{ x: 60, y: 10 }] }] })
    const attachedInteraction = createDiagramInteractionController(attached, { snap: { enabled: false }, scheduleFrame: (callback) => callback() })
    expect(attachedInteraction.beginEdgeSegmentHandle("edge", 0, { id: 2, point: { x: 40, y: 10 } })).toBe(true)
    attachedInteraction.pointerMove({ id: 2, point: { x: 40, y: 0 } })
    expect(attachedInteraction.getSnapshot().edgeSegmentPreview?.path).toEqual([{ x: 20, y: 10 }, { x: 20, y: 0 }, { x: 60, y: 0 }, { x: 100, y: 0 }])
    const beforeCancel = attached.serialize()
    attachedInteraction.cancel()
    expect(attached.serialize()).toEqual(beforeCancel)
    expect(attached.getDiagnostics().undoDepth).toBe(0)
  })

  it("applies grid snapping to segment drags identically in preview and commit", () => {
    const engine = createDiagramEngine({ edges: [{ id: "line", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } } }] })
    const interaction = createDiagramInteractionController(engine, { snap: { gridSize: 10, kinds: ["grid"] }, scheduleFrame: (callback) => callback() })
    expect(interaction.beginEdgeSegmentHandle("line", 0, { id: 1, point: { x: 50, y: 0 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 50, y: 17 } })
    const preview = interaction.getSnapshot().edgeSegmentPreview!
    expect(preview.path).toEqual([{ x: 0, y: 20 }, { x: 100, y: 20 }])
    expect(interaction.getSnapshot().snapResult).toMatchObject({ snapped: true, source: "grid" })
    interaction.pointerUp({ id: 1, point: { x: 50, y: 17 } })
    expect(engine.getGeometrySnapshot("line")?.path).toEqual(preview.path)
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("line")?.path).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }])
  })

  it("creates major circular arcs through three points and preserves them through scene round trips", () => {
    const arc = createCircularArc({ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 })
    expect(arc.ok).toBe(true)
    if (!arc.ok) return
    expect(Math.abs(arc.value.segments[0]!.kind === "arc" ? arc.value.segments[0]!.sweepAngle : 0)).toBeGreaterThan(Math.PI)
    const engine = createDiagramEngine()
    expect(engine.dispatch({ type: "createPath", path: { id: "arc", kind: "path", contours: [arc.value] } }).changed).toBe(true)
    const geometry = engine.getGeometrySnapshot("arc")
    expect(geometry?.bounds.x).toBeCloseTo(-10)
    expect(geometry?.bounds.y).toBeCloseTo(-10)
    const beforeRotate = geometry?.pathContours?.[0]?.segments[0]
    expect(engine.dispatch({ type: "rotateEntities", entries: [{ id: "arc", rotation: 90 }] }).changed).toBe(true)
    expect(engine.getGeometrySnapshot("arc")?.pathContours?.[0]?.segments[0]).not.toEqual(beforeRotate)
    engine.dispatch({ type: "undo" })
    const saved = engine.serialize()
    const restored = createDiagramEngine(deserializeScene(saved))
    expect(restored.getGeometrySnapshot("arc")?.pathContours).toEqual(geometry?.pathContours)
    expect(createCircularArc({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 })).toMatchObject({ ok: false, code: "degenerate-arc" })
  })

  it("trims line fragments, ignores tangencies and returns outside circle arcs", () => {
    expect(trimLineByCrossing([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 5, y: -5 }, { x: 5, y: 5 }], { x: 9, y: 0 })).toMatchObject({ ok: true, value: [{ x: 0, y: 0 }, { x: 5, y: 0 }] })
    expect(intersectLineSegments({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 })).toBeNull()
    const arcs = trimCircleOutsideRect({ x: 0, y: 0 }, 10, { x: 5, y: -4, width: 10, height: 8 })
    expect(arcs.ok && arcs.value.length).toBe(1)
    expect(arcs.ok && arcs.value.every((contour) => contour.segments[0]?.kind === "arc" && contour.closed === false)).toBe(true)
    expect(trimCircleOutsideRect({ x: 0, y: 0 }, 10, { x: -20, y: -20, width: 40, height: 40 })).toMatchObject({ ok: true, value: [] })
    expect(trimCircleOutsideRect({ x: 5, y: 0 }, 10, { x: 0, y: -10, width: 20, height: 20 }).value).toHaveLength(1)
  })

  it("calculates selection sweep trims for multiple targets and commits the exact preview atomically", () => {
    const engine = createDiagramEngine({ shapes: [
      { id: "first", kind: "shape", shape: "line", x: 0, y: 20, width: 100, height: 0, metadata: { stroke: "red", custom: 7 } },
      { id: "second", kind: "shape", shape: "line", x: 0, y: 40, width: 100, height: 0 },
      { id: "untouched", kind: "shape", shape: "line", x: 0, y: 60, width: 100, height: 0 },
      { id: "boundary", kind: "shape", shape: "line", x: 70, y: 0, width: 0, height: 55 },
    ] })
    const originalUntouched = engine.getScene().entities.shapesById.get("untouched")
    const input = { targetIds: ["first", "second"], stroke: [{ x: 40, y: 50 }, { x: 40, y: 0 }], tolerance: 0.25 }
    const result = trimSelectionByStroke(engine.serialize(), input)
    expect(result.findings).toEqual([])
    expect(result.updates).toHaveLength(2)
    expect(result.targets[0]).toMatchObject({ changed: true, cutPoints: [{ x: 40, y: 20 }] })
    expect(result.targets[0]?.retained).toEqual([
      { segments: [{ kind: "line", start: { x: 0, y: 20 }, end: { x: 40, y: 20 } }], closed: false },
      { segments: [{ kind: "line", start: { x: 70, y: 20 }, end: { x: 100, y: 20 } }], closed: false },
    ])

    const batch = engine.dispatchBatch(result.updates)
    expect(batch).toMatchObject({ ok: true, changed: true, affectedIds: ["first", "second"] })
    expect(engine.getDiagnostics().undoDepth).toBe(1)
    expect(engine.getScene().entities.shapesById.get("first")).toMatchObject({ metadata: { stroke: "red", custom: 7 } })
    expect(engine.getScene().entities.shapesById.get("untouched")).toBe(originalUntouched)
    expect(engine.getGeometrySnapshot("first")?.pathContours).toEqual(createDiagramEngine({ shapes: [result.targets[0]!.preview!] }).getGeometrySnapshot("first")?.pathContours)
    engine.dispatch({ type: "undo" })
    expect(engine.serialize().shapes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "first", x: 0, y: 20, width: 100, metadata: { stroke: "red", custom: 7 } }),
      expect.objectContaining({ id: "second", x: 0, y: 40, width: 100 }),
    ]))
    engine.dispatch({ type: "redo" })
    expect(engine.getGeometrySnapshot("first")?.pathContours).toEqual(createDiagramEngine({ shapes: [result.targets[0]!.preview!] }).getGeometrySnapshot("first")?.pathContours)
  })

  it("requires a separate trim boundary for a selected rectangle and leaves it unchanged when missing", () => {
    const engine = createDiagramEngine({ shapes: [
      { id: "selected-rect", kind: "shape", shape: "rect", x: 0, y: 0, width: 100, height: 80, fill: "#abc", stroke: "#123", metadata: { equipment: "Q1" } },
      { id: "unselected-rect", kind: "shape", shape: "rect", x: 120, y: 0, width: 100, height: 80 },
    ] })
    const before = engine.serialize()
    const result = trimSelectionByStroke(before, { targetIds: ["selected-rect"], stroke: [{ x: 50, y: -10 }, { x: 50, y: 90 }], tolerance: 0.01 })
    expect(result.targets[0]).toMatchObject({ changed: false, finding: { code: "unsupported-target" } })
    expect(result.updates).toEqual([])
    expect(engine.getScene().entities.shapesById.get("unselected-rect")).toEqual(before.shapes?.find((shape) => shape.id === "unselected-rect"))
    expect(engine.serialize()).toEqual(before)
  })

  it("intersects and splits cubic segments exactly with matching preview and commit geometry", () => {
    const engine = createDiagramEngine({ shapes: [
      { id: "curve", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 75, pathContours: [{ closed: false, segments: [{ kind: "cubic", start: { x: 0, y: 0 }, control1: { x: 0, y: 100 }, control2: { x: 100, y: 100 }, end: { x: 100, y: 0 } }] }] },
      { id: "boundary", kind: "shape", shape: "line", x: 25, y: -10, width: 0, height: 100 },
    ] })
    const result = trimSelectionByStroke(engine.serialize(), { targetIds: ["curve"], stroke: [{ x: 50, y: -10 }, { x: 50, y: 110 }], tolerance: 0.01 })
    expect(result.findings).toEqual([])
    expect(result.targets[0]?.cutPoints[0]).toMatchObject({ x: 50, y: 75 })
    const kept = result.targets[0]?.retained[0]?.segments[0]
    expect(kept?.kind).toBe("cubic")
    expect(result.targets[0]?.boundaryIntersections[0]?.point.x).toBeCloseTo(25)
    expect(engine.dispatchBatch(result.updates).ok).toBe(true)
    expect(engine.getGeometrySnapshot("curve")?.pathContours).toEqual(createDiagramEngine({ shapes: [result.targets[0]!.preview!] }).getGeometrySnapshot("curve")?.pathContours)
  })

  it("returns no-boundary or unsupported-target findings for circular and native rectangle targets", () => {
    const circle = createDiagramEngine({ shapes: [{ id: "circle", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 100, pathContours: [{ closed: true, segments: [{ kind: "arc", center: { x: 50, y: 50 }, radius: 40, startAngle: 0, sweepAngle: Math.PI * 2 }] }] }] })
    const circleResult = trimSelectionByStroke(circle.serialize(), { targetIds: ["circle"], stroke: [{ x: 50, y: 0 }, { x: 50, y: 100 }], tolerance: 0.01 })
    expect(circleResult.targets[0]).toMatchObject({ changed: false, finding: { code: "no-boundary" }, sweepCrossings: [{ x: 50, y: 10 }, { x: 50, y: 90 }] })

    const rotation = 37
    const center = { x: 60, y: 60 }
    const transform = (point: DiagramPoint) => rotatePoint(point, center, rotation)
    const transformed = createDiagramEngine({ shapes: [{ id: "rotated-rect", kind: "shape", shape: "rect", x: 10, y: 20, width: 100, height: 80, rotation, flipX: true }] })
    const transformedResult = trimSelectionByStroke(transformed.serialize(), { targetIds: ["rotated-rect"], stroke: [transform({ x: 60, y: 0 }), transform({ x: 60, y: 120 })], tolerance: 0.01 })
    expect(transformedResult.targets[0]).toMatchObject({ changed: false, finding: { code: "unsupported-target" } })
  })

  it("returns typed findings without changing ambiguous holes and self-crossing strokes", () => {
    const donut = createDiagramEngine({ shapes: [{ id: "donut", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 100, pathContours: [
      { closed: true, segments: [{ kind: "line", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, { kind: "line", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } }, { kind: "line", start: { x: 100, y: 100 }, end: { x: 0, y: 100 } }, { kind: "line", start: { x: 0, y: 100 }, end: { x: 0, y: 0 } }] },
      { closed: true, hole: true, segments: [{ kind: "line", start: { x: 40, y: 40 }, end: { x: 60, y: 40 } }, { kind: "line", start: { x: 60, y: 40 }, end: { x: 60, y: 60 } }, { kind: "line", start: { x: 60, y: 60 }, end: { x: 40, y: 60 } }, { kind: "line", start: { x: 40, y: 60 }, end: { x: 40, y: 40 } }] },
    ] }] })
    const before = donut.serialize()
    const result = trimSelectionByStroke(before, { targetIds: ["donut"], stroke: [{ x: 50, y: -10 }, { x: 50, y: 110 }], tolerance: 0.01 })
    expect(result.targets[0]).toMatchObject({ changed: false, finding: { code: "no-boundary" } })
    expect(result.updates).toEqual([])
    expect(donut.serialize()).toEqual(before)
    const crossingStroke = trimSelectionByStroke(before, { targetIds: ["donut"], stroke: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }], tolerance: 0.01 })
    expect(crossingStroke.findings[0]?.code).toBe("self-intersecting-stroke")
    expect(crossingStroke.updates).toEqual([])
  })

  it("selects the first crossing in gesture direction and handles transformed lines and exact arcs", () => {
    const multi = createDiagramEngine({ shapes: [
      { id: "multi", kind: "shape", shape: "line", x: 0, y: 50, width: 100, height: 0 },
      { id: "left-boundary", kind: "shape", shape: "line", x: 10, y: 40, width: 0, height: 20 },
      { id: "right-boundary", kind: "shape", shape: "line", x: 90, y: 40, width: 0, height: 20 },
    ] })
    const first = trimSelectionByStroke(multi.serialize(), { targetIds: ["multi"], stroke: [{ x: 20, y: 40 }, { x: 20, y: 60 }, { x: 80, y: 60 }, { x: 80, y: 40 }], tolerance: 0.01 })
    expect(first.targets[0]?.sweepCrossings).toEqual([{ x: 20, y: 50 }, { x: 80, y: 50 }])
    expect(first.targets[0]?.boundaryIntersections).toEqual([{ point: { x: 10, y: 50 }, boundaryId: "left-boundary" }, { point: { x: 90, y: 50 }, boundaryId: "right-boundary" }])
    expect(first.targets[0]?.retained).toEqual([
      { segments: [{ kind: "line", start: { x: 0, y: 50 }, end: { x: 10, y: 50 } }], closed: false },
      { segments: [{ kind: "line", start: { x: 20, y: 50 }, end: { x: 80, y: 50 } }], closed: false },
      { segments: [{ kind: "line", start: { x: 90, y: 50 }, end: { x: 100, y: 50 } }], closed: false },
    ])

    const transformed = createDiagramEngine({ shapes: [
      { id: "rotated", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 40, rotation: 90, flipX: true, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] },
      { id: "rotated-boundary", kind: "shape", shape: "line", x: 0, y: 50, width: 100, height: 0 },
    ] })
    const transformedResult = trimSelectionByStroke(transformed.serialize(), { targetIds: ["rotated"], stroke: [{ x: 0, y: 20 }, { x: 100, y: 20 }], tolerance: 0.01 })
    expect(transformedResult.targets[0]?.sweepCrossings[0]?.x).toBeCloseTo(50)
    expect(transformedResult.targets[0]?.sweepCrossings[0]?.y).toBeCloseTo(20)
    expect(transformedResult.targets[0]?.boundaryIntersections[0]?.point).toEqual({ x: 50, y: 50 })
    expect(transformed.dispatchBatch(transformedResult.updates).ok).toBe(true)

    const arc = createDiagramEngine({ shapes: [{ id: "arc", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 100, pathContours: [{ segments: [{ kind: "arc", center: { x: 50, y: 50 }, radius: 40, startAngle: 0, sweepAngle: Math.PI }], closed: false }] }] })
    const arcResult = trimSelectionByStroke(arc.serialize(), { targetIds: ["arc"], stroke: [{ x: 50, y: 0 }, { x: 50, y: 100 }], tolerance: 0.01 })
    expect(arcResult.targets[0]?.sweepCrossings[0]?.y).toBeCloseTo(90)
    expect(arcResult.targets[0]?.finding?.code).toBe("no-boundary")

    const polyline = createDiagramEngine({ shapes: [{ id: "poly", kind: "shape", shape: "line", x: 0, y: 0, width: 100, height: 40, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 30 }, { x: 0, y: 30 }] }] })
    const polylineResult = trimSelectionByStroke(polyline.serialize(), { targetIds: ["poly"], stroke: [{ x: 40, y: 0 }, { x: 40, y: 40 }], tolerance: 0.01 })
    expect(polylineResult.targets[0]?.cutPoints).toEqual([{ x: 40, y: 10 }, { x: 40, y: 30 }])
    expect(polylineResult.targets[0]?.finding?.code).toBe("no-boundary")
  })

  it("returns findings and leaves unsupported, connected, anchored, invalid, or untouched targets unchanged", () => {
    const engine = createDiagramEngine({
      shapes: [
        { id: "line", kind: "shape", shape: "line", x: 0, y: 20, width: 100, height: 0 },
        { id: "box", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 },
        { id: "locked", kind: "shape", shape: "line", x: 0, y: 40, width: 100, height: 0, metadata: { locked: true } },
        { id: "anchored", kind: "shape", shape: "line", x: 0, y: 60, width: 100, height: 0 },
      ],
      ports: [{ id: "p", kind: "port", hostId: "anchored", anchor: { kind: "vertex", index: 0 } }],
      edges: [{ id: "wire", kind: "edge", source: { kind: "port", portId: "p" }, target: { kind: "point", point: { x: 100, y: 60 } } }],
    })
    const before = engine.serialize()
    const stroke = [{ x: 50, y: 0 }, { x: 50, y: 80 }]
    const result = trimSelectionByStroke(before, { targetIds: ["line", "box", "locked", "anchored", "wire", "missing"], stroke, tolerance: 0.01 })
    expect(result.findings.map(({ targetId, code }) => [targetId, code])).toEqual([
      ["line", "no-boundary"], ["box", "unsupported-target"], ["locked", "locked-target"], ["anchored", "anchored-host"], ["wire", "connected-edge"], ["missing", "unsupported-target"],
    ])
    expect(result.updates).toEqual([])
    expect(trimSelectionByStroke(before, { targetIds: ["line"], stroke: [{ x: 10, y: 21 }, { x: 90, y: 21 }], tolerance: 0 }).targets[0]?.finding?.code).toBe("no-intersection")
    expect(trimSelectionByStroke(before, { targetIds: ["line"], stroke: [{ x: 20, y: 20 }, { x: 80, y: 20 }], tolerance: 0 }).targets[0]?.finding?.code).toBe("ambiguous-intersection")
    expect(trimSelectionByStroke(before, { targetIds: ["line"], stroke: [{ x: 0, y: 0 }], tolerance: 0 }).findings[0]?.code).toBe("invalid-input")
    expect(engine.serialize()).toEqual(before)

    const arcScene = { shapes: [{ id: "arc", kind: "shape" as const, shape: "line", x: 0, y: 0, width: 100, height: 100, pathContours: [{ segments: [{ kind: "arc" as const, center: { x: 50, y: 50 }, radius: 40, startAngle: 0, sweepAngle: Math.PI }], closed: false }] }] }
    expect(trimSelectionByStroke(arcScene, { targetIds: ["arc"], stroke: [{ x: 0, y: 90 }, { x: 100, y: 90 }], tolerance: 0.01 }).targets[0]?.finding?.code).toBe("ambiguous-intersection")
  })

  it("joins selected shoulders and subtracts rectangle contours from circles with holes", () => {
    const joined = trimAndJoinLines([{ x: 0, y: 5 }, { x: 10, y: 5 }], [{ x: 5, y: 0 }, { x: 5, y: 10 }], { x: 0, y: 5 }, { x: 5, y: 10 })
    expect(joined).toMatchObject({ ok: true, value: { closed: false, segments: [{ kind: "line", start: { x: 0, y: 5 } }, { kind: "line", end: { x: 5, y: 10 } }] } })
    const subtraction = subtractRectFromCircle({ x: 0, y: 0 }, 20, { x: -4, y: -4, width: 8, height: 8 })
    expect(subtraction.ok && subtraction.value).toHaveLength(2)
    expect(subtraction.ok && subtraction.value[1]?.hole).toBe(true)
    if (subtraction.ok) {
      const engine = createDiagramEngine()
      expect(engine.dispatch({ type: "createPath", path: { id: "donut", kind: "path", contours: subtraction.value } }).changed).toBe(true)
      expect(engine.hitTest({ x: 0, y: 0 })).toBeNull()
      expect(engine.hitTest({ x: 15, y: 0 })?.id).toBe("donut")
      expect(createDiagramEngine(deserializeScene(engine.serialize())).getGeometrySnapshot("donut")?.pathContours).toEqual(subtraction.value)
    }
    const partial = subtractRectFromCircle({ x: 0, y: 0 }, 20, { x: 10, y: -5, width: 15, height: 10 })
    expect(partial.ok).toBe(true)
    expect(partial.ok && partial.value.length).toBeGreaterThan(0)
    expect(partial.ok && partial.value.every((contour) => contour.closed === true)).toBe(true)
    expect(subtractRectFromCircle({ x: 0, y: 0 }, 20, { x: 30, y: 30, width: 5, height: 5 })).toMatchObject({ ok: true, value: [{ closed: true }] })
    expect(subtractRectFromCircle({ x: 0, y: 0 }, 20, { x: -30, y: -30, width: 60, height: 60 })).toMatchObject({ ok: true, value: [] })
    expect(trimAndJoinLines([{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 2 }, { x: 1, y: 2 }], { x: 0, y: 0 }, { x: 0, y: 2 })).toMatchObject({ ok: false, code: "no-intersection" })
  })

  it("parses, validates, bounds, transforms, and round-trips exact cubic path geometry", () => {
    const parsed = parseSvgPathData("M 0 0 C 0 100 100 100 100 0 Z M 30 20 L 70 20 L 50 50 Z")
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value).toHaveLength(2)
    expect(parsed.value[0]?.segments[0]).toEqual({ kind: "cubic", start: { x: 0, y: 0 }, control1: { x: 0, y: 100 }, control2: { x: 100, y: 100 }, end: { x: 100, y: 0 } })

    const engine = createDiagramEngine()
    expect(engine.dispatchBatch([{ type: "createPath", path: { id: "cubic", kind: "path", contours: parsed.value } }]).ok).toBe(true)
    const geometry = engine.getGeometrySnapshot("cubic")!
    expect(geometry.bounds.y).toBe(0)
    expect(geometry.bounds.height).toBeCloseTo(75)
    expect(engine.hitTest({ x: 50, y: 75 }, 1)?.id).toBe("cubic")
    expect(engine.hitTest({ x: 50, y: 90 }, 1)).toBeNull()
    const saved = engine.serialize()
    const restored = createDiagramEngine(deserializeScene(saved))
    expect(restored.getGeometrySnapshot("cubic")?.pathContours).toEqual(parsed.value)
    engine.dispatch({ type: "setSelection", selection: { ids: ["cubic"], primaryId: "cubic" } })
    engine.importClipboard(engine.exportSelection(), { x: 40, y: 20 })
    const copyId = [...engine.getScene().entities.shapesById.keys()].find((id) => id !== "cubic")!
    expect(engine.getScene().entities.shapesById.get(copyId)?.pathContours).toEqual(parsed.value)
    engine.dispatch({ type: "groupEntities", id: "curve-group", ids: ["cubic", copyId] })
    expect(engine.getScene().entities.groupsById.get("curve-group")?.childIds).toEqual(["cubic", copyId])
    engine.dispatch({ type: "ungroupEntities", ids: ["curve-group"] })
    expect(engine.getScene().entities.shapesById.get("cubic")?.pathContours?.[0]?.segments[0]?.kind).toBe("cubic")

    const revision = engine.getDocumentRevision()
    const rejected = engine.dispatchBatch([{ type: "updateShapePath", id: "cubic", pathContours: parsed.value }], { expectedRevision: revision - 1 })
    expect(rejected).toMatchObject({ ok: false, reason: "revision-mismatch" })
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.dispatch({ type: "resizeEntities", entries: [{ id: "cubic", width: 200, height: 150 }] }).changed).toBe(true)
    expect(engine.getGeometrySnapshot("cubic")?.pathContours?.[0]?.segments[0]).toMatchObject({ control1: { x: 0, y: 200 }, control2: { x: 200, y: 200 } })
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("cubic")?.pathContours).toEqual(parsed.value)
    expect(engine.dispatch({ type: "rotateEntities", entries: [{ id: "cubic", rotation: 90 }] }).changed).toBe(true)
    expect(engine.getGeometrySnapshot("cubic")?.pathContours?.[0]?.segments[0]?.kind).toBe("cubic")
    engine.dispatch({ type: "undo" })
    expect(engine.getGeometrySnapshot("cubic")?.pathContours).toEqual(parsed.value)
  })

  it("rejects malformed or discontinuous cubic contours and trims valid cubic segments", () => {
    expect(parseSvgPathData("M 0 0 Q 1 2 3 4")).toMatchObject({ ok: false, code: "unsupported-geometry" })
    expect(() => createDiagramEngine({ shapes: [{ id: "bad", kind: "shape", shape: "line", x: 0, y: 0, width: 3, height: 3, pathContours: [{ closed: false, segments: [
      { kind: "cubic", start: { x: 0, y: 0 }, control1: { x: 0, y: Number.NaN }, control2: { x: 2, y: 2 }, end: { x: 3, y: 3 } },
    ] }] }] })).toThrow(TypeError)
    expect(() => createDiagramEngine({ shapes: [{ id: "gap", kind: "shape", shape: "line", x: 0, y: 0, width: 3, height: 1, pathContours: [{ closed: false, segments: [
      { kind: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
      { kind: "cubic", start: { x: 2, y: 0 }, control1: { x: 2, y: 1 }, control2: { x: 3, y: 1 }, end: { x: 3, y: 0 } },
    ] }] }] })).toThrow(TypeError)
    const engine = createDiagramEngine({ shapes: [
      { id: "curve", kind: "shape", shape: "line", x: 0, y: 0, width: 30, height: 0, pathContours: [{ closed: false, segments: [{ kind: "cubic", start: { x: 0, y: 0 }, control1: { x: 10, y: 20 }, control2: { x: 20, y: 20 }, end: { x: 30, y: 0 } }] }] },
      { id: "boundary", kind: "shape", shape: "line", x: 25, y: -5, width: 0, height: 30 },
    ] })
    const trim = trimSelectionByStroke(engine.serialize(), { targetIds: ["curve"], stroke: [{ x: 10, y: 25 }, { x: 10, y: -5 }], tolerance: 0.1 })
    expect(trim.targets[0]?.changed).toBe(true)
    expect(trim.targets[0]?.retained).toHaveLength(2)
    expect(trim.targets[0]?.retained.every((contour) => contour.segments.length === 1 && contour.segments[0]?.kind === "cubic")).toBe(true)
  })

  it("locks user edits and active gestures while allowing authoritative scene replacement", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "editable", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }] })
    const interaction = createDiagramInteractionController(engine, { snap: { enabled: false } })
    expect(interaction.beginPathCreation("pending", { id: 1, point: { x: 0, y: 0 } })).toBe(true)
    interaction.pointerMove({ id: 1, point: { x: 30, y: 30 } })
    expect(interaction.getSnapshot().pathCreationPreview).not.toBeNull()
    engine.dispatch({ type: "updateEntities", updates: [{ id: "editable", metadata: { revision: 1 } }] })
    engine.dispatch({ type: "undo" })
    const original = engine.serialize()
    const revision = engine.getDocumentRevision()
    const undoDepth = engine.getDiagnostics().undoDepth
    engine.setEditingLocked(true)
    expect(interaction.getSnapshot()).toMatchObject({ editingLocked: true, pathCreationPreview: null })
    expect(interaction.getSnapshot().active).toBe(false)
    interaction.pointerUp({ id: 1, point: { x: 30, y: 30 } })
    expect(interaction.beginLineCreation("blocked", { id: 2, point: { x: 0, y: 0 } })).toBe(false)
    expect(engine.dispatch({ type: "createTable", table: { id: "blocked-table", kind: "table", x: 0, y: 0, width: 50, height: 30, rowCount: 1, columnCount: 1 } })).toMatchObject({ changed: false, reason: "scene-locked" })
    expect(engine.dispatch({ type: "undo" })).toMatchObject({ changed: false, reason: "scene-locked" })
    expect(engine.dispatch({ type: "redo" })).toMatchObject({ changed: false, reason: "scene-locked" })
    expect(engine.dispatch({ type: "updateEntities", updates: [{ id: "editable", metadata: { blocked: true } }] })).toMatchObject({ changed: false, reason: "scene-locked" })
    expect(engine.dispatch({ type: "deleteEntities", ids: ["editable"] })).toMatchObject({ changed: false, reason: "scene-locked" })
    expect(engine.dispatchBatch([{ type: "createPath", path: { id: "blocked-path", kind: "path", contours: [] } }])).toMatchObject({ ok: false, reason: "scene-locked" })
    expect(engine.serialize()).toEqual(original)
    expect(engine.getDocumentRevision()).toBe(revision)
    expect(engine.getDiagnostics().undoDepth).toBe(undoDepth)

    engine.transact(() => ({ ...original, shapes: [{ id: "server", kind: "shape", shape: "rect", x: 1, y: 2, width: 10, height: 10 }] }))
    expect(engine.isEditingLocked()).toBe(true)
    expect(engine.getScene().entities.shapesById.has("server")).toBe(true)
    engine.setEditingLocked(false)
    expect(interaction.getSnapshot().editingLocked).toBe(false)
    expect(engine.dispatch({ type: "createPath", path: { id: "after-unlock", kind: "path", contours: [{ closed: false, segments: [{ kind: "line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }] }] } }).changed).toBe(true)
    interaction.dispose()
  })
})
