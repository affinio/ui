<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue"
import {
  createEntityGeometry,
  deserializeDiagramDocument,
  resolvePortWorldDirection,
  type DiagramDocument,
  type DiagramEdge,
  type DiagramEdgeEndpoint,
  type DiagramPoint,
  type DiagramSceneInput,
} from "@affino/diagram-core"
import { useDiagramEngine, useDiagramPointerController, useDiagramViewport, useDiagramVisibleEntities } from "@affino/diagram-vue"
import { useDiagramCanvasGestures } from "./useDiagramCanvasGestures"

type Fixture = "empty" | "horizontal" | "vertical" | "perpendicular" | "offset" | "same-facing" | "free" | "manual" | "stacked" | "junction" | "transformed" | "directional" | "nested-directional" | "acceptance" | "advanced"
const fixtures: ReadonlyArray<{ id: Fixture; label: string }> = [
  { id: "empty", label: "Empty canvas" }, { id: "horizontal", label: "Aligned horizontal ports" },
  { id: "vertical", label: "Aligned vertical ports" }, { id: "perpendicular", label: "Perpendicular ports" },
  { id: "offset", label: "Offset opposite-facing ports" }, { id: "same-facing", label: "Same-facing ports" },
  { id: "free", label: "Free connector" }, { id: "manual", label: "Manual connector" },
  { id: "stacked", label: "Overlapping connectors" }, { id: "junction", label: "Explicit junction" },
  { id: "transformed", label: "Rotated and reflected hosts" },
  { id: "directional", label: "Four-side directional ports" }, { id: "nested-directional", label: "Nested directional groups" },
  { id: "acceptance", label: "Serialization acceptance" }, { id: "advanced", label: "Advanced obstacle router" },
]
const fixture = ref<Fixture>("empty")
const debug = ref(false)
const directionPortId = ref("")
let nextId = 1
let activeCreationId: string | null = null
let activeEditEdgeId: string | null = null
const lastPreviewPoints = ref<ReadonlyArray<DiagramPoint>>([])
const lastCommittedPoints = ref<ReadonlyArray<DiagramPoint>>([])
const lastPreviewEqualsCommit = ref<boolean | null>(null)
const lastPreviewEndpoints = ref<Readonly<{ source: DiagramEdgeEndpoint; target: DiagramEdgeEndpoint }> | null>(null)
const stage = ref<SVGSVGElement | null>(null)

const diagram = useDiagramEngine(fixtureScene(fixture.value))
const viewport = useDiagramViewport(diagram, { element: stage })
const pointer = useDiagramPointerController(diagram, {
  snap: { endpointMode: "reattach", ortho: false, snapToAlignment: true, snapToEqualSpacing: false },
  toWorldPoint,
  setPointerCapture: (event) => stage.value?.setPointerCapture?.(event.pointerId),
  releasePointerCapture: (event) => stage.value?.releasePointerCapture?.(event.pointerId),
})
const visible = useDiagramVisibleEntities(diagram, { pointer })
const visibleSegmentIndices = computed(() => new Set(visible.projection.value.activeHandles
  .filter((handle) => handle.ownerId === selectedEdge.value && handle.kind === "edge-segment")
  .flatMap((handle) => handle.segmentIndex === undefined ? [] : [handle.segmentIndex])))
const gestures = useDiagramCanvasGestures(stage, viewport, () => pointer.cancel())
const viewBox = computed(() => {
  const current = viewport.viewport.value
  const delta = pointer.state.value.tool === "pan" ? pointer.state.value.previewDelta : null
  return `${current.x - (delta?.x ?? 0)} ${current.y - (delta?.y ?? 0)} ${current.width} ${current.height}`
})
const scene = computed(() => diagram.scene.value)
const selectedEdge = computed(() => scene.value.selection.ids.find((id) => scene.value.entities.edgesById.has(id)) ?? null)
const renderNodes = computed(() => scene.value.order.nodeIds.map((id) => nodeGeometry(id)).filter(Boolean))
const renderShapes = computed(() => scene.value.order.shapeIds.map((id) => previewGeometry(id) ?? createEntityGeometry(id, scene.value.entities)).filter(Boolean))
const renderPorts = computed(() => [...scene.value.entities.portsById.keys()].map((id) => previewGeometry(id) ?? createEntityGeometry(id, scene.value.entities)).filter(Boolean))
const portIndicators = computed(() => [...scene.value.entities.portsById.values()].flatMap((port) => {
  const geometry = previewGeometry(port.id) ?? createEntityGeometry(port.id, scene.value.entities)
  const direction = resolvePortWorldDirection(port, scene.value.entities)
  if (!geometry?.point || !direction || direction === "any") return []
  const glyph = direction === "east" ? "→" : direction === "west" ? "←" : direction === "north" ? "↑" : "↓"
  return [{ id: port.id, x: geometry.point.x, y: geometry.point.y, glyph }]
}))
const selectedPortId = computed(() => scene.value.selection.ids.find((id) => scene.value.entities.portsById.has(id)) ?? (directionPortId.value || null))
const renderJunctions = computed(() => [...scene.value.entities.junctionsById.keys()].map((id) => createEntityGeometry(id, scene.value.entities)).filter(Boolean))
const renderEdges = computed(() => scene.value.order.edgeIds.map((id) => {
  const entity = scene.value.entities.edgesById.get(id)!
  const geometry = previewGeometry(id) ?? createEntityGeometry(id, scene.value.entities)
  return { id, entity, path: geometry?.path ?? [] }
}))
const connectorPreview = computed(() => pointer.state.value.edgeCreationPreview)
const editPreviewPath = computed(() => {
  const state = pointer.state.value
  if (state.edgeSegmentPreview) return state.edgeSegmentPreview.path
  if (activeEditEdgeId) return pointer.getPreviewGeometry(activeEditEdgeId)?.path ?? null
  return null
})
const debugState = computed(() => JSON.stringify({
  fixture: fixture.value,
  tool: pointer.state.value.tool,
  interaction: pointer.state.value.active,
  candidateId: connectorPreview.value?.id ?? activeEditEdgeId,
  source: connectorPreview.value?.source ?? null,
  target: connectorPreview.value?.target ?? null,
  previewRoutePoints: connectorPreview.value?.path ?? pointer.state.value.edgeSegmentPreview?.path ?? (activeEditEdgeId ? pointer.getPreviewGeometry(activeEditEdgeId)?.path : null) ?? [],
  committedRoutePoints: lastCommittedPoints.value,
  previewEqualsCommit: lastPreviewEqualsCommit.value,
  lastPreviewEndpoints: lastPreviewEndpoints.value,
}, null, 2))

