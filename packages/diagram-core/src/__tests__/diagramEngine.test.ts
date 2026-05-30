import { describe, expect, it } from "vitest"
import { createDiagramEngine, createDiagramInteractionController, deserializeScene, serializeScene } from ".."
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

  it("tracks changed ids and invalidates only dependent geometry", () => {
    const engine = createDiagramEngine(scene)
    engine.queryVisible({ x: -10, y: -10, width: 500, height: 200 })
    const readsBefore = engine.getGeometryReadCount()
    const n2Version = engine.getEntityVersion("n2")

    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 5 } })

    expect(engine.getLastChange().changedIds).toEqual(new Set(["n1"]))
    expect(engine.getLastChange().invalidatedIds).toEqual(new Set(["n1", "p1", "e1"]))
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
    expect(engine.snapPoint({ x: 10, y: 7 }, { angleConstraint: 45 }).source).toBe("angle")
    expect(engine.snapPoint({ x: 13, y: 17 }, { gridSize: 10 })).toEqual({ point: { x: 10, y: 20 }, snapped: true, source: "grid" })
  })
})
