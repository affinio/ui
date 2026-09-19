import { describe, expect, it } from "vitest"
import { createDiagramEngine, createDiagramInteractionController, deserializeScene, screenToWorld, serializeScene, worldToScreen, zoomViewportAt } from ".."
import type { DiagramSceneInput } from ".."

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

  it("publishes committed history state and rejects locked text edits", () => {
    const engine = createDiagramEngine({
      texts: [{ id: "locked-text", kind: "text", x: 0, y: 0, text: "before", metadata: { locked: true } }],
    })
    const states: boolean[] = []
    engine.subscribe(() => states.push(engine.canUndo()))
    engine.dispatch({ type: "editText", id: "locked-text", text: "after" })
    expect(engine.getScene().entities.textsById.get("locked-text")?.text).toBe("before")

    engine.dispatch({ type: "setViewport", viewport: { x: 1 } })
    expect(states.at(-1)).toBe(true)
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
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

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

  it("previews and commits resize-handle gestures as one history entry", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    expect(controller.beginResizeHandle("n1", "se", { id: 1, point: { x: 100, y: 60 } })).toBe(true)
    controller.pointerMove({ id: 1, point: { x: 130, y: 80 } })
    callbacks[0]()

    expect(controller.getSnapshot().resizePreview).toEqual({ id: "n1", width: 130, height: 80 })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 100, height: 60 })

    controller.pointerUp({ id: 1, point: { x: 130, y: 80 } })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 130, height: 80 })
    expect(engine.getScene().entities.portsById.get("p1")).toMatchObject({ x: 130, y: 40 })
    expect(controller.getCommitCount()).toBe(1)

    engine.dispatch({ type: "undo" })
    expect(engine.getScene().entities.nodesById.get("n1")).toMatchObject({ width: 100, height: 60 })
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
})