// Browser acceptance hook: exercises the public document serializer/deserializer and Core scene replacement.
Object.assign(window, {
  __affinoConnectorAcceptance: {
    serialize: () => JSON.parse(JSON.stringify(diagram.engine.serializeDocument())),
    restore: () => {
      const document = JSON.parse(JSON.stringify(diagram.engine.serializeDocument()))
      const restored = deserializeDiagramDocument(document)
      diagram.engine.transact(() => restored)
      return JSON.parse(JSON.stringify(diagram.engine.serializeDocument()))
    },
    restoreDocument: (document: DiagramDocument) => diagram.engine.transact(() => deserializeDiagramDocument(document)),
    inspectComplete: () => JSON.parse(JSON.stringify({
      document: diagram.engine.serializeDocument(),
      geometry: Object.fromEntries([...scene.value.entities.nodesById.keys(), ...scene.value.entities.shapesById.keys(), ...scene.value.entities.portsById.keys(), ...scene.value.entities.edgesById.keys(), ...scene.value.entities.groupsById.keys(), ...scene.value.entities.tablesById.keys(), ...scene.value.entities.junctionsById.keys()].map((id) => [id, diagram.engine.getGeometrySnapshot(id)])),
      tables: Object.fromEntries([...scene.value.entities.tablesById.keys()].map((id) => {
        const layout = diagram.engine.getTableLayout(id)
        return [id, layout && { bounds: layout.bounds, rowBounds: layout.rowBounds, columnBounds: layout.columnBounds, visibleCells: layout.visibleCells, gridBoundaries: layout.gridBoundaries }]
      })),
    })),
    editTableCell: (id: string, row: number, column: number, text: string) => diagram.dispatch({ type: "updateTableCell", id, row, column, cell: { text } }),
    snapshot: () => Object.fromEntries(scene.value.order.edgeIds.map((id) => [id, {
      edge: scene.value.entities.edgesById.get(id),
      route: diagram.engine.getGeometrySnapshot(id)?.path ?? [],
      style: diagram.engine.getGeometrySnapshot(id)?.style ?? null,
    }])),
    inspectHierarchy: () => ({
      groups: [...scene.value.entities.groupsById.values()],
      ports: [...scene.value.entities.portsById.values()].map((port) => ({ port, point: diagram.engine.getGeometrySnapshot(port.id)?.point, worldDirection: resolvePortWorldDirection(port, scene.value.entities) })),
      edges: Object.fromEntries(scene.value.order.edgeIds.map((id) => [id, { edge: scene.value.entities.edgesById.get(id), route: diagram.engine.getGeometrySnapshot(id)?.path ?? [] }])),
    }),
    rotateGroup: (id: string, rotation: number) => {
      const group = scene.value.entities.groupsById.get(id)
      if (group) diagram.dispatch({ type: "rotateEntities", entries: [{ id, rotation: (group.rotation ?? 0) + rotation }] })
    },
    flipGroup: (id: string, axis: "horizontal" | "vertical") => diagram.dispatch({ type: "flipEntities", ids: [id], axis }),
  },
})
onBeforeUnmount(() => { delete (window as Window & { __affinoConnectorAcceptance?: unknown }).__affinoConnectorAcceptance })

function resetFixture(): void {
  pointer.cancel()
  activeCreationId = null
  activeEditEdgeId = null
  lastPreviewPoints.value = []
  lastCommittedPoints.value = []
  lastPreviewEqualsCommit.value = null
  lastPreviewEndpoints.value = null
  diagram.engine.transact(() => fixtureScene(fixture.value))
  directionPortId.value = [...diagram.engine.getScene().entities.portsById.values()].find((port) => port.direction && port.direction !== "any")?.id ?? ""
}

function selectTool(tool: "select" | "connect-edge"): void {
  pointer.setTool(tool)
  activeCreationId = null
  activeEditEdgeId = null
}

