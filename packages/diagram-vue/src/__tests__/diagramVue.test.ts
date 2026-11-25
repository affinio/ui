import { describe, expect, it, vi } from "vitest"
import { computed, createApp, effectScope, h, nextTick, shallowRef } from "vue"
import { createCircularArc, createDiagramEngine, type DiagramSceneInput } from "@affino/diagram-core"
import { createDiagramInteractionController } from "@affino/diagram-core"
import { DiagramBezierOverlay, DiagramTableView, getDomEntityStyle, getSvgConnectorRenderProps, getSvgEntityProps, getSvgJunctionRenderProps, getSvgPortCreationPreviewProps, useDiagramConnectorRendering, useDiagramEngine, useDiagramPointerController, useDiagramSelection, useDiagramTable, useDiagramTextEditor, useDiagramViewport, useDiagramVisibleEntities } from ".."
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
  it("reactively exposes Core connector curves and bridges as standard SVG path props", async () => {
    const controller = useDiagramEngine({ edges: [
      { id: "horizontal", kind: "edge", source: { kind: "point", point: { x: 0, y: 40 } }, target: { kind: "point", point: { x: 100, y: 40 } }, points: [{ x: 25, y: 40 }, { x: 75, y: 40 }] },
      { id: "vertical", kind: "edge", source: { kind: "point", point: { x: 50, y: 0 } }, target: { kind: "point", point: { x: 50, y: 80 } }, points: [{ x: 50, y: 25 }, { x: 50, y: 55 }] },
    ] })
    const render = useDiagramConnectorRendering(controller, { cornerRadius: 6, crossingBridge: { radius: 5 } })
    const upper = render.connectors.value.find((edge) => edge.id === "vertical")!
    expect(upper.pathData).toContain("C ")
    expect(upper.bridges).toMatchObject([{ overId: "vertical", underId: "horizontal", point: { x: 50, y: 40 } }])
    expect(getSvgConnectorRenderProps(upper)).toMatchObject({ d: upper.pathData, "data-diagram-id": "vertical", "data-connector-bridge-count": 1, fill: "none" })
    const undoDepth = controller.engine.getDiagnostics().undoDepth
    controller.engine.dispatch({ type: "bringToFront", ids: ["horizontal"] })
    await nextTick()
    const movedOver = render.connectors.value.find((edge) => edge.id === "horizontal")!
    expect(movedOver.bridges[0]).toMatchObject({ overId: "horizontal", underId: "vertical" })
    expect(controller.engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)
    render.dispose()
    controller.dispose()
  })

  it("projects explicit connector junctions and exposes their marker appearance", async () => {
    const controller = useDiagramEngine({
      edges: [
        { id: "trunk", kind: "edge", source: { kind: "point", point: { x: 0, y: 40 } }, target: { kind: "point", point: { x: 100, y: 40 } } },
        { id: "branch", kind: "edge", source: { kind: "junction", junctionId: "j1" }, target: { kind: "point", point: { x: 50, y: 80 } } },
      ],
      junctions: [{ id: "j1", kind: "junction", hostEdgeId: "trunk", anchor: { kind: "route", fraction: 0.5 } }],
    })
    const render = useDiagramConnectorRendering(controller, { crossingBridge: { radius: 5 } })
    let trunk = render.connectors.value.find((edge) => edge.id === "trunk")!
    expect(trunk.junctions).toMatchObject([{ id: "j1", point: { x: 50, y: 40 }, appearance: "filled-dot" }])
    expect(getSvgJunctionRenderProps(trunk.junctions[0]!)).toMatchObject({ cx: 50, cy: 40, fill: "currentColor", "data-diagram-junction-id": "j1" })
    expect(getSvgJunctionRenderProps({ ...trunk.junctions[0]!, appearance: "none" })).toBeNull()
    controller.engine.dispatch({ type: "moveEntities", ids: ["trunk"], delta: { x: 20, y: 10 } })
    await nextTick()
    trunk = render.connectors.value.find((edge) => edge.id === "trunk")!
    expect(trunk.junctions[0]?.point).toEqual({ x: 70, y: 50 })
    expect(render.connectors.value.find((edge) => edge.id === "branch")?.pathData.startsWith("M 70 50")).toBe(true)
    render.dispose()
    controller.dispose()
  })

  it("publishes native cubic creation preview and renders zoom-stable editable handles", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const diagram = useDiagramEngine({
      shapes: [{ id: "curve", kind: "shape", shape: "line", x: 10, y: 10, width: 30, height: 10, pathContours: [{ closed: false, segments: [{ kind: "cubic", start: { x: 0, y: 0 }, control1: { x: 10, y: 0 }, control2: { x: 20, y: 10 }, end: { x: 30, y: 10 } }] }] }],
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 2 },
    })
    diagram.engine.dispatch({ type: "setSelection", selection: { ids: ["curve"], primaryId: "curve" } })
    const pointer = useDiagramPointerController(diagram, { toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }), snap: { enabled: false } })
    const visible = useDiagramVisibleEntities(diagram)
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramBezierOverlay, { pointer, handles: visible.projection.value.activeHandles, zoom: 2 })]) })
    app.mount(mount)
    const event = (x: number, y: number) => ({ pointerId: 22, clientX: x, clientY: y, shiftKey: false, detail: 1 }) as PointerEvent
    expect(pointer.beginBezierCreation("new-curve", event(50, 50))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(80, 60))
    frames.shift()?.(0)
    pointer.getSvgPointerProps().onPointerdown(event(80, 60))
    pointer.getSvgPointerProps().onPointermove(event(80, 75))
    frames.shift()?.(0)
    await nextTick()
    expect(pointer.state.value.bezierCreationPreview?.contour.segments[0]).toMatchObject({ kind: "cubic", control2: { x: 80, y: 45 } })
    expect(mount.querySelector('[data-bezier-preview="new-curve"]')?.getAttribute("d")).toContain("C")
    expect(mount.querySelectorAll("[data-bezier-handle]")).toHaveLength(4)
    pointer.getSvgPointerProps().onKeydown({ key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent)
    expect(pointer.state.value.bezierCreationPreview).toBeNull()
    const handleEvent = (x: number, y: number) => ({ pointerId: 23, clientX: x, clientY: y, shiftKey: false, detail: 1 }) as PointerEvent
    expect(pointer.beginBezierHandle("curve", 0, 0, "outgoing", handleEvent(20, 10))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(handleEvent(25, 15))
    frames.shift()?.(0)
    pointer.getSvgPointerProps().onPointerup(handleEvent(25, 15))
    expect(diagram.engine.getGeometrySnapshot("curve")?.pathContours?.[0]?.segments[0]).toMatchObject({ kind: "cubic", control1: { x: 25, y: 15 } })
    expect(diagram.engine.getDiagnostics().undoDepth).toBe(1)
    app.unmount()
    mount.remove()
    visible.dispose()
    pointer.dispose()
    diagram.dispose()
    vi.unstubAllGlobals()
  })

  it("finishes a click-to-place path on Enter through the SVG pointer API", () => {
    const diagram = useDiagramEngine()
    const pointer = useDiagramPointerController(diagram, { toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }), snap: { enabled: false } })
    const event = (x: number, y: number) => ({ pointerId: 31, clientX: x, clientY: y, shiftKey: false, detail: 1 }) as PointerEvent
    expect(pointer.beginPathCreation("enter-path", event(10, 10))).toBe(true)
    expect(pointer.addPathVertex({ x: 40, y: 20 })).toBe(true)
    const preventDefault = vi.fn()
    pointer.getSvgPointerProps().onKeydown({ key: "Enter", preventDefault } as unknown as KeyboardEvent)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(diagram.engine.getGeometrySnapshot("enter-path")?.path).toEqual([{ x: 10, y: 10 }, { x: 40, y: 20 }])
    expect(pointer.state.value.pathCreationPreview).toBeNull()
    expect(diagram.engine.getDiagnostics().undoDepth).toBe(1)
    pointer.dispose()
    diagram.dispose()
  })
  it("projects anchored port identity and transformed geometry from Core", () => {
    const controller = useDiagramEngine({
      shapes: [{ id: "host", kind: "shape", shape: "rect", x: 10, y: 20, width: 80, height: 40, rotation: 90, flipX: true }],
      ports: [{ id: "anchor", kind: "port", hostId: "host", anchor: { kind: "local", x: 0, y: 10 } }],
      viewport: { x: 0, y: 0, width: 200, height: 120, zoom: 2 },
    })
    const visible = useDiagramVisibleEntities(controller)
    const entity = visible.projection.value.ports[0]!
    const props = getSvgEntityProps(entity)
    expect(props).toMatchObject({ "data-port-host-id": "host", "data-port-anchor-kind": "local", "data-port-anchor-x": 0, "data-port-anchor-y": 10 })
    expect({ x: props.cx, y: props.cy }).toEqual(controller.engine.getGeometrySnapshot("anchor")?.point)
    controller.dispose()
  })

  it("publishes a reactive port placement preview and marker props, then clears it on cancel", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({ shapes: [{ id: "host", kind: "shape", shape: "rect", x: 20, y: 30, width: 80, height: 40, rotation: 90, flipX: true }], viewport: { x: 50, y: 60, width: 200, height: 100, zoom: 0.5 } })
    const pointer = useDiagramPointerController(controller, { snap: { tolerancePx: 8 }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const event = (pointerId: number, x: number, y: number) => ({ pointerId, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    expect(pointer.beginPortCreation("new-port", event(7, 50, 50), { hostId: "host" })).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(7, 55, 45))
    frames.shift()?.(0)
    await nextTick()
    const preview = pointer.state.value.portCreationPreview!
    expect(preview).toMatchObject({ id: "new-port", hostId: "host", anchor: { kind: "local" } })
    expect(getSvgPortCreationPreviewProps(preview)).toMatchObject({ cx: preview.point.x, cy: preview.point.y, "data-port-host-id": "host", "pointer-events": "none" })
    expect(controller.scene.value.entities.portsById.has("new-port")).toBe(false)
    pointer.getSvgPointerProps().onPointercancel()
    expect(pointer.state.value.portCreationPreview).toBeNull()
    expect(controller.scene.value.entities.portsById.has("new-port")).toBe(false)
    pointer.beginPortCreation("another-port", event(8, 50, 50), { hostId: "host" })
    pointer.setTool("select")
    expect(pointer.state.value.portCreationPreview).toBeNull()
    pointer.dispose()
    controller.dispose()
    vi.unstubAllGlobals()
  })

  it("forwards Shift through path vertex handle gestures and renders the constrained preview", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({ shapes: [{ id: "line", kind: "shape", shape: "line", x: 10, y: 10, width: 100, height: 100, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }], viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 } })
    const pointer = useDiagramPointerController(controller, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const event = (pointerId: number, x: number, y: number, shiftKey = false) => ({ pointerId, clientX: x, clientY: y, shiftKey }) as PointerEvent
    expect(pointer.beginPathVertexHandle("line", 1, event(1, 110, 110, true))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(1, 125, 100, true))
    frames.shift()?.(0)
    await nextTick()
    const preview = pointer.state.value.pathVertexPreview!.point
    expect(preview.y).toBe(10)
    pointer.getSvgPointerProps().onPointerup(event(1, 125, 100, true))
    expect(controller.engine.getGeometrySnapshot("line")?.path?.[1]).toEqual(preview)
    pointer.dispose()
    controller.dispose()
    vi.unstubAllGlobals()
  })

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

  it("publishes the active cell, clamps it after row deletion, and stops arrow bubbling", async () => {
    const controller = useDiagramEngine({
      tables: [{ id: "active-table", kind: "table", x: 0, y: 0, width: 120, height: 80, rowCount: 2, columnCount: 2, cells: [[{ text: "A", horizontalAlign: "right" }, { text: "B" }], [{ text: "C" }, { text: "D" }]] }],
      selection: { ids: ["active-table"], primaryId: "active-table" },
    })
    const activeCell = shallowRef({ row: 0, column: 0 })
    const bubbledKey = vi.fn()
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", { onKeydown: bubbledKey }, [h(DiagramTableView, {
      controller, id: "active-table", activeCell: activeCell.value,
      "onUpdate:activeCell": (cell: { row: number; column: number }) => { activeCell.value = cell },
    })]) })
    app.mount(mount)
    const cell = (row: number, column: number) => mount.querySelector<SVGRectElement>(`[data-table-row="${row}"][data-table-column="${column}"]`)!
    expect(cell(0, 0).getAttribute("aria-selected")).toBe("true")
    expect(cell(0, 0).getAttribute("fill")).toContain("--affino-diagram-table-active-cell")
    expect(cell(0, 0).getAttribute("stroke")).toContain("--affino-focus-ring-color")
    expect(cell(0, 1).getAttribute("tabindex")).toBe("-1")

    cell(1, 1).dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await nextTick()
    expect(activeCell.value).toEqual({ row: 1, column: 1 })
    expect(cell(1, 1).getAttribute("aria-selected")).toBe("true")
    cell(1, 1).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }))
    await nextTick()
    expect(activeCell.value).toEqual({ row: 0, column: 1 })
    expect(document.activeElement).toBe(cell(0, 1))
    expect(bubbledKey).not.toHaveBeenCalled()
    expect(controller.scene.value.entities.tablesById.get("active-table")?.x).toBe(0)
    expect(controller.engine.getDiagnostics().undoDepth).toBe(0)

    activeCell.value = { row: 1, column: 1 }
    await nextTick()
    const tableApi = useDiagramTable(controller, "active-table")
    expect(tableApi.table.value?.cells?.[0]?.[0]?.horizontalAlign).toBe("right")
    tableApi.deleteRow(1)
    await nextTick()
    expect(activeCell.value).toEqual({ row: 0, column: 1 })
    expect(controller.engine.serialize().tables?.[0]?.cells?.[0]?.[0]?.horizontalAlign).toBe("right")
    tableApi.deleteColumn(1)
    await nextTick()
    expect(activeCell.value).toEqual({ row: 0, column: 0 })
    app.unmount()
    mount.remove()
    controller.dispose()
  })

  it("renders screen-sized table resize handles and commits one preview transaction", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({
      tables: [{ id: "resizable-table", kind: "table", x: 0, y: 0, width: 100, height: 40, rowCount: 2, columnCount: 2, rotation: 90 }],
      selection: { ids: ["resizable-table"], primaryId: "resizable-table" },
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 0.5 },
    })
    const pointer = useDiagramPointerController(controller, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, pointer, id: "resizable-table", showToolbar: false })]) })
    app.mount(mount)
    const handle = (axis: string) => mount.querySelector<SVGRectElement>(`[data-table-resize="${axis}"]`)!
    const columnHandle = handle("column")
    expect(Number(columnHandle.getAttribute("width"))).toBe(24)
    const event = (pointerId: number, x: number, y: number) => Object.assign(new Event("pointerdown", { bubbles: true, cancelable: true }), { pointerId, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    const revision = controller.engine.getDocumentRevision()
    const undoDepth = controller.engine.getDiagnostics().undoDepth
    columnHandle.dispatchEvent(event(51, 50, 20))
    pointer.getSvgPointerProps().onPointermove(Object.assign(new Event("pointermove"), { pointerId: 51, clientX: 50, clientY: 30, shiftKey: false }) as PointerEvent)
    frames.shift()?.(0)
    await nextTick()
    expect(pointer.state.value.tableResizePreview).toMatchObject({ axis: "column", size: 60, width: 110 })
    expect(controller.engine.getDocumentRevision()).toBe(revision)
    expect(controller.engine.getDiagnostics().undoDepth).toBe(undoDepth)
    pointer.getSvgPointerProps().onPointerup(Object.assign(new Event("pointerup"), { pointerId: 51, clientX: 50, clientY: 30, shiftKey: false }) as PointerEvent)
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("resizable-table")).toMatchObject({ width: 110, columnWidths: [60, 50], rotation: 90 })
    expect(controller.engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)

    const rowHandle = handle("row")
    rowHandle.dispatchEvent(event(52, 50, 20))
    pointer.getSvgPointerProps().onPointermove(Object.assign(new Event("pointermove"), { pointerId: 52, clientX: 50, clientY: 35, shiftKey: false }) as PointerEvent)
    frames.shift()?.(0)
    await nextTick()
    pointer.getSvgPointerProps().onPointercancel()
    await nextTick()
    expect(pointer.state.value.tableResizePreview).toBeNull()
    expect(controller.scene.value.entities.tablesById.get("resizable-table")?.rowHeights).toEqual([20, 20])

    rowHandle.dispatchEvent(event(53, 50, 20))
    pointer.getSvgPointerProps().onPointermove(Object.assign(new Event("pointermove"), { pointerId: 53, clientX: 50, clientY: 35, shiftKey: false }) as PointerEvent)
    frames.shift()?.(0)
    await nextTick()
    rowHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    await nextTick()
    expect(pointer.state.value.tableResizePreview).toBeNull()
    expect(controller.engine.getDiagnostics().undoDepth).toBe(undoDepth + 1)
    app.unmount()
    mount.remove()
    pointer.dispose()
    controller.dispose()
    vi.unstubAllGlobals()
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

  it("projects selected orthogonal segment handles and bridges transient segment previews", () => {
    const callbacks: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const diagram = useDiagramEngine({ edges: [{ id: "wire", kind: "edge", source: { kind: "point", point: { x: 0, y: 0 } }, target: { kind: "point", point: { x: 100, y: 100 } }, points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }], viewport: { x: 0, y: 0, width: 200, height: 160, zoom: 1 } })
    diagram.dispatch({ type: "setSelection", selection: { ids: ["wire"], primaryId: "wire" } })
    const visible = useDiagramVisibleEntities(diagram)
    const handles = visible.projection.value.activeHandles.filter((handle) => handle.kind === "edge-segment")
    expect(handles.map((handle) => handle.segmentIndex)).toEqual([0, 1, 2])
    expect(handles[1]?.point).toEqual({ x: 50, y: 50 })
    const pointer = useDiagramPointerController(diagram, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const event = (x: number, y: number) => ({ pointerId: 7, clientX: x, clientY: y, shiftKey: false } as PointerEvent)
    expect(pointer.beginEdgeSegmentHandle("wire", handles[1]!.segmentIndex!, event(50, 50))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(70, 50))
    callbacks.shift()?.(0)
    const preview = pointer.state.value.edgeSegmentPreview!
    expect(preview.path).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 100 }, { x: 100, y: 100 }])
    expect(diagram.scene.value.entities.edgesById.get("wire")?.points).toEqual([{ x: 50, y: 0 }, { x: 50, y: 100 }])
    pointer.getSvgPointerProps().onPointerup(event(70, 50))
    expect(diagram.scene.value.entities.edgesById.get("wire")?.points).toEqual(preview.points)
    expect(diagram.engine.getDiagnostics().undoDepth).toBe(1)
    pointer.dispose()
    visible.dispose()
    diagram.dispose()
    vi.unstubAllGlobals()
  })

  it("renders rounded rectangle geometry reactively and edits a table title separately from cells", async () => {
    const controller = useDiagramEngine({
      shapes: [{ id: "rounded", kind: "shape", shape: "rect", x: 0, y: 0, width: 60, height: 30, cornerRadius: 8 }],
      tables: [{ id: "title-table", kind: "table", x: 20, y: 50, width: 120, height: 60, rowCount: 1, columnCount: 1, cells: [[{ text: "data" }]], header: { text: "Panel", height: 24, horizontalAlign: "center" } }],
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 },
    })
    const visible = useDiagramVisibleEntities(controller)
    expect(getSvgEntityProps(visible.projection.value.shapes[0]!)).toMatchObject({ rx: 8, ry: 8 })
    expect(controller.dispatch({ type: "updateShape", id: "rounded", cornerRadius: 12 }).changed).toBe(true)
    await nextTick()
    expect(getSvgEntityProps(visible.projection.value.shapes[0]!)).toMatchObject({ rx: 12, ry: 12 })

    const mount = document.createElement("div")
    document.body.append(mount)
    let bubbledArrow = false
    const app = createApp({ render: () => h("svg", { onKeydown: (event: KeyboardEvent) => { if (event.key === "ArrowRight") bubbledArrow = true } }, [h(DiagramTableView, { controller, id: "title-table", showToolbar: false })]) })
    app.mount(mount)
    const titleHit = mount.querySelector<SVGRectElement>("[data-table-header]")!
    expect(titleHit.getAttribute("aria-label")).toBe("Table title: Panel")
    expect(mount.querySelector("[role=grid]")?.getAttribute("aria-rowcount")).toBe("1")
    titleHit.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))
    expect(bubbledArrow).toBe(false)
    titleHit.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true }))
    await nextTick()
    const input = mount.querySelector<HTMLInputElement>('input[aria-label="Edit table title"]')!
    expect(input.value).toBe("x")
    input.value = "New title"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await nextTick()
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("title-table")?.header?.text).toBe("New title")
    expect(controller.scene.value.entities.tablesById.get("title-table")?.cells?.[0]?.[0]?.text).toBe("data")
    expect([...mount.querySelectorAll('[data-diagram-id="title-table"] text')].some((text) => text.textContent === "New title")).toBe(true)
    app.unmount()
    mount.remove()
    controller.dispose()
  })

  it("positions table titles vertically and exposes an accessible alignment control", async () => {
    const controller = useDiagramEngine({
      tables: [{ id: "align-title", kind: "table", x: 20, y: 50, width: 120, height: 60, rowCount: 1, columnCount: 1, header: { text: "Panel", height: 24 } }],
      selection: { ids: ["align-title"], primaryId: "align-title" },
    })
    const mount = document.createElement("div")
    document.body.append(mount)
    const app = createApp({ render: () => h("svg", [h(DiagramTableView, { controller, id: "align-title" })]) })
    app.mount(mount)
    const title = () => mount.querySelector<SVGTextElement>("[data-table-header-text]")!
    const alignment = mount.querySelector<HTMLSelectElement>('select[aria-label="Title vertical alignment"]')!
    const dispatch = vi.spyOn(controller, "dispatch")
    expect(alignment.value).toBe("middle")
    expect(title().getAttribute("dominant-baseline")).toBe("middle")
    expect(title().getAttribute("y")).toBe("38")

    alignment.value = "top"
    alignment.dispatchEvent(new Event("change", { bubbles: true }))
    await nextTick()
    expect(dispatch).toHaveBeenCalled()
    expect(dispatch.mock.calls.at(-1)?.[0]).toMatchObject({ type: "updateTableHeader", id: "align-title", header: { verticalAlign: "top" } })
    expect(dispatch.mock.results.at(-1)?.value.changed).toBe(true)
    expect(controller.scene.value.entities.tablesById.get("align-title")?.header?.verticalAlign).toBe("top")
    expect(title().getAttribute("dominant-baseline")).toBe("hanging")
    expect(title().getAttribute("y")).toBe("34")

    const refreshedAlignment = mount.querySelector<HTMLSelectElement>('select[aria-label="Title vertical alignment"]')!
    refreshedAlignment.value = "bottom"
    refreshedAlignment.dispatchEvent(new Event("change", { bubbles: true }))
    await nextTick()
    expect(controller.scene.value.entities.tablesById.get("align-title")?.header?.verticalAlign).toBe("bottom")
    expect(title().getAttribute("dominant-baseline")).toBe("text-after-edge")
    expect(title().getAttribute("y")).toBe("42")
    app.unmount()
    mount.remove()
    controller.dispose()
  })

  it("keeps a titled table preview transient and commits its body and title bounds together", async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({
      tables: [{ id: "preview-title", kind: "table", x: 10, y: 40, width: 100, height: 50, rowCount: 1, columnCount: 1, header: { text: "Title", height: 20 } }],
      selection: { ids: ["preview-title"], primaryId: "preview-title" },
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 },
    })
    const pointer = useDiagramPointerController(controller, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const mount = document.createElement("div")
    document.body.append(mount)
    const props = pointer.getSvgPointerProps()
    const app = createApp({ render: () => h("svg", props, [h(DiagramTableView, { controller, pointer, id: "preview-title", showToolbar: false })]) })
    app.mount(mount)
    const outerRect = () => mount.querySelector<SVGRectElement>('[data-diagram-id="preview-title"] > g > rect')!
    const serialized = controller.engine.serialize()
    const revision = controller.engine.getDocumentRevision()
    const history = controller.engine.getDiagnostics().undoDepth
    props.onPointerdown({ pointerId: 71, clientX: 20, clientY: 50, shiftKey: false } as PointerEvent)
    props.onPointermove({ pointerId: 71, clientX: 40, clientY: 70, shiftKey: false } as PointerEvent)
    frames.shift()?.(0)
    await nextTick()
    expect(outerRect().getAttribute("y")).toBe("40")
    expect(controller.engine.serialize()).toEqual(serialized)
    expect(controller.engine.getDocumentRevision()).toBe(revision)
    props.onPointercancel()
    await nextTick()
    expect(outerRect().getAttribute("y")).toBe("20")
    expect(controller.engine.getDiagnostics().undoDepth).toBe(history)
    props.onPointerdown({ pointerId: 72, clientX: 20, clientY: 50, shiftKey: false } as PointerEvent)
    props.onPointermove({ pointerId: 72, clientX: 40, clientY: 70, shiftKey: false } as PointerEvent)
    frames.shift()?.(1)
    await nextTick()
    props.onPointerup({ pointerId: 72, clientX: 40, clientY: 70, shiftKey: false } as PointerEvent)
    await nextTick()
    const table = controller.scene.value.entities.tablesById.get("preview-title")!
    expect(table).toMatchObject({ x: 30, y: 60, header: { text: "Title", height: 20 } })
    expect(outerRect().getAttribute("y")).toBe("40")
    app.unmount()
    mount.remove()
    controller.dispose()
    vi.unstubAllGlobals()
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
    expect(visible.projection.value.activeHandles.filter((handle) => handle.kind === "resize").map((handle) => handle.resizeHandle)).toEqual(["nw", "n", "ne", "e", "se", "s", "sw", "w"])
    expect(visible.projection.value.activeHandles.find((handle) => handle.resizeHandle === "nw")?.point).toEqual(visible.projection.value.nodes[0]?.geometry.corners[0])
    expect(visible.projection.value.activeHandles.find((handle) => handle.resizeHandle === "ne")?.point).toEqual(visible.projection.value.nodes[0]?.geometry.corners[1])
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

  it("preserves camera position across constrained ResizeObserver changes and document undo/redo", () => {
    const controller = useDiagramEngine({
      nodes: [{ id: "node", kind: "node", x: 0, y: 0, width: 20, height: 20 }],
      viewport: { x: 200, y: 220, width: 400, height: 300, zoom: 1 },
    })
    let callback!: (entries: ReadonlyArray<{ contentRect: { width: number; height: number } }>) => void
    class FakeResizeObserver { constructor(next: typeof callback) { callback = next } observe() {} disconnect() {} }
    const viewport = useDiagramViewport(controller, {
      element: document.createElement("div"),
      resizeObserver: FakeResizeObserver,
      viewportConstraints: { bounds: { x: 0, y: 0, width: 1000, height: 900 }, margin: 40 },
    })
    viewport.setViewport({ x: 620, y: 630, zoom: 2 })
    const camera = { x: viewport.viewport.value.x, y: viewport.viewport.value.y, zoom: viewport.viewport.value.zoom }
    expect(controller.dispatch({ type: "moveNode", id: "node", delta: { x: 10, y: 5 } }).changed).toBe(true)
    controller.dispatch({ type: "undo" })
    expect(controller.engine.canRedo()).toBe(true)

    for (const [width, height] of [[998, 798], [1002, 802], [996, 796], [1000, 800]]) {
      callback([{ contentRect: { width, height } }])
      expect(viewport.viewport.value).toMatchObject({ ...camera, width: width / camera.zoom, height: height / camera.zoom })
      expect(controller.engine.canRedo()).toBe(true)
    }
    controller.dispatch({ type: "redo" })
    expect(controller.scene.value.entities.nodesById.get("node")).toMatchObject({ x: 10, y: 5 })
    expect(viewport.viewport.value).toMatchObject(camera)
    expect(controller.engine.getDiagnostics().undoDepth).toBe(1)
    expect(controller.engine.getDiagnostics().redoDepth).toBe(0)
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
      expect(controller.engine.canUndo()).toBe(false)
    } finally {
      pointer.dispose()
      controller.dispose()
      vi.unstubAllGlobals()
    }
  })

  it("forwards strict grid snapping through the public pointer controller", () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const controller = useDiagramEngine({
      nodes: [{ id: "moving", kind: "node", x: 14, y: 14, width: 10, height: 10 }],
      viewport: { x: 0, y: 0, width: 100, height: 100, zoom: 1 },
    })
    const pointer = useDiagramPointerController(controller, {
      snap: { gridSize: 10, strictGrid: true, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false },
      toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }),
    })
    try {
      const props = pointer.getSvgPointerProps()
      const event = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
      props.onPointerdown(event(15, 15))
      props.onPointermove(event(54, 24))
      frames.shift()?.(0)
      const preview = pointer.getPreviewGeometry("moving")!.bounds
      expect(preview).toMatchObject({ x: 50, y: 20 })
      props.onPointerup(event(54, 24))
      expect(controller.scene.value.entities.nodesById.get("moving")).toMatchObject({ x: 50, y: 20 })
      expect(controller.engine.getGeometrySnapshot("moving")!.bounds).toEqual(preview)
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

    expect(visible.projection.value.activeHandles.map((handle) => handle.id)).toEqual(["__selection__:nw", "__selection__:n", "__selection__:ne", "__selection__:e", "__selection__:se", "__selection__:s", "__selection__:sw", "__selection__:w"])
    expect(visible.projection.value.activeHandles.find((handle) => handle.resizeHandle === "se")?.point).toEqual({ x: 280, y: 120 })
    expect(visible.projection.value.activeHandles.find((handle) => handle.resizeHandle === "n")?.point).toEqual({ x: 140, y: 0 })
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
      { x: 10, y: -10 }, { x: 20, y: -10 }, { x: 30, y: -10 }, { x: 30, y: 10 },
      { x: 30, y: 30 }, { x: 20, y: 30 }, { x: 10, y: 30 }, { x: 10, y: 10 },
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
      { id: "e1:segment:0", ownerId: "e1", kind: "edge-segment", segmentIndex: 0, point: { x: 250, y: 30 } },
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
    expect(visible.projection.value.activeHandles.map((handle) => handle.id)).toEqual(["e1:source", "e1:target", "e1:segment:0"])
  })

  it("projects a free straight edge selection frame aligned with its rotated geometry", () => {
    const controller = useDiagramEngine({
      edges: [{ id: "free-line", kind: "edge", source: { kind: "point", point: { x: 20, y: 40 } }, target: { kind: "point", point: { x: 120, y: 40 } } }],
      selection: { ids: ["free-line"], primaryId: "free-line" },
    })
    const visible = useDiagramVisibleEntities(controller)
    const before = visible.projection.value.overlayAnchors.find((anchor) => anchor.id === "free-line")
    expect(before?.corners).toEqual([
      { x: 20, y: 46 }, { x: 120, y: 46 }, { x: 120, y: 34 }, { x: 20, y: 34 },
    ])
    expect(controller.engine.canRotate()).toBe(true)
    controller.dispatch({ type: "rotateEntities", entries: [{ id: "free-line", rotation: 90 }] })
    const after = visible.projection.value.overlayAnchors.find((anchor) => anchor.id === "free-line")
    expect(after?.corners).toEqual([
      { x: 64, y: -10 }, { x: 64, y: 90 }, { x: 76, y: 90 }, { x: 76, y: -10 },
    ])
    expect(controller.scene.value.selection).toEqual({ ids: ["free-line"], primaryId: "free-line" })
    visible.dispose()
    controller.dispose()
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
    expect(visible.projection.value.activeHandles).toHaveLength(8)
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

    const event = (x: number, y: number) => ({ pointerId: 2, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    expect(pointer.beginResizeHandle("n1", "e", event(110, 30))).toBe(true)
    props.onPointercancel()
    expect(pointer.state.value.active).toBe(false)
    expect(controller.scene.value.entities.nodesById.get("n1")?.width).toBe(100)
    controller.dispatch({ type: "setSelection", selection: { ids: ["n1", "n2"], primaryId: "n1" } })
    expect(pointer.beginResizeSelectionHandle("e", event(110, 30))).toBe(true)
    const escape = { key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent
    props.onKeydown(escape)
    expect(escape.preventDefault).toHaveBeenCalledOnce()
    expect(pointer.state.value.active).toBe(false)
  })

  it("reactively exposes connector and numeric-input previews through the Vue pointer API", () => {
    const callbacks: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const diagram = useDiagramEngine({ viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 } })
    const pointer = useDiagramPointerController(diagram, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const event = (x: number, y: number) => ({ pointerId: 1, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    expect(pointer.beginEdgeCreation("edge", event(10, 10), { terminalLead: 8 })).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(100, 50))
    callbacks.shift()?.(0)
    const preview = pointer.state.value.edgeCreationPreview!
    expect(preview.path[0]).toEqual({ x: 10, y: 10 })
    expect(preview.path[preview.path.length - 1]).toEqual({ x: 100, y: 50 })
    expect(diagram.scene.value.entities.edgesById.size).toBe(0)
    expect(pointer.state.value.dynamicInput).toMatchObject({ x: 100, y: 50, dx: 90, dy: 40 })
    expect(pointer.setDynamicInput({ dx: 70, dy: 30 })).toBe(true)
    expect(pointer.state.value.dynamicInput).toMatchObject({ x: 80, y: 40, dx: 70, dy: 30 })
    const committingPreview = pointer.state.value.edgeCreationPreview!
    expect(pointer.confirmDynamicInput()).toBe(true)
    expect(diagram.scene.value.entities.edgesById.get("edge")).toMatchObject({ points: committingPreview.points })
    expect(diagram.engine.canUndo()).toBe(true)
    expect(pointer.beginLineCreation("line", event(5, 5))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(25, 5))
    callbacks.shift()?.(1)
    expect(pointer.state.value.shapeCreationPreview).toMatchObject({ id: "line", shape: "line", width: 20, height: 0 })
    pointer.getSvgPointerProps().onPointerup(event(25, 5))
    expect(diagram.scene.value.entities.shapesById.get("line")).toMatchObject({ shape: "line", width: 20, height: 0 })
    expect(pointer.beginPathCreation("click-line", event(10, 80), "line")).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(35, 95))
    callbacks.shift()?.(2)
    expect(pointer.state.value.pathCreationPreview).toMatchObject({ current: { x: 35, y: 95 } })
    pointer.getSvgPointerProps().onPointerdown(event(35, 95))
    pointer.getSvgPointerProps().onPointerup(event(35, 95))
    expect(diagram.scene.value.entities.shapesById.get("click-line")?.points).toEqual([{ x: 0, y: 0 }, { x: 25, y: 15 }])
    pointer.dispose()
    diagram.dispose()
    vi.unstubAllGlobals()
  })

  it("forwards opt-in automatic routing and exposes the exact route committed by Core", () => {
    const callbacks: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const diagram = useDiagramEngine({
      nodes: [{ id: "obstacle", kind: "node", x: 80, y: -20, width: 40, height: 40 }],
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 1 },
    })
    const pointer = useDiagramPointerController(diagram, { snap: { enabled: false }, toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }) })
    const event = (x: number, y: number) => ({ pointerId: 17, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    expect(pointer.beginEdgeCreation("auto-wire", event(0, 0), { mode: "auto", clearance: 6, terminalLead: 8 })).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(200, 0))
    callbacks.shift()?.(0)
    const preview = pointer.state.value.edgeCreationPreview!
    expect(preview.path.some((point) => Math.abs(point.y) >= 26)).toBe(true)
    expect(diagram.scene.value.entities.edgesById.has("auto-wire")).toBe(false)
    pointer.getSvgPointerProps().onPointerup(event(200, 0))
    expect(diagram.scene.value.entities.edgesById.get("auto-wire")?.routing).toMatchObject({ mode: "auto", clearance: 6 })
    expect(diagram.engine.getGeometrySnapshot("auto-wire")?.path).toEqual(preview.path)
    pointer.dispose()
    diagram.dispose()
    vi.unstubAllGlobals()
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

  it("projects exact circular paths to SVG arc commands", () => {
    const arc = createCircularArc({ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 })
    expect(arc.ok).toBe(true)
    if (!arc.ok) return
    const engine = createDiagramEngine()
    engine.dispatch({ type: "createPath", path: { id: "arc", kind: "path", contours: [arc.value] } })
    const geometry = engine.getGeometrySnapshot("arc")!
    const props = getSvgEntityProps({ id: "arc", kind: "shape", layer: "svg", geometry, selected: false })
    expect(props.d).toContain("A 10 10")
    expect(props["fill-rule"]).toBe("evenodd")
  })

  it("projects cubic and compound paths as native SVG curves and preserves hit testing", () => {
    const engine = createDiagramEngine()
    const contours = [
      { closed: true, segments: [
        { kind: "cubic" as const, start: { x: 0, y: 0 }, control1: { x: 0, y: 100 }, control2: { x: 100, y: 100 }, end: { x: 100, y: 0 } },
        { kind: "line" as const, start: { x: 100, y: 0 }, end: { x: 0, y: 0 } },
      ] },
      { closed: true, hole: true, segments: [
        { kind: "line" as const, start: { x: 40, y: 20 }, end: { x: 60, y: 20 } },
        { kind: "line" as const, start: { x: 60, y: 20 }, end: { x: 50, y: 40 } },
        { kind: "line" as const, start: { x: 50, y: 40 }, end: { x: 40, y: 20 } },
      ] },
    ]
    engine.dispatch({ type: "createPath", path: { id: "compound-cubic", kind: "path", contours } })
    const geometry = engine.getGeometrySnapshot("compound-cubic")!
    const props = getSvgEntityProps({ id: "compound-cubic", kind: "shape", layer: "svg", geometry, selected: false })
    expect(props.d).toContain("C 0 100 100 100 100 0")
    expect(props.d).toContain("Z")
    expect(props["fill-rule"]).toBe("evenodd")
    expect(engine.hitTest({ x: 20, y: 25 })?.id).toBe("compound-cubic")
    expect(engine.hitTest({ x: 50, y: 25 })).toBeNull()
  })

  it("publishes Core scene editing lock reactively through the pointer snapshot", async () => {
    const diagram = useDiagramEngine({ shapes: [{ id: "rect", kind: "shape", shape: "rect", x: 0, y: 0, width: 20, height: 20 }] })
    const pointer = useDiagramPointerController(diagram, { snap: { enabled: false } })
    expect(pointer.beginPathCreation("pending", { pointerId: 4, clientX: 0, clientY: 0 } as PointerEvent)).toBe(true)
    diagram.engine.setEditingLocked(true)
    await nextTick()
    expect(pointer.state.value.editingLocked).toBe(true)
    expect(pointer.state.value.pathCreationPreview).toBeNull()
    expect(pointer.beginPathCreation("blocked", { pointerId: 5, clientX: 0, clientY: 0 } as PointerEvent)).toBe(false)
    diagram.engine.setEditingLocked(false)
    await nextTick()
    expect(pointer.state.value.editingLocked).toBe(false)
    pointer.dispose()
    diagram.dispose()
  })

  it("forwards the independent connector port tolerance through the Vue pointer composable", () => {
    const callbacks: Array<FrameRequestCallback> = []
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length })
    const diagram = useDiagramEngine({
      nodes: [{ id: "host", kind: "node", x: 100, y: 0, width: 10, height: 10, portIds: ["port"] }],
      ports: [{ id: "port", kind: "port", nodeId: "host", x: 0, y: 0 }],
      viewport: { x: 0, y: 0, width: 300, height: 200, zoom: 2 },
    })
    const pointer = useDiagramPointerController(diagram, {
      toWorldPoint: (event) => ({ x: event.clientX, y: event.clientY }),
      snap: { kinds: ["port"], tolerancePx: 1, portTolerancePx: 8 },
    })
    const event = (x: number, y: number) => ({ pointerId: 7, clientX: x, clientY: y, shiftKey: false }) as PointerEvent
    expect(pointer.beginEdgeCreation("vue-port-edge", event(0, 0))).toBe(true)
    pointer.getSvgPointerProps().onPointermove(event(100, 4))
    callbacks.shift()?.(0)
    const preview = pointer.state.value.edgeCreationPreview!
    expect(preview.target).toEqual({ kind: "port", portId: "port" })
    pointer.getSvgPointerProps().onPointerup(event(100, 4))
    expect(diagram.scene.value.entities.edgesById.get("vue-port-edge")?.target).toEqual(preview.target)
    pointer.dispose()
    diagram.dispose()
    vi.unstubAllGlobals()
  })
})
