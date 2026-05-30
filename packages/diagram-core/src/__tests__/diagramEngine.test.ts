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

  it("selects groups with a marquee drag from empty space", () => {
    const callbacks: Array<() => void> = []
    const engine = createDiagramEngine(scene)
    const controller = createDiagramInteractionController(engine, { scheduleFrame: (callback) => callbacks.push(callback) })

    controller.pointerDown({ id: 1, point: { x: -20, y: -20 } })
    controller.pointerMove({ id: 1, point: { x: 190, y: 150 } })
    callbacks[0]()

    expect(controller.getSnapshot().marquee).toEqual({ x: -20, y: -20, width: 210, height: 170 })

    controller.pointerUp({ id: 1, point: { x: 190, y: 150 } })

    expect(engine.getScene().selection.ids).toEqual(["n1", "s1", "t1", "e1"])
    expect(engine.getScene().selection.primaryId).toBe("n1")
    expect(engine.getScene().selection.ids).not.toContain("p1")
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

  it("snaps to ports, alignment, angles, and grid", () => {
    const engine = createDiagramEngine(scene)

    expect(engine.snapPoint({ x: 101, y: 31 }, { radius: 8 }).source).toBe("port")
    expect(engine.snapPoint({ x: 50, y: 200 }, { radius: 3 }).source).toBe("alignment")
    expect(engine.snapPoint({ x: 10, y: 7 }, { angleConstraint: 45 }).source).toBe("angle")
    expect(engine.snapPoint({ x: 13, y: 17 }, { gridSize: 10 })).toEqual({ point: { x: 10, y: 20 }, snapped: true, source: "grid" })
  })
})