function updateSelectedPortDirection(event: Event): void {
  const id = selectedPortId.value
  if (!id) return
  const value = (event.target as HTMLSelectElement).value
  diagram.dispatch({ type: "setPortDirection", id, direction: value === "legacy" ? undefined : value as "auto" | "any" | "north" | "east" | "south" | "west" })
}

function onPointerdown(event: PointerEvent): void {
  if (pointer.state.value.tool === "connect-edge" && !pointer.state.value.edgeCreationPreview) {
    activeCreationId = `workbench-edge-${nextId++}`
    pointer.beginEdgeCreation(activeCreationId, event, { strategy: "simple", terminalLead: 0 })
    return
  }
  pointer.getSvgPointerProps().onPointerdown(event)
}

function onGesturePointerdown(event: PointerEvent): void {
  if (gestures.pointerDown(event)) event.stopPropagation()
}

function onStagePointermove(event: PointerEvent): void {
  if (!gestures.pointerMove(event)) pointer.getSvgPointerProps().onPointermove(event)
}

function onStagePointercancel(event: PointerEvent): void {
  if (!gestures.pointerCancel(event)) pointer.cancel()
}

function onNodePointerdown(event: PointerEvent): void {
  if (pointer.state.value.tool === "connect-edge") return
  pointer.getSvgPointerProps().onPointerdown(event)
}

function onPointerup(event: PointerEvent): void {
  if (gestures.pointerUp(event)) return
  const before = pointer.interaction.getSnapshot()
  const creating = activeCreationId
  const editing = activeEditEdgeId
  let movedConnector: string | null = null
  const candidate = before.edgeCreationPreview?.path
    ?? before.edgeSegmentPreview?.path
    ?? (editing ? pointer.getPreviewGeometry(editing)?.path ?? null : null)
    ?? null
  if (candidate) lastPreviewPoints.value = candidate.map((point) => ({ ...point }))
  if (creating && before.edgeCreationPreview) {
    lastPreviewEndpoints.value = { source: before.edgeCreationPreview.source, target: before.edgeCreationPreview.target }
  } else if (editing) {
    const edge = scene.value.entities.edgesById.get(editing)
    let source = before.edgeSegmentPreview?.source ?? edge?.source
    let target = before.edgeSegmentPreview?.target ?? edge?.target
    if (before.edgeEndpointPreview && edge) {
      const endpoint = before.edgeEndpointPreview.connection ?? { kind: "point" as const, point: before.edgeEndpointPreview.point }
      if (before.edgeEndpointPreview.endpoint === "source") source = endpoint
      else target = endpoint
    }
    if (source && target) lastPreviewEndpoints.value = { source, target }
  } else if (before.previewDelta) {
    for (const id of scene.value.order.edgeIds) {
      const preview = pointer.getPreviewGeometry(id)?.path
      const committed = diagram.engine.getGeometrySnapshot(id)?.path
      if (!preview || !committed || sameRoute(preview, committed)) continue
      movedConnector = id
      lastPreviewPoints.value = preview.map((point) => ({ ...point }))
      const edge = scene.value.entities.edgesById.get(id)
      if (edge) lastPreviewEndpoints.value = { source: edge.source, target: edge.target }
      break
    }
  }
  pointer.getSvgPointerProps().onPointerup(event)
  void nextTick(() => {
    const edgeId = creating ?? editing ?? movedConnector
    const route = edgeId ? diagram.engine.getGeometrySnapshot(edgeId)?.path : null
    if (route) {
      lastCommittedPoints.value = route.map((point) => ({ ...point }))
      lastPreviewEqualsCommit.value = sameRoute(lastPreviewPoints.value, route)
    }
    activeCreationId = null
    activeEditEdgeId = null
  })
}

function nodeGeometry(id: string) {
  return previewGeometry(id) ?? createEntityGeometry(id, scene.value.entities)
}

function previewGeometry(id: string) {
  const state = pointer.state.value
  return state.active ? pointer.getPreviewGeometry(id) : null
}

function edgePointerdown(id: string, event: PointerEvent): void {
  event.stopPropagation()
  diagram.dispatch({ type: "setSelection", selection: { ids: [id], primaryId: id } })
  if (pointer.state.value.tool !== "connect-edge") pointer.getSvgPointerProps().onPointerdown(event)
}

function endpointRef(endpoint: DiagramEdgeEndpoint): string {
  if (endpoint.kind === "port") return endpoint.portId
  if (endpoint.kind === "node") return endpoint.nodeId
  if (endpoint.kind === "junction") return endpoint.junctionId
  return ""
}

function beginEndpointEdit(id: string, endpoint: "source" | "target", event: PointerEvent): void {
  event.stopPropagation()
  stage.value?.setPointerCapture?.(event.pointerId)
  activeEditEdgeId = id
  pointer.interaction.beginEdgeEndpointHandle(id, endpoint, toCoreEvent(event))
}

function beginSegmentEdit(id: string, index: number, event: PointerEvent): void {
  event.stopPropagation()
  activeEditEdgeId = id
  pointer.beginEdgeSegmentHandle(id, index, event)
}

function toCoreEvent(event: PointerEvent) {
  return { id: event.pointerId, point: toWorldPoint(event), shiftKey: event.shiftKey }
}

