import { describe, expect, it, vi } from "vitest"
import { computed, createApp, effectScope, h, nextTick, shallowRef } from "vue"
import { createDiagramEngine, type DiagramSceneInput } from "@affino/diagram-core"
import { createDiagramInteractionController } from "@affino/diagram-core"
import { DiagramTableView, getDomEntityStyle, getSvgEntityProps, useDiagramEngine, useDiagramPointerController, useDiagramSelection, useDiagramTable, useDiagramTextEditor, useDiagramViewport, useDiagramVisibleEntities } from ".."
import { beginDiagramHandleInteraction } from "../../../demo-vue/src/pages/diagramHandleInteractions"

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
  it("renders pointer move and resize previews without mutating the committed table scene", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({
      tables: [{ id: "t", kind: "table", x: 10, y: 20, width: 120, height: 60, rowCount: 2, columnCount: 2 }],
      selection: { ids: ["t"], primaryId: "t" },
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 },
    })
    const pointer = useDiagramPointerController(controller, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, pointer, id: "t" })]) })
    app.mount(mount)
    const props = pointer.getSvgPointerProps()
    const event = (pointerId: number, x: number, y: number) => ({ pointerId, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    const tableRoot = () => mount.querySelector<SVGGElement>('[data-diagram-id="t"]')!
    const outerRect = () => tableRoot().querySelector<SVGRectElement>(":scope > g > rect")!
    const serialized = controller.engine.serialize()
    const revision = controller.engine.getDocumentRevision()
    const undoDepth = controller.engine.getDiagnostics().undoDepth

    props.onPointerdown(event(1, 20, 30))
    props.onPointermove(event(1, 40, 50))
    frames.shift()?.(0)
    await nextTick()
    expect(outerRect().getAttribute("x")).toBe("30")
    expect(outerRect().getAttribute("y")).toBe("40")
    expect(controller.engine.getScene().entities.tablesById.get("t")).toMatchObject({ x: 10, y: 20 })
    expect(controller.engine.getDocumentRevision()).toBe(revision)
    expect(controller.engine.getDiagnostics().undoDepth).toBe(undoDepth)
    props.onPointercancel()
    await nextTick()
    expect(outerRect().getAttribute("x")).toBe("10")
    expect(controller.engine.serialize()).toEqual(serialized)

    props.onPointerdown(event(2, 20, 30))
    props.onPointermove(event(2, 40, 50))
    frames.shift()?.(0)
    await nextTick()
    props.onPointerup(event(2, 40, 50))
    await nextTick()
    expect(controller.engine.getScene().entities.tablesById.get("t")).toMatchObject({ x: 30, y: 40 })
    expect(outerRect().getAttribute("x")).toBe("30")

    expect(pointer.interaction.beginResizeHandle("t", "se", { id: 3, point: { x: 150, y: 100 } })).toBe(true)
    props.onPointermove(event(3, 180, 130))
    frames.shift()?.(0)
    await nextTick()
    expect(pointer.state.value).toMatchObject({ tool: "resize-selection", active: true, resizePreviewEntries: [{ id: "t", width: 150, height: 90 }] })
    expect(pointer.interaction.getPreviewGeometry("t")?.bounds.width).toBe(150)
    expect(outerRect().getAttribute("width")).toBe("150")
    expect(outerRect().getAttribute("height")).toBe("90")
    expect(controller.engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 120, height: 60 })
    props.onPointerup(event(3, 180, 130))
    await nextTick()
    expect(controller.engine.getScene().entities.tablesById.get("t")).toMatchObject({ width: 150, height: 90 })
    expect(outerRect().getAttribute("width")).toBe("150")
    expect(outerRect().getAttribute("height")).toBe("90")
    expect(tableRoot().querySelectorAll("line")).toHaveLength(2)
    app.unmount()
    pointer.dispose()
    controller.dispose()
    mount.remove()
    vi.unstubAllGlobals()
  })

  it("projects and renders an editable SVG table with accessible controls", async () => {
    const controller = useDiagramEngine({ tables: [{ id: "t1", kind: "table", x: 10, y: 20, width: 120, height: 60, rowCount: 2, columnCount: 2, cells: [[{ text: "A" }, { text: "B" }], [{ text: "C" }, { text: "D" }]] }], viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 } })
    const visible = useDiagramVisibleEntities(controller)
    expect(visible.projection.value.tables.map((entity) => entity.id)).toEqual(["t1"])
    expect(visible.projection.value.tables[0]?.geometry.bounds).toEqual({ x: 10, y: 20, width: 120, height: 60 })
    const table = useDiagramTable(controller, "t1")
    expect(table.table.value?.cells?.[0]?.[0]?.text).toBe("A")

    const mount = document.createElement("div")
    document.body.append(mount)
    const svgPointer = vi.fn()
    const app = createApp({ render: () => h("svg", { onPointerdown: svgPointer }, [h(DiagramTableView, { controller, id: "t1" })]) })
    app.mount(mount)
    const cell = mount.querySelector<SVGRectElement>('[aria-label="Row 1, column 1: A"]')!
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    await nextTick()
    const editor = mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 1"]')!
    expect(editor).not.toBeNull()
    editor.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    expect(svgPointer).not.toHaveBeenCalled()
    editor.value = "Edited"
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    editor.setSelectionRange(6, 6)
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("t1")?.cells?.[0]?.[0]?.text).toBe("Edited")
    const nextEditor = mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 2"]')!
    expect(nextEditor).not.toBeNull()
    nextEditor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("t1")?.cells?.[0]?.[0]?.text).toBe("Edited")
    controller.dispatch({ type: "setSelection", selection: { ids: ["t1"], primaryId: "t1" } })
    await nextTick()
    expect(mount.querySelector('[role="toolbar"][aria-label="Table formatting"]')).not.toBeNull()
    expect(mount.querySelector('[aria-label="Horizontal text alignment"]')).not.toBeNull()
    expect(mount.querySelector('[aria-label="Border thickness"]')).not.toBeNull()
    const gridLines = mount.querySelectorAll("line")
    expect(gridLines).toHaveLength(2)
    expect(gridLines[0]?.getAttribute("stroke")).toBe("#D1D5DB")
    expect(mount.querySelector('[stroke="#9CA3AF"]')?.getAttribute("rx")).toBe("8")
    table.updateStyle({ grid: { visible: false } })
    await nextTick()
    expect(mount.querySelectorAll("line")).toHaveLength(0)
    mount.querySelector<HTMLButtonElement>('[aria-label="Insert row"]')!.click()
    expect(controller.scene.value.entities.tablesById.get("t1")?.rowCount).toBe(3)
    expect(svgPointer).not.toHaveBeenCalled()
    app.unmount()
    mount.remove()
    visible.dispose()
    controller.dispose()
  })

  it("starts replacement editing from printable keys and preserves keyboard navigation and focus styling", async () => {
    const controller = useDiagramEngine({
      tables: [{ id: "keyboard-table", kind: "table", x: 0, y: 0, width: 120, height: 40, rowCount: 1, columnCount: 2, cells: [[{ text: "Old" }, { text: "Next" }]] }],
      selection: { ids: ["keyboard-table"], primaryId: "keyboard-table" },
    })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, id: "keyboard-table" })]) })
    app.mount(mount)
    const cell = (column: number) => mount.querySelector<SVGRectElement>(`[data-table-row="0"][data-table-column="${column}"]`)!
    const style = mount.querySelector("style")?.textContent ?? ""
    expect(style).toContain(":focus{outline:none}")
    expect(style).toContain(":focus-visible{stroke:var(--affino-focus-ring-color,var(--affino-accent,#3b82f6));stroke-width:2")
    expect(mount.querySelector("line")?.getAttribute("stroke-width")).toBe("1")

    cell(0).dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }))
    await nextTick()
    const editor = mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 1"]')!
    expect(editor.value).toBe("x")
    expect(controller.scene.value.entities.tablesById.get("keyboard-table")?.cells?.[0]?.[0]?.text).toBe("Old")
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("keyboard-table")?.cells?.[0]?.[0]?.text).toBe("x")

    cell(0).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await nextTick()
    expect(document.activeElement).toBe(cell(1))
    cell(1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await nextTick()
    expect(mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 2"]')?.value).toBe("Next")
    mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 2"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await nextTick()
    cell(1).dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }))
    await nextTick()
    expect(mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 2"]')?.value).toBe("Next")
    mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 2"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await nextTick()

    cell(0).dispatchEvent(new KeyboardEvent("keydown", { key: "a", isComposing: true, bubbles: true }))
    cell(0).dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }))
    expect(mount.querySelector('[aria-label^="Edit row"]')).toBeNull()
    app.unmount()
    mount.remove()
    controller.dispose()
  })

  it("hides only the formatting toolbar when showToolbar is false", async () => {
    const controller = useDiagramEngine({ tables: [{ id: "hidden-toolbar", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 1, columnCount: 1, cells: [[{ text: "Value" }]] }] })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, id: "hidden-toolbar", showToolbar: false })]) })
    app.mount(mount)
    expect(mount.querySelector('[role="toolbar"][aria-label="Table formatting"]')).toBeNull()
    const cell = mount.querySelector<SVGRectElement>('[data-table-row="0"][data-table-column="0"]')!
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    await nextTick()
    expect(mount.querySelector<HTMLInputElement>('[aria-label="Edit row 1, column 1"]')).not.toBeNull()
    app.unmount()
    mount.remove()
    controller.dispose()
  })

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

  it("uses one active text editor overlay and commits edits through core", async () => {
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
    viewport.viewport.value = { ...viewport.viewport.value, x: 30 }
    await nextTick()
    expect(editor.activeEditor.value?.style.left).toBe("20px")
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

  it("reuses unchanged render entities across viewport-only publications", () => {
    const controller = useDiagramEngine(scene)
    const visible = useDiagramVisibleEntities(controller)
    const nodeBefore = visible.projection.value.nodes[0]

    controller.dispatch({ type: "setViewport", viewport: { x: 20, y: 10, zoom: 1.5 } })

    expect(visible.projection.value.nodes[0]).toBe(nodeBefore)
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
    const rotated = visible.projection.value.nodes[0]!
    expect(getSvgEntityProps(rotated)).toMatchObject({ x: 0, y: 0, width: 100, height: 40, transform: "rotate(90 50 20)" })
    expect(getDomEntityStyle(rotated).transform).toBe("translate(0px, 0px) rotate(90deg)")
  })

  it("projects horizontal and vertical flips through the public Vue renderer", () => {
    const controller = useDiagramEngine({
      nodes: [{ id: "flip-node", kind: "node", x: 0, y: 0, width: 100, height: 40, flipX: true }],
      shapes: [{ id: "flip-shape", kind: "shape", shape: "rect", x: 60, y: 0, width: 40, height: 20, flipY: true }],
      texts: [{ id: "flip-text", kind: "text", x: 120, y: 0, text: "Text", width: 40, height: 20, flipY: true }],
      tables: [{ id: "flip-table", kind: "table", x: 0, y: 60, width: 100, height: 40, rowCount: 1, columnCount: 1, flipX: true, flipY: true }],
      viewport: { x: 0, y: 0, width: 200, height: 120, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)
    const node = visible.projection.value.nodes[0]!
    const shape = visible.projection.value.shapes[0]!
    const text = visible.projection.value.texts[0]!
    const table = visible.projection.value.tables[0]!
    expect(getSvgEntityProps(node).transform).toContain("scale(-1 1)")
    expect(getSvgEntityProps(shape).transform).toContain("scale(1 -1)")
    expect(getSvgEntityProps(text).transform).toContain("scale(1 -1)")
    expect(getSvgEntityProps(table).transform).toContain("scale(-1 -1)")
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, id: "flip-table", showToolbar: false })]) })
    app.mount(mount)
    expect(mount.querySelector('[data-diagram-kind="table"] > g')?.getAttribute("transform")).toContain("scale(-1 -1)")
    app.unmount()
    mount.remove()
    visible.dispose()
    controller.dispose()
  })

  it("clamps restored and programmatically set viewport state when constraints are configured", () => {
    const controller = useDiagramEngine({ viewport: { x: -100, y: 500, width: 40, height: 30, zoom: 1 } })
    const viewport = useDiagramViewport(controller, { viewportConstraints: { bounds: { x: 10, y: 20, width: 100, height: 80 }, margin: 5 } })
    expect(viewport.viewport.value).toMatchObject({ x: 5, y: 75, width: 40, height: 30, zoom: 1 })
    viewport.setViewport({ x: 500, y: -100, zoom: 2 })
    expect(viewport.viewport.value).toMatchObject({ x: 75, y: 15, width: 40, height: 30, zoom: 2 })
    expect(controller.engine.getDocumentRevision()).toBe(0)
    viewport.dispose()
    controller.dispose()
  })

  it("applies configured viewport constraints to pan preview and commit", () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({ viewport: { x: 0, y: 0, width: 40, height: 30, zoom: 1 } })
    const pointer = useDiagramPointerController(controller, {
      viewportConstraints: { bounds: { x: 0, y: 0, width: 100, height: 80 }, margin: 10 },
      toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    })
    try {
      pointer.setTool("pan")
      const props = pointer.getSvgPointerProps()
      const event = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
      props.onPointerdown(event(0, 0))
      props.onPointermove(event(100, 100))
      frames.shift()?.(0)
      expect(pointer.state.value.previewDelta).toEqual({ x: 10, y: 10 })
      expect(controller.scene.value.viewport).toMatchObject({ x: 0, y: 0 })
      props.onPointerup(event(100, 100))
      expect(controller.scene.value.viewport).toMatchObject({ x: -10, y: -10 })
      expect(controller.engine.getDocumentRevision()).toBe(0)
    } finally {
      pointer.dispose()
      controller.dispose()
      vi.unstubAllGlobals()
    }
  })

  it("exposes one group resize handle set for multi-selection", () => {
    const controller = useDiagramEngine({
      nodes: [
        { id: "n1", kind: "node", x: 0, y: 0, width: 100, height: 40 },
        { id: "n2", kind: "node", x: 200, y: 80, width: 80, height: 40 },
      ],
      selection: { ids: ["n1", "n2"], primaryId: "n1" },
      viewport: { x: -10, y: -10, width: 340, height: 180, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)

    expect(visible.projection.value.activeHandles.map((handle) => handle.id)).toEqual(["__selection__:nw", "__selection__:ne", "__selection__:se", "__selection__:sw"])
    expect(visible.projection.value.activeHandles[2]?.point).toEqual({ x: 280, y: 120 })
  })

  it("updates Vue rotate availability and group selection geometry after core rotation", async () => {
    const controller = useDiagramEngine({
      shapes: [
        { id: "a", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 10 },
        { id: "b", kind: "shape", shape: "rect", x: 30, y: 0, width: 10, height: 20 },
      ],
      groups: [{ id: "g", kind: "group", childIds: ["a", "b"] }],
      viewport: { x: -20, y: -20, width: 100, height: 100, zoom: 1 },
    })
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)
    const canRotate = computed(() => controller.engine.canRotate(selection.selection.value.ids))
    expect(canRotate.value).toBe(false)
    selection.setSelection(["g"], "g")
    await nextTick()
    expect(canRotate.value).toBe(true)
    expect(visible.projection.value.overlayAnchors.find((anchor) => anchor.id === "g")?.rect).toEqual({ x: -6, y: -6, width: 52, height: 32 })
    controller.dispatch({ type: "rotateEntities", entries: [{ id: "g", rotation: 90 }] })
    await nextTick()
    expect(canRotate.value).toBe(true)
    expect(visible.projection.value.overlayAnchors.find((anchor) => anchor.id === "g")?.rect).toEqual({ x: 4, y: -16, width: 32, height: 52 })
    expect(visible.projection.value.activeHandles.map((handle) => handle.point)).toEqual([
      { x: 10, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 30 }, { x: 10, y: 30 },
    ])
    visible.dispose()
    controller.dispose()
  })

  it("renders a table rotated by a selected Core group", async () => {
    const controller = useDiagramEngine({
      tables: [{ id: "table", kind: "table", x: 0, y: 0, width: 20, height: 10, rowCount: 1, columnCount: 1 }],
      shapes: [{ id: "shape", kind: "shape", shape: "rect", x: 30, y: 0, width: 10, height: 20 }],
      groups: [{ id: "group", kind: "group", childIds: ["table", "shape"] }],
      selection: { ids: ["group"], primaryId: "group" },
    })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, id: "table", showToolbar: false })]) })
    app.mount(mount)
    controller.dispatch({ type: "rotateEntities", entries: [{ id: "group", rotation: 90 }] })
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("table")).toMatchObject({ x: 15, y: -5, rotation: 90 })
    expect(mount.querySelector('[data-diagram-id="table"] > g')?.getAttribute("transform")).toBe("rotate(90 25 0)")
    app.unmount()
    mount.remove()
    controller.dispose()
  })

  it("exposes source and target handles for selected edges", () => {
    const controller = useDiagramEngine(scene)
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)
    selection.setSelection(["e1"], "e1")
    expect(visible.projection.value.activeHandles).toEqual([
      { id: "e1:source", ownerId: "e1", kind: "edge-endpoint", point: { x: 100, y: 30 } },
      { id: "e1:target", ownerId: "e1", kind: "edge-endpoint", point: { x: 400, y: 30 } },
    ])
  })

  it("keeps opaque colon ids in handles and cancels a disposed drag", () => {
    const controller = useDiagramEngine({
      nodes: [{ id: "switchgear:123:main", kind: "node", x: 0, y: 0, width: 40, height: 20 }],
      selection: { ids: ["switchgear:123:main"], primaryId: "switchgear:123:main" },
      viewport: { x: -10, y: -10, width: 80, height: 60, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)
    expect(visible.projection.value.activeHandles.every((handle) => handle.ownerId === "switchgear:123:main")).toBe(true)
    const pointer = useDiagramPointerController(controller)
    const props = pointer.getSvgPointerProps()
    props.onPointerdown({ pointerId: 1, clientX: 10, clientY: 10, shiftKey: false } as PointerEvent)
    props.onPointermove({ pointerId: 1, clientX: 30, clientY: 10, shiftKey: false } as PointerEvent)
    pointer.dispose()
    expect(controller.scene.value.entities.nodesById.get("switchgear:123:main")?.x).toBe(0)
  })

  it("does not expose edge bounding boxes as selection overlays and exposes endpoint handles", () => {
    const controller = useDiagramEngine(scene)
    const selection = useDiagramSelection(controller)
    const visible = useDiagramVisibleEntities(controller)

    selection.setSelection(["e1"], "e1")

    expect(visible.projection.value.edges.map((entity) => entity.id)).toContain("e1")
    expect(visible.projection.value.overlayAnchors.map((anchor) => anchor.id)).not.toContain("e1")
    expect(visible.projection.value.activeHandles.map((handle) => handle.id)).toEqual(["e1:source", "e1:target"])
  })

  it("routes Vue endpoint handles through the public endpoint drag interaction", () => {
    const engine = createDiagramEngine({
      edges: [{ id: "e1", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 0 } } }],
    })
    let scheduledFrame: (() => void) | null = null
    const interaction = createDiagramInteractionController(engine, { scheduleFrame: (callback) => { scheduledFrame = callback; return 1 } })
    const started = beginDiagramHandleInteraction(interaction, { id: "e1:source", ownerId: "e1", kind: "edge-endpoint", point: { x: 0, y: 0 } }, { id: 7, point: { x: 0, y: 0 } })
    expect(started).toBe(true)
    interaction.pointerMove({ id: 7, point: { x: 15, y: 20 } })
    scheduledFrame?.()
    interaction.pointerUp({ id: 7, point: { x: 15, y: 20 } })
    expect(engine.getScene().entities.edgesById.get("e1")?.source).toEqual({ kind: "point", point: { x: 15, y: 20 } })
    expect(engine.canUndo()).toBe(true)
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
    const activeSnapshot = pointer.state.value
    props.onPointermove({ pointerId: 1, clientX: 20, clientY: 20, shiftKey: true } as PointerEvent)
    expect(pointer.state.value).toBe(activeSnapshot)
    props.onPointerup({ pointerId: 1, clientX: 20, clientY: 20, shiftKey: true } as PointerEvent)

    expect(captured).toHaveBeenCalledOnce()
    expect(released).toHaveBeenCalledOnce()
    expect(pointer.state.value.active).toBe(false)
    expect(controller.scene.value.entities.nodesById.get("n1")?.x).toBe(10)
    expect(controller.scene.value.entities.nodesById.get("n1")?.y).toBe(0)
  })

  it("publishes snap guides from the public pointer interaction snapshot", () => {
    const callbacks: Array<(time: number) => void> = []
    vi.stubGlobal("requestAnimationFrame", (callback: (time: number) => void) => callbacks.push(callback))
    try {
      const diagram = useDiagramEngine({
        nodes: [
          { id: "moving", kind: "node", x: 0, y: 0, width: 10, height: 10 },
          { id: "fixed", kind: "node", x: 50, y: 0, width: 10, height: 10 },
        ],
      })
      const pointer = useDiagramPointerController(diagram, { snap: { tolerancePx: 2, snapToPorts: false, snapToEqualSpacing: false } })
      const props = pointer.getSvgPointerProps()
      props.onPointerdown({ pointerId: 1, clientX: 5, clientY: 5, shiftKey: false } as PointerEvent)
      props.onPointermove({ pointerId: 1, clientX: 44, clientY: 5, shiftKey: false } as PointerEvent)
      callbacks[0]!(0)
      expect(pointer.state.value.snapGuides).toEqual([
        { kind: "alignment", axis: "x", start: { x: 50, y: 0 }, end: { x: 50, y: 10 } },
        { kind: "alignment", axis: "y", start: { x: 40, y: 0 }, end: { x: 60, y: 0 } },
      ])
      props.onPointermove({ pointerId: 1, clientX: 90, clientY: 25, shiftKey: false } as PointerEvent)
      callbacks[1]!(1)
      expect(pointer.state.value.snapGuides).toEqual([])
      props.onPointercancel()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("ignores hidden zero-size measurements and converts CSS pixels to world extent", () => {
    const controller = useDiagramEngine({ ...scene, viewport: { x: 20, y: 10, width: 260, height: 160, zoom: 2.5 } })
    let callback!: (entries: ReadonlyArray<{ contentRect: { width: number; height: number } }>) => void
    class FakeResizeObserver { constructor(next: typeof callback) { callback = next } observe() {} disconnect() {} }
    const viewport = useDiagramViewport(controller, { element: document.createElement("div"), resizeObserver: FakeResizeObserver })
    callback([{ contentRect: { width: 0, height: 0 } }])
    expect(viewport.viewport.value).toMatchObject({ x: 20, y: 10, width: 260, height: 160, zoom: 2.5 })
    callback([{ contentRect: { width: 1000, height: 600 } }])
    expect(viewport.viewport.value).toMatchObject({ x: 20, y: 10, width: 400, height: 240, zoom: 2.5 })
  })

  it("accepts a ref-backed viewport element", () => {
    const controller = useDiagramEngine(scene)
    const element = document.createElement("div")
    const viewport = useDiagramViewport(controller, { element: shallowRef(element) })

    viewport.setViewport({ x: 20 })

    expect(viewport.viewport.value.x).toBe(20)
  })
})
