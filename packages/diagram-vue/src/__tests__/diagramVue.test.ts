import { describe, expect, it, vi } from "vitest"
import { effectScope, shallowRef } from "vue"
import { createDiagramEngine, type DiagramSceneInput } from "@affino/diagram-core"
import { getDomEntityStyle, getSvgEntityProps, useDiagramEngine, useDiagramPointerController, useDiagramSelection, useDiagramTextEditor, useDiagramViewport, useDiagramVisibleEntities } from ".."

const scene: DiagramSceneInput = {
  nodes: [
    { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 60, portIds: ["p1"] },
    { id: "n2", kind: "node", x: 400, y: 0, width: 100, height: 60, portIds: ["p2"] },
  ],
  ports: [
    { id: "p1", kind: "port", nodeId: "n1", x: 100, y: 30 },
    { id: "p2", kind: "port", nodeId: "n2", x: 0, y: 30 },
  ],
  edges: [
    { id: "e1", kind: "edge", source: { kind: "port", portId: "p1" }, target: { kind: "port", portId: "p2" } },
  ],
  texts: [
    { id: "t1", kind: "text", x: 10, y: 80, text: "Label" },
  ],
  shapes: [
    { id: "s1", kind: "shape", shape: "rect", x: 160, y: 20, width: 80, height: 40 },
  ],
  viewport: { x: 0, y: 0, width: 260, height: 160, zoom: 1 },
}