function toWorldPoint(event: Pick<PointerEvent, "clientX" | "clientY">): DiagramPoint {
  const matrix = stage.value?.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

function resetSelectedRoute(): void {
  const edge = selectedEdge.value
  if (!edge) return
  diagram.dispatch({ type: "updateEdgeRouting", id: edge, routing: { mode: "auto", strategy: "simple", terminalLead: 0, waypoints: [] } })
}

function rotateSelected(): void {
  const nodeId = scene.value.selection.ids.find((id) => scene.value.entities.nodesById.has(id))
  if (nodeId) diagram.dispatch({ type: "rotateEntities", entries: [{ id: nodeId, rotation: (scene.value.entities.nodesById.get(nodeId)?.rotation ?? 0) + 90 }] })
}

function reflectSelected(): void {
  const nodeId = scene.value.selection.ids.find((id) => scene.value.entities.nodesById.has(id))
  if (nodeId) diagram.dispatch({ type: "flipEntities", ids: [nodeId], axis: "horizontal" })
}

function createExplicitJunction(): void {
  const host = scene.value.order.edgeIds[0]
  if (!host) return
  const id = `workbench-junction-${nextId++}`
  const junction = { id, kind: "junction" as const, hostEdgeId: host, anchor: { kind: "route" as const, fraction: 0.5 } }
  const source = diagram.engine.getGeometrySnapshot(host)?.path?.[0] ?? { x: 100, y: 100 }
  const result = diagram.engine.dispatchBatch([
    { type: "createJunction", junction },
    { type: "createEdge", edge: { id: `workbench-branch-${nextId++}`, kind: "edge", source: { kind: "junction", junctionId: id }, target: { kind: "point", point: { x: source.x, y: source.y + 100 } } } },
  ])
  if (!result.ok) return
}

function sameRoute(left: ReadonlyArray<DiagramPoint>, right: ReadonlyArray<DiagramPoint>): boolean {
  return left.length === right.length && left.every((point, index) => Math.abs(point.x - right[index]!.x) <= 1e-7 && Math.abs(point.y - right[index]!.y) <= 1e-7)
}

function fixtureScene(name: Fixture): DiagramSceneInput {
  const viewport = { x: 0, y: 0, width: 900, height: 600, zoom: 1 }
  if (name === "empty") return { viewport }
  if (name === "directional" || name === "nested-directional") {
    const nested = name === "nested-directional"
    return {
      viewport,
      nodes: [
        { id: "direction-host-a", kind: "node", x: 110, y: 170, width: 110, height: 70 },
        { id: "direction-host-b", kind: "node", x: 470, y: 270, width: 110, height: 70, rotation: nested ? 90 : 0 },
      ],
      groups: nested ? [
        { id: "direction-inner", kind: "group", childIds: ["direction-host-b"], x: 12, y: -5, rotation: 90, flipX: true },
        { id: "direction-outer", kind: "group", childIds: ["direction-inner"], x: 8, y: 6, rotation: 90 },
      ] : undefined,
      ports: [
        { id: "direction-east", kind: "port", nodeId: "direction-host-a", x: 110, y: 35, direction: "east", ...(nested ? { metadata: { binding: { key: "symbol.output" } } } : {}) },
        { id: "direction-west", kind: "port", nodeId: "direction-host-b", x: 0, y: 35, direction: "west", ...(nested ? { metadata: { binding: { key: "symbol.input" } } } : {}) },
        { id: "direction-north", kind: "port", nodeId: "direction-host-a", x: 55, y: 0, direction: "north" },
        { id: "direction-south", kind: "port", nodeId: "direction-host-b", x: 55, y: 70, direction: "south" },
      ],
      edges: [{ id: "direction-fixture-wire", kind: "edge", source: { kind: "port", portId: "direction-east" }, target: { kind: "port", portId: "direction-west" }, routing: { mode: "auto", strategy: "simple" } }],
    }
  }
  if (name === "acceptance") return {
    viewport,
    nodes: [
      { id: "persist-host-a", kind: "node", x: 100, y: 150, width: 110, height: 70 },
      { id: "persist-host-b", kind: "node", x: 460, y: 150, width: 110, height: 70 },
    ],
    groups: [
      { id: "persist-symbol-a-inner", kind: "group", childIds: ["persist-host-a"], x: 0, y: 0, transformOrigin: { mode: "relative", x: 0.5, y: 0.5 } },
      { id: "persist-symbol-a-root", kind: "group", childIds: ["persist-symbol-a-inner"], x: 0, y: 0, rotation: 8, transformOrigin: { mode: "absolute", x: 155, y: 185 } },
      { id: "persist-symbol-b-inner", kind: "group", childIds: ["persist-host-b"], x: 0, y: 0, rotation: -5, transformOrigin: { mode: "relative", x: 0.5, y: 0.5 } },
      { id: "persist-symbol-b-root", kind: "group", childIds: ["persist-symbol-b-inner"], x: 0, y: 0, flipY: true, transformOrigin: { mode: "relative", x: 0.5, y: 0.5 } },
    ],
    ports: [
      { id: "persist-port-a", kind: "port", nodeId: "persist-host-a", x: 110, y: 35, direction: "east", metadata: { binding: { key: "device.output" } } },
      { id: "persist-port-b", kind: "port", nodeId: "persist-host-b", x: 0, y: 35, direction: "west", metadata: { binding: { key: "device.input" } } },
    ],
    edges: [
      { id: "persist-free-auto", kind: "edge", source: { kind: "point", point: { x: 60, y: 80 } }, target: { kind: "point", point: { x: 160, y: 130 } }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 }, metadata: { label: "free-auto", layer: "acceptance", layerRole: "foreground" } },
      { id: "persist-port-auto", kind: "edge", source: { kind: "port", portId: "persist-port-a" }, target: { kind: "port", portId: "persist-port-b" }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 }, metadata: { label: "port-auto", stroke: "#146cbe" } },
      { id: "persist-manual", kind: "edge", source: { kind: "port", portId: "persist-port-a" }, target: { kind: "port", portId: "persist-port-b" }, points: [{ x: 330, y: 185 }, { x: 330, y: 300 }, { x: 460, y: 300 }], routing: { mode: "manual" }, metadata: { label: "manual-route" } },
      { id: "persist-intentional", kind: "edge", source: { kind: "point", point: { x: 60, y: 380 } }, target: { kind: "point", point: { x: 500, y: 380 } }, points: [{ x: 220, y: 380 }, { x: 220, y: 450 }, { x: 410, y: 450 }], routing: { mode: "manual" }, metadata: { label: "intentional-bends" } },
      { id: "persist-stack-a", kind: "edge", source: { kind: "point", point: { x: 620, y: 100 } }, target: { kind: "point", point: { x: 800, y: 100 } }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 } },
      { id: "persist-stack-b", kind: "edge", source: { kind: "point", point: { x: 620, y: 100 } }, target: { kind: "point", point: { x: 800, y: 100 } }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 } },
      { id: "persist-junction-host", kind: "edge", source: { kind: "point", point: { x: 100, y: 520 } }, target: { kind: "point", point: { x: 500, y: 520 } }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 } },
      { id: "persist-junction-branch", kind: "edge", source: { kind: "junction", junctionId: "persist-junction" }, target: { kind: "point", point: { x: 300, y: 570 } }, routing: { mode: "auto", strategy: "simple", terminalLead: 0 } },
    ],
    junctions: [{ id: "persist-junction", kind: "junction", hostEdgeId: "persist-junction-host", anchor: { kind: "fixed", point: { x: 300, y: 520 } } }],
    tables: [{
      id: "persist-table", kind: "table", x: 110, y: 630, width: 150, height: 50, rowCount: 2, columnCount: 3,
      columnWidths: [37.5, 62.5, 50], rowHeights: [20, 30],
      style: { grid: { visible: true, stroke: { color: "#52645b", width: 1, style: "solid" } }, border: { visible: true, stroke: { color: "#293d34", width: 1.5, style: "solid" }, radius: 2 }, cellPadding: 3, background: "#ffffff", text: { fontFamily: "Arial", fontSize: 11 }, overflow: "wrap" },
      cells: [
        [{ id: "persist-cell-00", text: "Title", metadata: { binding: { key: "drawing.title" } }, style: { background: "#e8efe9", borders: { bottom: { visible: true, stroke: { color: "#b42318", width: 2, style: "dashed" } } } } }, { id: "persist-cell-01", text: "", metadata: { binding: { key: "drawing.secondary" } } }, { id: "persist-cell-02", text: "Rev" }],
        [{ id: "persist-cell-10", text: "Plan" }, { id: "persist-cell-11", text: "K-12" }, { id: "persist-cell-12", text: "A" }],
      ],
      merges: [{ anchorCellId: "persist-cell-00", rowSpan: 1, columnSpan: 2 }],
    }],
  }
  if (name === "advanced") return {
    viewport,
    nodes: [
      { id: "host-a", kind: "node", x: 100, y: 150, width: 110, height: 70 },
      { id: "host-b", kind: "node", x: 460, y: 150, width: 110, height: 70 },
    ],
    shapes: [{ id: "routing-obstacle", kind: "shape", shape: "rect", x: 290, y: 160, width: 90, height: 70 }],
    ports: [
      { id: "port-a", kind: "port", nodeId: "host-a", x: 110, y: 35, direction: "east" },
      { id: "port-b", kind: "port", nodeId: "host-b", x: 0, y: 35, direction: "west" },
    ],
    edges: [{ id: "fixture-wire", kind: "edge", source: { kind: "port", portId: "port-a" }, target: { kind: "port", portId: "port-b" }, routing: { mode: "auto", strategy: "obstacle-aware", terminalLead: 0, clearance: 8 }, metadata: { label: "advanced-obstacle-route" } }],
  }
  if (name === "junction") return {
    viewport,
    edges: [{ id: "host-route", kind: "edge", source: { kind: "point", point: { x: 100, y: 200 } }, target: { kind: "point", point: { x: 600, y: 200 } } }, { id: "junction-branch", kind: "edge", source: { kind: "junction", junctionId: "fixture-junction" }, target: { kind: "point", point: { x: 350, y: 400 } } }],
    junctions: [{ id: "fixture-junction", kind: "junction", hostEdgeId: "host-route", anchor: { kind: "route", fraction: 0.5 } }],
  }
  if (name === "free") {
    const nodes = [
      { id: "host-a", kind: "node" as const, x: 100, y: 150, width: 110, height: 70 },
        { id: "host-b", kind: "node" as const, x: 460, y: 150, width: 110, height: 70 },
    ]
    return {
      viewport,
      nodes,
      ports: [
        { id: "port-a", kind: "port" as const, nodeId: "host-a", x: 110, y: 35 },
        { id: "port-b", kind: "port" as const, nodeId: "host-b", x: 0, y: 35 },
        { id: "port-c", kind: "port" as const, nodeId: "host-b", x: 55, y: 0 },
      ],
      edges: [{ id: "fixture-free-wire", kind: "edge", source: { kind: "point", point: { x: 650, y: 410 } }, target: { kind: "point", point: { x: 720, y: 410 } } }],
    }
  }
  const vertical = name === "vertical"
  const targetX = name === "offset" ? 440 : 460
  const targetY = name === "offset" ? 280 : vertical ? 390 : 160
  const nodes = [
    { id: "host-a", kind: "node" as const, x: 100, y: 150, width: 110, height: 70, rotation: name === "transformed" ? 30 : 0, transformOrigin: name === "transformed" ? { mode: "relative" as const, x: 0.2, y: 0.8 } : undefined },
    { id: "host-b", kind: "node" as const, x: targetX, y: targetY, width: 110, height: 70, flipX: name === "transformed" ? true : undefined },
  ]
  const sourcePort = { id: "port-a", kind: "port" as const, nodeId: "host-a", x: 110, y: 35 }
  const targetPort = { id: "port-b", kind: "port" as const, nodeId: "host-b", x: vertical ? 55 : name === "same-facing" ? 110 : 0, y: vertical ? 0 : 35 }
  const source: DiagramEdgeEndpoint = { kind: "port", portId: sourcePort.id }
  // The free-endpoint fixture returned above; all remaining routing scenarios attach both ends to Ports.
  const target: DiagramEdgeEndpoint = { kind: "port", portId: targetPort.id }
  const auto = { mode: "auto" as const, strategy: "simple" as const, terminalLead: 0, sourceDirection: vertical ? "south" as const : "east" as const, targetDirection: name === "offset" ? undefined : vertical ? "north" as const : name === "same-facing" ? "east" as const : "west" as const }
  const edge: DiagramEdge = name === "manual"
    ? { id: "fixture-wire", kind: "edge", source, target, points: [{ x: 330, y: 185 }, { x: 330, y: 350 }, { x: 460, y: 350 }], routing: { mode: "manual" } }
    : { id: "fixture-wire", kind: "edge", source, target, routing: auto }
  return {
    viewport,
    nodes,
    ports: [sourcePort, targetPort],
    edges: name === "stacked" ? [edge, { ...edge, id: "stacked-wire" }] : [edge],
  }
}
</script>

<template>
  <main class="connector-workbench">
    <header class="workbench-header">
      <div><p>Affino Diagram</p><h1>Connector Workbench</h1></div>
      <nav class="diagram-demo-nav" aria-label="Diagram demos">
        <RouterLink to="/diagram">Full generation</RouterLink><RouterLink to="/diagram/table">Table constructor</RouterLink><RouterLink to="/diagram/connectors" aria-current="page">Ports + connectors</RouterLink>
        <RouterLink to="/diagram/grid">Grid movement</RouterLink><RouterLink to="/diagram/canvas">Free canvas</RouterLink>
      </nav>
    </header>
    <section class="workbench-toolbar" aria-label="Connector Workbench controls">
      <label>Fixture <select v-model="fixture" data-testid="fixture-select" @change="resetFixture"><option v-for="entry in fixtures" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select></label>
      <button type="button" @click="selectTool('select')">Select</button>
      <button type="button" @click="selectTool('connect-edge')">Connector</button>
      <button type="button" @click="resetSelectedRoute">Reset Route</button>
      <button type="button" @click="diagram.dispatch({ type: 'undo' })">Undo</button>
      <button type="button" @click="diagram.dispatch({ type: 'redo' })">Redo</button>
      <button type="button" @click="resetFixture">Reset fixture</button>
      <button type="button" @click="rotateSelected">Rotate selected object</button>
      <button type="button" @click="reflectSelected">Reflect selected object</button>
      <label>Port <select v-model="directionPortId" data-testid="port-select"><option value="">Select port</option><option v-for="port in scene.entities.portsById.values()" :key="port.id" :value="port.id">{{ port.id }}</option></select></label>
      <label>Direction <select :disabled="!selectedPortId" :value="selectedPortId ? scene.entities.portsById.get(selectedPortId)?.direction ?? 'legacy' : 'legacy'" data-testid="port-direction" @change="updateSelectedPortDirection"><option value="legacy">Unrestricted (legacy)</option><option value="auto">Auto</option><option value="any">Any</option><option value="north">North</option><option value="east">East</option><option value="south">South</option><option value="west">West</option></select></label>
      <button type="button" @click="createExplicitJunction">Create explicit junction branch</button>
      <label><input v-model="debug" type="checkbox"> Debug overlay</label>
    </section>
    <div class="workbench-body">
      <svg ref="stage" class="workbench-stage" :viewBox="viewBox" preserveAspectRatio="none" aria-label="Connector workbench canvas" tabindex="0" :data-tool="pointer.state.value.tool" @pointerdown.capture="onGesturePointerdown" @pointerdown="onPointerdown" @pointermove="onStagePointermove" @pointerup="onPointerup" @pointercancel="onStagePointercancel" @lostpointercapture="onStagePointercancel" @wheel="gestures.wheel" @keydown.esc="pointer.cancel">
        <rect :x="Number(viewBox.split(' ')[0])" :y="Number(viewBox.split(' ')[1])" :width="viewport.viewport.value.width" :height="viewport.viewport.value.height" class="workbench-background" />
        <g v-for="edge in renderEdges" :key="edge.id" :data-edge-id="edge.id">
          <polyline :points="edge.path.map(point => `${point.x},${point.y}`).join(' ')" :class="['workbench-edge', { selected: scene.selection.ids.includes(edge.id) }]" :data-testid="`edge-${edge.id}`" :data-routing-mode="edge.entity.routing?.mode ?? 'legacy'" :data-routing-strategy="edge.entity.routing?.strategy ?? 'legacy-obstacle-aware'" :data-metadata="JSON.stringify(edge.entity.metadata ?? {})" :data-source-kind="edge.entity.source.kind" :data-source-ref="endpointRef(edge.entity.source)" :data-target-kind="edge.entity.target.kind" :data-target-ref="endpointRef(edge.entity.target)" @pointerdown="edgePointerdown(edge.id, $event)" />
        </g>
        <rect v-for="entity in renderShapes" :key="entity!.id" :data-shape-id="entity!.id" class="workbench-obstacle" :x="entity!.bounds.x" :y="entity!.bounds.y" :width="entity!.bounds.width" :height="entity!.bounds.height" />
        <g v-for="entity in renderNodes" :key="entity!.id" :data-node-id="entity!.id" :data-world-x="entity!.bounds.x" :data-world-y="entity!.bounds.y" @pointerdown="onNodePointerdown">
          <rect class="workbench-node" :class="{ selected: scene.selection.ids.includes(entity!.id) }" :x="entity!.bounds.x" :y="entity!.bounds.y" :width="entity!.bounds.width" :height="entity!.bounds.height" :transform="entity!.rotation ? `rotate(${entity!.rotation} ${entity!.transformOrigin?.x ?? entity!.bounds.x + entity!.bounds.width / 2} ${entity!.transformOrigin?.y ?? entity!.bounds.y + entity!.bounds.height / 2})` : undefined" />
          <text :x="entity!.bounds.x + 10" :y="entity!.bounds.y + 26">{{ entity!.id }}</text>
        </g>
        <circle v-for="entity in renderPorts" :key="entity!.id" class="workbench-port" :class="{ 'snap-target': pointer.state.value.snapResult?.targetId === entity!.id }" :data-port-id="entity!.id" :cx="entity!.point!.x" :cy="entity!.point!.y" r="6" />
        <text v-for="indicator in portIndicators" :key="`direction-${indicator.id}`" class="workbench-direction-indicator" :data-port-direction="indicator.id" :x="indicator.x + 8" :y="indicator.y - 8">{{ indicator.glyph }}</text>
        <circle v-for="entity in renderJunctions" :key="entity!.id" class="workbench-junction" :class="{ 'snap-target': pointer.state.value.snapResult?.targetId === entity!.id }" :data-junction-id="entity!.id" :cx="entity!.point!.x" :cy="entity!.point!.y" r="5" />
        <template v-for="edge in renderEdges" :key="`handles-${edge.id}`">
          <template v-if="selectedEdge === edge.id && edge.path.length > 1">
            <template v-for="(point, index) in edge.path.slice(1)" :key="`segment-${index}`">
              <line v-if="visibleSegmentIndices.has(index)" class="segment-handle" :data-testid="`segment-${edge.id}-${index}`" :x1="edge.path[index]!.x" :y1="edge.path[index]!.y" :x2="point.x" :y2="point.y" @pointerdown="beginSegmentEdit(edge.id, index, $event)" />
            </template>
            <circle class="endpoint-handle" :data-testid="`source-${edge.id}`" :cx="edge.path[0]!.x" :cy="edge.path[0]!.y" r="7" @pointerdown="beginEndpointEdit(edge.id, 'source', $event)" />
            <circle class="endpoint-handle" :data-testid="`target-${edge.id}`" :cx="edge.path[edge.path.length - 1]!.x" :cy="edge.path[edge.path.length - 1]!.y" r="7" @pointerdown="beginEndpointEdit(edge.id, 'target', $event)" />
          </template>
        </template>
        <polyline v-if="connectorPreview" class="connector-ghost" :class="{ invalid: connectorPreview.diagnostics?.some(item => item.code !== 'terminal-leads-overlap') }" :points="connectorPreview.path.map(point => `${point.x},${point.y}`).join(' ')" data-testid="connector-ghost" />
        <polyline v-if="editPreviewPath" class="connector-ghost" :points="editPreviewPath.map(point => `${point.x},${point.y}`).join(' ')" data-testid="connector-edit-ghost" />
        <template v-if="editPreviewPath">
          <circle class="ghost-endpoint" :cx="editPreviewPath[0]?.x" :cy="editPreviewPath[0]?.y" r="5" />
          <circle class="ghost-endpoint" :cx="editPreviewPath[editPreviewPath.length - 1]?.x" :cy="editPreviewPath[editPreviewPath.length - 1]?.y" r="5" />
        </template>
        <circle v-if="connectorPreview" class="ghost-endpoint" :cx="connectorPreview.path[0]?.x" :cy="connectorPreview.path[0]?.y" r="5" />
        <circle v-if="connectorPreview" class="ghost-endpoint" :cx="connectorPreview.path[connectorPreview.path.length - 1]?.x" :cy="connectorPreview.path[connectorPreview.path.length - 1]?.y" r="5" />
      </svg>
      <aside class="workbench-inspector">
        <h2>Entities</h2>
        <button v-for="edge in renderEdges" :key="edge.id" type="button" :data-testid="`select-${edge.id}`" @click="diagram.dispatch({ type: 'setSelection', selection: { ids: [edge.id], primaryId: edge.id } })">Select {{ edge.id }}</button>
        <button v-for="node in renderNodes" :key="node!.id" type="button" :data-testid="`select-${node!.id}`" @click="diagram.dispatch({ type: 'setSelection', selection: { ids: [node!.id], primaryId: node!.id } })">Select {{ node!.id }}</button>
        <output data-testid="preview-commit-equality">{{ lastPreviewEqualsCommit === null ? 'not compared' : String(lastPreviewEqualsCommit) }}</output>
        <output data-testid="snap-debug" :data-result="JSON.stringify(pointer.state.value.snapResult)" :data-delta="JSON.stringify(pointer.state.value.previewDelta)" />
        <output data-testid="preview-commit-evidence" :data-preview-points="JSON.stringify(lastPreviewPoints)" :data-committed-points="JSON.stringify(lastCommittedPoints)" :data-preview-endpoints="JSON.stringify(lastPreviewEndpoints)" :data-preview-equals-commit="String(lastPreviewEqualsCommit)" />
        <pre v-if="debug" data-testid="connector-debug">{{ debugState }}</pre>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.connector-workbench { min-height: 100vh; padding: 1rem; background: #f3f5f8; color: #202938; font: 14px/1.4 system-ui, sans-serif; }
.workbench-header,.workbench-toolbar,.workbench-body { display:flex; gap:.75rem; align-items:center; }
.workbench-header { justify-content:space-between; margin:0 auto 1rem; max-width:1300px; }
.workbench-header p { margin:0; color:#56647a; }.workbench-header h1 { margin:.1rem 0; }
.diagram-demo-nav { display:flex; flex-wrap:wrap; gap:.4rem; justify-content:flex-end; }
.diagram-demo-nav a { padding:.45rem .65rem; border:1px solid #d8dee8; border-radius:999px; background:white; color:#31485d; text-decoration:none; font-size:.78rem; font-weight:700; }
.diagram-demo-nav a[aria-current="page"] { color:white; background:#146cbe; border-color:#146cbe; }
.workbench-toolbar { flex-wrap:wrap; max-width:1300px; margin:0 auto 1rem; padding:.75rem; background:white; border:1px solid #d8dee8; border-radius:.5rem; }
.workbench-toolbar label { display:flex; align-items:center; gap:.4rem; }
button,select { min-height:34px; padding:.35rem .6rem; border:1px solid #c6ceda; border-radius:.35rem; background:#fff; color:inherit; cursor:pointer; }
.workbench-body { align-items:stretch; max-width:1300px; margin:auto; }
.workbench-stage { width:min(100%,1000px); min-height:560px; background:white; border:1px solid #ccd4df; border-radius:.5rem; touch-action:none; user-select:none; -webkit-user-select:none; }
.workbench-background { fill:#fff; }.workbench-node { fill:#f8fafc; stroke:#65748b; stroke-width:2; }.workbench-node.selected { stroke:#1971c2; }.workbench-node+text { fill:#334155; font-size:12px; pointer-events:none; }
.workbench-port { fill:#1971c2; stroke:white; stroke-width:2; pointer-events:none; }.workbench-junction { fill:#202938; stroke:white; stroke-width:2; pointer-events:none; }.workbench-port.snap-target,.workbench-junction.snap-target { stroke:#e67700; stroke-width:4; }
.workbench-direction-indicator { fill:#202938; font-size:15px; font-weight:700; pointer-events:none; }
.workbench-obstacle { fill:#f0f2f5; stroke:#8793a5; stroke-width:2; pointer-events:none; }
.workbench-edge { fill:none; stroke:#3d526d; stroke-width:3; pointer-events:stroke; }.workbench-edge.selected { stroke:#146cbe; }
.connector-ghost { fill:none; stroke:#e67700; stroke-width:4; stroke-dasharray:8 5; pointer-events:none; }.connector-ghost.invalid { stroke:#d63333; }.ghost-endpoint { fill:#fff; stroke:#e67700; stroke-width:3; pointer-events:none; }
.endpoint-handle { fill:#fff; stroke:#1367a7; stroke-width:3; cursor:move; }.segment-handle { stroke:transparent; stroke-width:14; cursor:move; }
.workbench-inspector { display:flex; flex:0 0 230px; flex-direction:column; gap:.4rem; padding:.75rem; background:#fff; border:1px solid #d8dee8; border-radius:.5rem; overflow:auto; }.workbench-inspector h2 { margin:0; }.workbench-inspector output { margin-top:.5rem; font-weight:600; }.workbench-inspector pre { max-height:400px; overflow:auto; font-size:11px; }
@media(max-width:900px) { .workbench-body { flex-direction:column; }.workbench-stage { min-height:420px; }.workbench-inspector { flex-basis:auto; } }
</style>