describe("diagram-vue", () => {
  it("syncs engine state and disposes subscriptions with Vue scope", () => {
    const engine = createDiagramEngine(scene)
    const scope = effectScope()
    const listener = vi.fn()
    let controller!: ReturnType<typeof useDiagramEngine>
    scope.run(() => {
      controller = useDiagramEngine({ engine })
      controller.engine.subscribe(listener)
    })

    controller.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 0 } })
    expect(controller.scene.value.entities.nodesById.get("n1")?.x).toBe(10)

    scope.stop()
    const previousRevision = controller.scene.value.revision
    engine.dispatch({ type: "moveNode", id: "n1", delta: { x: 10, y: 0 } })
    expect(controller.scene.value.revision).toBe(previousRevision)
  })

  it("exposes selection helpers without rebuilding business rules", () => {
    const controller = useDiagramEngine(scene)
    const selection = useDiagramSelection(controller)

    selection.setSelection(["n1"], "n1")

    expect(selection.isSelected("n1")).toBe(true)
    expect(selection.selection.value.primaryId).toBe("n1")

    selection.clearSelection()
    expect(selection.selection.value.ids).toEqual([])
  })

  it("updates viewport from ResizeObserver and cleans observers", () => {
    const controller = useDiagramEngine(scene)
    const observed = vi.fn()
    const disconnected = vi.fn()
    let callback!: (entries: ReadonlyArray<{ contentRect: { width: number; height: number } }>) => void
    class FakeResizeObserver {
      constructor(next: typeof callback) {
        callback = next
      }
      observe = observed
      disconnect = disconnected
    }
    const element = document.createElement("div")
    const viewport = useDiagramViewport(controller, { element, resizeObserver: FakeResizeObserver })

    callback([{ contentRect: { width: 640, height: 480 } }])

    expect(observed).toHaveBeenCalledWith(element)
    expect(viewport.viewport.value.width).toBe(640)
    expect(viewport.viewport.value.height).toBe(480)

    viewport.dispose()
    expect(disconnected).toHaveBeenCalled()
  })

  it("projects visible SVG and DOM render entities from core queries", () => {
    const controller = useDiagramEngine(scene)
    const visible = useDiagramVisibleEntities(controller)

    expect(visible.projection.value.nodes.map((entity) => entity.id)).toContain("n1")
    expect(visible.projection.value.nodes.map((entity) => entity.id)).not.toContain("n2")
    expect(visible.projection.value.texts[0]?.layer).toBe("svg")
    expect(visible.projection.value.edges[0]?.layer).toBe("svg")

    const text = visible.projection.value.texts[0]!
    expect(getSvgEntityProps(text)).toMatchObject({ x: 10, y: 80, "data-diagram-kind": "text" })
    expect(getDomEntityStyle(text).transform).toBe("translate(10px, 80px)")
    const node = visible.projection.value.nodes[0]!
    expect(getSvgEntityProps(node)).toMatchObject({ x: 0, y: 0, width: 100, height: 60 })
  })

  it("uses one active text editor overlay and commits edits through core", () => {
    const controller = useDiagramEngine({
      ...scene,
      texts: [
        { id: "t1", kind: "text", x: 10, y: 80, text: "Label" },
        { id: "t2", kind: "text", x: 40, y: 90, text: "Second" },
      ],
    })
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)
    const viewport = useDiagramViewport(controller)
    const editor = useDiagramTextEditor(controller, { viewport: viewport.viewport })

    selection.setSelection(["t1"], "t1")
    const handlesBefore = visible.projection.value.activeHandles.map((handle) => handle.id)
    expect(editor.beginTextEdit("t1")).toBe(true)
    expect(editor.activeEditor.value).toMatchObject({ id: "t1", text: "Label" })
    expect(editor.beginTextEdit("t2")).toBe(true)
    expect(editor.activeEditor.value).toMatchObject({ id: "t2", text: "Second" })
    expect(visible.projection.value.texts.map((entity) => entity.id)).toEqual(["t1", "t2"])

    viewport.setViewport({ x: 20, y: 10, zoom: 2 })
    expect(editor.activeEditor.value?.style).toMatchObject({ left: "40px", top: "160px" })
    editor.updateText("Edited label")
    expect(editor.activeEditor.value?.text).toBe("Edited label")
    expect(editor.commitTextEdit()).toBe(true)
    expect(editor.activeEditor.value).toBeNull()
    expect(controller.engine.serialize().texts.find((text) => text.id === "t2")?.text).toBe("Edited label")
    expect(visible.projection.value.activeHandles.map((handle) => handle.id)).toEqual(handlesBefore)
  })

  it("keeps static text projection stable across viewport pan and zoom", () => {
    const controller = useDiagramEngine(scene)
    const visible = useDiagramVisibleEntities(controller)
    const textIdsBefore = visible.projection.value.texts.map((entity) => entity.id)

    controller.dispatch({ type: "setViewport", viewport: { x: 20, y: 10, zoom: 1.5 } })

    expect(visible.projection.value.texts.map((entity) => entity.id)).toEqual(textIdsBefore)
    expect(controller.engine.serialize().texts[0]?.text).toBe("Label")
  })

  it("keeps projection ids in core render order after z-order commands", () => {
    const controller = useDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 80, height: 40 },
        { id: "n2", kind: "node", x: 0, y: 0, width: 80, height: 40 },
      ],
      shapes: [{ id: "s1", kind: "shape", shape: "rect", x: 0, y: 0, width: 80, height: 40 }],
      texts: [{ id: "t1", kind: "text", x: 0, y: 0, text: "Label" }],
      viewport: { x: -10, y: -10, width: 120, height: 80, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)

    expect(visible.projection.value.ids).toEqual(["s1", "n1", "n2", "t1"])
    controller.dispatch({ type: "bringToFront", ids: ["s1"] })
    expect(visible.projection.value.ids.at(-1)).toBe("s1")
    controller.dispatch({ type: "sendToBack", ids: ["t1"] })
    expect(visible.projection.value.ids[0]).toBe("t1")
  })

  it("places resize handles on rotated geometry corners", () => {
    const controller = useDiagramEngine({
      nodes: [{ id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 40, rotation: 90 }],
      selection: { ids: ["n1"], primaryId: "n1" },
      viewport: { x: -40, y: -40, width: 160, height: 160, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)

    expect(visible.projection.value.nodes[0]?.geometry.corners).toHaveLength(4)
    expect(visible.projection.value.activeHandles.map((handle) => handle.point)).toEqual(visible.projection.value.nodes[0]?.geometry.corners)
  })

  it("does not expose edge bounding boxes as selection overlays", () => {
    const controller = useDiagramEngine(scene)
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)

    selection.setSelection(["e1"], "e1")

    expect(visible.projection.value.edges.map((entity) => entity.id)).toContain("e1")
    expect(visible.projection.value.overlayAnchors.map((anchor) => anchor.id)).not.toContain("e1")
    expect(visible.projection.value.activeHandles).toEqual([])
  })

  it("keeps selection in the projection even when outside the viewport", () => {
    const controller = useDiagramEngine(scene)
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)

    selection.setSelection(["n2"], "n2")
    visible.refreshVisible()

    expect(visible.projection.value.nodes.map((entity) => entity.id)).toContain("n2")
    expect(visible.projection.value.activeHandles).toHaveLength(4)
    expect(visible.projection.value.overlayAnchors.map((anchor) => anchor.id)).toContain("n2")
    visible.dispose()
  })

  it("bridges pointer events without window listeners", () => {
    const controller = useDiagramEngine(scene)
    const captured = vi.fn()
    const released = vi.fn()
    const pointer = useDiagramPointerController(controller, {
      setPointerCapture: captured,
      releasePointerCapture: released,
      toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    })
    const props = pointer.getSvgPointerProps()

    props.onPointerdown({ pointerId: 1, clientX: 10, clientY: 10, shiftKey: false } as PointerEvent)
    props.onPointermove({ pointerId: 1, clientX: 20, clientY: 20, shiftKey: false } as PointerEvent)
    props.onPointerup({ pointerId: 1, clientX: 20, clientY: 20, shiftKey: false } as PointerEvent)

    expect(captured).toHaveBeenCalledOnce()
    expect(released).toHaveBeenCalledOnce()
    expect(pointer.state.value.active).toBe(false)
    expect(controller.scene.value.entities.nodesById.get("n1")?.x).toBe(10)
  })

  it("accepts a ref-backed viewport element", () => {
    const controller = useDiagramEngine(scene)
    const element = document.createElement("div")
    const viewport = useDiagramViewport(controller, { element: shallowRef(element) })

    viewport.setViewport({ x: 20 })

    expect(viewport.viewport.value.x).toBe(20)
  })
})
