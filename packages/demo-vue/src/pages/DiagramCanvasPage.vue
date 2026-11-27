<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue"
import {
  pathContourSvg,
  type DiagramClipboard,
  type DiagramInteractionTool,
  type DiagramPathContour,
  type DiagramPoint,
  type DiagramSceneInput,
} from "@affino/diagram-core"
import {
  DiagramBezierOverlay,
  getSvgEntityProps,
  useDiagramEngine,
  useDiagramPointerController,
  useDiagramSelection,
  useDiagramViewport,
  useDiagramVisibleEntities,
} from "@affino/diagram-vue"
import type { DiagramPointerController } from "@affino/diagram-vue"
import { useDiagramCanvasGestures } from "./useDiagramCanvasGestures"

const stage = ref<HTMLElement | null>(null)
const clipboardMessage = ref("Select one or more objects to edit.")
const orthogonalMode = ref(false)
let nextId = 1

const initialScene: DiagramSceneInput = {
  viewport: { x: 0, y: 0, width: 960, height: 650, zoom: 1 },
  nodes: [
    { id: "canvas-host-a", kind: "node", x: 120, y: 140, width: 150, height: 86, portIds: ["canvas-port-a"] },
    { id: "canvas-host-b", kind: "node", x: 520, y: 340, width: 150, height: 86, portIds: ["canvas-port-b"] },
  ],
  ports: [
    { id: "canvas-port-a", kind: "port", nodeId: "canvas-host-a", x: 150, y: 43, direction: "auto" },
    { id: "canvas-port-b", kind: "port", nodeId: "canvas-host-b", x: 0, y: 43, direction: "auto" },
  ],
  // The target port is on host B's west edge, so the route's final travel direction is east, into that port.
  edges: [{ id: "canvas-edge", kind: "edge", source: { kind: "port", portId: "canvas-port-a" }, target: { kind: "port", portId: "canvas-port-b" }, routing: { mode: "auto", strategy: "simple", terminalLead: 0, firstAxis: "horizontal", targetDirection: "east" } }],
  texts: [{ id: "canvas-note", kind: "text", x: 320, y: 150, width: 180, height: 34, text: "Edit me on the canvas" }],
  shapes: [
    { id: "canvas-rect", kind: "shape", shape: "rect", x: 330, y: 270, width: 110, height: 78 },
    { id: "canvas-curve", kind: "shape", shape: "path", x: 650, y: 120, width: 180, height: 120, pathContours: [{ segments: [{ kind: "cubic", start: { x: 0, y: 80 }, control1: { x: 40, y: -20 }, control2: { x: 130, y: 180 }, end: { x: 180, y: 20 } }] }] },
  ],
}

const diagram = useDiagramEngine(initialScene)
const selection = useDiagramSelection(diagram)
const viewport = useDiagramViewport(diagram, { element: stage })
function createPointer(tool: DiagramInteractionTool = "select"): DiagramPointerController {
  const controller = useDiagramPointerController(diagram, {
    toWorldPoint,
    snap: { ortho: orthogonalMode.value, gridSize: 16, snapToPorts: true, snapToConnectors: true, endpointMode: "reattach", snapToAlignment: true, kinds: ["grid", "port", "connector", "endpoint", "midpoint", "intersection", "nearest", "alignment"] },
  })
  controller.setTool(tool)
  return controller
}
const pointer = shallowRef(createPointer())
const visible = useDiagramVisibleEntities(diagram, { overscan: 32, pointer })
const pointerProps = computed(() => pointer.value.getSvgPointerProps())
const gestures = useDiagramCanvasGestures(stage, viewport, () => pointer.value.cancel())
watch(orthogonalMode, () => {
  const tool = pointer.value.state.value.tool
  pointer.value.cancel()
  pointer.value.dispose()
  pointer.value = createPointer(tool)
})
const scene = computed(() => diagram.scene.value)
const viewBox = computed(() => {
  const current = displayViewport.value
  return `${current.x} ${current.y} ${current.width} ${current.height}`
})
const displayViewport = computed(() => {
  const current = viewport.viewport.value
  const delta = pointer.value.state.value.tool === "pan" ? pointer.value.state.value.previewDelta : null
  return delta ? { ...current, x: current.x - delta.x, y: current.y - delta.y } : current
})
const zoomLabel = computed(() => `${Math.round(viewport.viewport.value.zoom * 100)}%`)
const selectedText = computed(() => {
  const id = selection.selection.value.primaryId
  return id ? scene.value.entities.textsById.get(id) ?? null : null
})
const textDraft = ref("")
watch(selectedText, (text) => { if (text) textDraft.value = text.text }, { immediate: true })

function toWorldPoint(event: PointerEvent): DiagramPoint {
  const bounds = stage.value?.getBoundingClientRect()
  const current = viewport.viewport.value
  return bounds
    ? { x: current.x + (event.clientX - bounds.left) / current.zoom, y: current.y + (event.clientY - bounds.top) / current.zoom }
    : { x: current.x, y: current.y }
}

function id(prefix: string): string { return `${prefix}-${nextId++}` }
function placement(): DiagramPoint { return { x: viewport.viewport.value.x + 190, y: viewport.viewport.value.y + 150 } }

function addNode(): void {
  const point = placement(), nodeId = id("node"), portId = id("port")
  diagram.engine.dispatchBatch([
    { type: "createNode", node: { id: nodeId, kind: "node", x: point.x, y: point.y, width: 150, height: 86, portIds: [portId] } },
    { type: "createPort", port: { id: portId, kind: "port", nodeId, x: 150, y: 43 } },
  ])
  selection.setSelection([nodeId], nodeId)
}

function addShape(shape: "rect" | "ellipse" | "line"): void {
  const point = placement(), shapeId = id(shape)
  diagram.dispatch({ type: "createShape", shape: { id: shapeId, kind: "shape", shape, x: point.x, y: point.y, width: 120, height: shape === "line" ? 90 : 80 } })
  selection.setSelection([shapeId], shapeId)
}

function addText(): void {
  const point = placement(), textId = id("text")
  const clipboard: DiagramClipboard = {
    nodes: [], edges: [], texts: [{ id: textId, kind: "text", x: 0, y: 0, width: 190, height: 36, text: "New text" }],
    shapes: [], ports: [], junctions: [], groups: [], tables: [],
    selection: { ids: [textId], primaryId: textId }, viewport: scene.value.viewport,
  }
  const before = new Set(scene.value.entities.textsById.keys())
  diagram.engine.importClipboard(clipboard, point)
  const createdId = [...scene.value.entities.textsById.keys()].find((candidate) => !before.has(candidate))
  if (createdId) selection.setSelection([createdId], createdId)
  textDraft.value = "New text"
}

function addPath(): void {
  const point = placement(), pathId = id("path")
  diagram.dispatch({ type: "createPath", path: { id: pathId, kind: "path", points: [point, { x: point.x + 55, y: point.y - 30 }, { x: point.x + 112, y: point.y + 38 }, { x: point.x + 170, y: point.y }] } })
  selection.setSelection([pathId], pathId)
}

function addCurve(): void {
  const point = placement(), curveId = id("curve")
  const contour: DiagramPathContour = {
    segments: [{
      kind: "cubic",
      start: point,
      control1: { x: point.x + 36, y: point.y - 70 },
      control2: { x: point.x + 122, y: point.y + 78 },
      end: { x: point.x + 180, y: point.y },
    }],
  }
  diagram.dispatch({ type: "createPath", path: { id: curveId, kind: "path", contours: [contour] } })
  selection.setSelection([curveId], curveId)
}

function startTool(tool: "select" | "pan" | "connect-edge" | "draw-bezier" | "create-port"): void {
  pointer.value.setTool(tool)
}

function onPointerdown(event: PointerEvent): void {
  if (gestures.pointerDown(event)) return
  if (pointer.value.state.value.tool === "create-port" && !pointer.value.state.value.portCreationPreview) {
    pointer.value.beginPortCreation(id("port"), event)
    return
  }
  if (pointer.value.state.value.tool === "connect-edge" && !pointer.value.state.value.edgeCreationPreview) {
    if (pointer.value.beginEdgeCreation(id("edge"), event, { strategy: "simple", terminalLead: 0 })) capturePointer(event)
    return
  }
  if (pointer.value.state.value.tool === "draw-bezier" && !pointer.value.state.value.bezierCreationPreview) {
    if (pointer.value.beginBezierCreation(id("curve"), event)) capturePointer(event)
    return
  }
  pointerProps.value.onPointerdown(event)
}

function onPointerup(event: PointerEvent): void {
  if (gestures.pointerUp(event)) return
  pointerProps.value.onPointerup(event)
}

function onPointermove(event: PointerEvent): void {
  if (!gestures.pointerMove(event)) pointerProps.value.onPointermove(event)
}

function onPointercancel(event: PointerEvent): void {
  if (!gestures.pointerCancel(event)) pointer.value.cancel()
}

function beginSegmentMove(ownerId: string, segmentIndex: number, event: PointerEvent): void {
  event.stopPropagation()
  capturePointer(event)
  pointer.value.beginEdgeSegmentHandle(ownerId, segmentIndex, event)
}

function beginEndpointMove(ownerId: string, endpoint: "source" | "target", event: PointerEvent): void {
  event.stopPropagation()
  capturePointer(event)
  pointer.value.beginEdgeEndpointHandle(ownerId, endpoint, event)
}

function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget as Element | null
  try { target?.setPointerCapture?.(event.pointerId) } catch { /* capture may be unavailable in synthetic pointer events */ }
}

function renderGeometry(entity: (typeof visible.projection.value.ordered)[number]) {
  const state = pointer.value.state.value
  const geometry = state.active ? pointer.value.getPreviewGeometry(entity.id) : null
  return geometry ? { ...entity, geometry } : entity
}

function rotateSelection(): void {
  const entries = selection.selection.value.ids.flatMap((entityId) => {
    const entities = scene.value.entities
    const entity = entities.nodesById.get(entityId) ?? entities.shapesById.get(entityId) ?? entities.textsById.get(entityId) ?? entities.tablesById.get(entityId) ?? entities.groupsById.get(entityId)
    return entity ? [{ id: entityId, rotation: ("rotation" in entity ? entity.rotation ?? 0 : 0) + 45 }] : []
  })
  if (entries.length) diagram.dispatch({ type: "rotateEntities", entries })
}

function resizeSelection(): void {
  const entries = selection.selection.value.ids.flatMap((entityId) => {
    const entity = scene.value.entities.nodesById.get(entityId) ?? scene.value.entities.shapesById.get(entityId) ?? scene.value.entities.textsById.get(entityId) ?? scene.value.entities.tablesById.get(entityId)
    return entity && "width" in entity && "height" in entity ? [{ id: entityId, width: (entity.width ?? 0) + 16, height: (entity.height ?? 0) + 12 }] : []
  })
  if (entries.length) diagram.dispatch({ type: "resizeEntities", entries })
}

function groupSelection(): void {
  const ids = selection.selection.value.ids
  if (ids.length < 2) { clipboardMessage.value = "Select at least two objects to group them."; return }
  const groupId = id("group")
  const result = diagram.dispatch({ type: "groupEntities", id: groupId, ids })
  clipboardMessage.value = result.changed ? `Grouped ${ids.length} objects as ${groupId}.` : "The selected objects could not be grouped."
}

function ungroupSelection(): void {
  const groups = selection.selection.value.ids.filter((value) => scene.value.entities.groupsById.has(value))
  if (groups.length) diagram.dispatch({ type: "ungroupEntities", ids: groups })
  else clipboardMessage.value = "Select a group to ungroup it."
}

function saveText(): void {
  const text = selectedText.value
  if (text && text.text !== textDraft.value) diagram.dispatch({ type: "editText", id: text.id, text: textDraft.value })
}

function moveSelection(delta: DiagramPoint): void {
  const ids = selection.selection.value.ids
  if (ids.length) diagram.dispatch({ type: "moveEntities", ids, delta })
}

function zoom(factor: number): void {
  const current = viewport.viewport.value
  const next = Math.max(0.25, Math.min(2.5, current.zoom * factor))
  const ratio = current.zoom / next
  viewport.setViewport({ x: current.x + current.width * (1 - ratio) / 2, y: current.y + current.height * (1 - ratio) / 2, zoom: next, width: current.width * ratio, height: current.height * ratio })
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.target as HTMLElement | null)?.matches("input, textarea, select, [contenteditable='true']")) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault(); diagram.dispatch({ type: event.shiftKey ? "redo" : "undo" }); return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") { event.preventDefault(); diagram.dispatch({ type: "redo" }); return }
  if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); diagram.dispatch({ type: "deleteSelection" }); return }
  const delta = { ArrowLeft: { x: -8, y: 0 }, ArrowRight: { x: 8, y: 0 }, ArrowUp: { x: 0, y: -8 }, ArrowDown: { x: 0, y: 8 } }[event.key]
  if (delta) { event.preventDefault(); moveSelection(delta) }
}

function resetScene(): void {
  pointer.value.cancel()
  diagram.engine.transact(() => initialScene)
  viewport.setViewport({ x: 0, y: 0, zoom: 1 })
  clipboardMessage.value = "Scene reset. Select an object or add something new."
}

onBeforeUnmount(() => pointer.value.dispose())
</script>

<template>
  <main class="canvas-lab">
    <header class="canvas-lab__header">
      <div><p class="eyebrow">Affino Diagram · blank editing surface</p><h1>Free canvas</h1><p>Add objects, select several, then move, transform, group, connect, and undo.</p></div>
      <nav class="diagram-demo-nav" aria-label="Diagram demos">
        <RouterLink to="/diagram">Full generation</RouterLink><RouterLink to="/diagram/table">Table constructor</RouterLink><RouterLink to="/diagram/connectors">Ports + connectors</RouterLink>
        <RouterLink to="/diagram/grid">Grid movement</RouterLink><RouterLink to="/diagram/canvas" aria-current="page">Free canvas</RouterLink>
      </nav>
    </header>

    <section class="canvas-lab__toolbar" aria-label="Free canvas tools">
      <div class="tool-row">
        <label class="canvas-lab__ortho-toggle"><input v-model="orthogonalMode" type="checkbox"> Orthogonal mode</label>
        <button :class="{ active: pointer.state.value.tool === 'select' }" type="button" @click="startTool('select')">Select</button>
        <button :class="{ active: pointer.state.value.tool === 'pan' }" type="button" @click="startTool('pan')">Pan</button>
        <button :class="{ active: pointer.state.value.tool === 'connect-edge' }" type="button" @click="startTool('connect-edge')">Draw connector</button>
        <button :class="{ active: pointer.state.value.tool === 'draw-bezier' }" type="button" @click="startTool('draw-bezier')">Draw Bézier</button>
        <button :class="{ active: pointer.state.value.tool === 'create-port' }" type="button" @click="startTool('create-port')">Place port on shape</button>
        <button type="button" @click="addNode">Add node + ports</button>
        <button type="button" @click="addShape('rect')">Rectangle</button>
        <button type="button" @click="addShape('ellipse')">Ellipse</button>
        <button type="button" @click="addShape('line')">Line</button>
        <button type="button" @click="addText">Text</button>
        <button type="button" @click="addPath">Path</button>
        <button type="button" @click="addCurve">Cubic curve</button>
      </div>
      <div class="tool-row">
        <button type="button" @click="moveSelection({ x: -16, y: 0 })">← Move</button><button type="button" @click="moveSelection({ x: 16, y: 0 })">Move →</button>
        <button type="button" @click="resizeSelection">Resize +</button><button type="button" @click="rotateSelection">Rotate 45°</button>
        <button type="button" @click="diagram.dispatch({ type: 'flipEntities', axis: 'horizontal' })">Flip horizontal</button>
        <button type="button" @click="diagram.dispatch({ type: 'flipEntities', axis: 'vertical' })">Flip vertical</button>
        <button type="button" @click="groupSelection">Group selection</button><button type="button" @click="ungroupSelection">Ungroup</button>
        <button type="button" @click="diagram.dispatch({ type: 'duplicateSelection', offset: { x: 24, y: 24 } })">Duplicate</button>
        <button type="button" @click="diagram.dispatch({ type: 'deleteSelection' })">Delete</button>
        <button type="button" @click="diagram.dispatch({ type: 'undo' })">Undo</button><button type="button" @click="diagram.dispatch({ type: 'redo' })">Redo</button>
        <button type="button" @click="zoom(0.85)">− Zoom</button><button type="button" @click="zoom(1.18)">+ Zoom</button>
        <button type="button" @click="diagram.engine.fitScene(48)">Fit scene</button><button type="button" @click="resetScene">Reset</button>
      </div>
      <div class="canvas-lab__inspector">
        <label v-if="selectedText">Selected text <input v-model="textDraft" :aria-label="`Edit text ${selectedText.id}`" @change="saveText" @keydown.enter.prevent="saveText" /></label>
        <span>{{ clipboardMessage }}</span><span>{{ selection.selection.value.ids.length }} selected · {{ zoomLabel }}</span>
        <span>Orthogonal mode constrains connector and Bézier drawing to horizontal or vertical directions.</span>
        <span v-if="pointer.state.value.tool === 'create-port'">Click a node, shape, or connector to place an attached port.</span>
        <span v-else-if="pointer.state.value.tool === 'connect-edge'">Drag from an existing port to another port to connect figures.</span>
        <span v-if="selection.selection.value.ids.some(id => scene.entities.edgesById.has(id))">Drag an endpoint ring to reconnect it to a port, or drag a midpoint handle to shift a segment; attached endpoints stay fixed.</span>
        <span v-if="pointer.state.value.edgeCreationPreview">Connector: drag from one port to another; Enter finishes a route.</span>
      </div>
    </section>

    <div ref="stage" class="canvas-lab__stage">
      <svg class="canvas-lab__svg" :viewBox="viewBox" tabindex="0" :data-tool="pointer.state.value.tool" aria-label="Free diagram editing canvas"
        @pointerdown="onPointerdown" @pointermove="onPointermove" @pointerup="onPointerup" @pointercancel="onPointercancel" @lostpointercapture="onPointercancel" @wheel="gestures.wheel" @keydown="onKeydown" @keydown.enter="pointer.state.value.tool === 'draw-bezier' && pointer.finishBezierCreation()" @keydown.esc="pointer.cancel">
        <rect :x="displayViewport.x" :y="displayViewport.y" :width="displayViewport.width" :height="displayViewport.height" fill="#f8f6ef" pointer-events="none" />
        <template v-for="entity in visible.projection.value.ordered" :key="entity.id">
          <polyline v-if="entity.kind === 'edge'" v-bind="getSvgEntityProps(renderGeometry(entity))" :class="['canvas-edge', { selected: entity.selected }]" />
          <circle v-else-if="entity.kind === 'port'" v-bind="getSvgEntityProps(renderGeometry(entity))" class="canvas-port" />
          <path v-else-if="entity.kind === 'shape' && renderGeometry(entity).geometry.pathContours?.length" v-bind="getSvgEntityProps(renderGeometry(entity))" :d="renderGeometry(entity).geometry.pathContours?.map(pathContourSvg).join(' ')" :class="['canvas-path', { selected: entity.selected }]" fill="none" />
          <polyline v-else-if="entity.kind === 'shape' && renderGeometry(entity).geometry.path" v-bind="getSvgEntityProps(renderGeometry(entity))" :class="['canvas-path', { selected: entity.selected }]" />
          <ellipse v-else-if="entity.kind === 'shape' && scene.entities.shapesById.get(entity.id)?.shape === 'ellipse'" :cx="renderGeometry(entity).geometry.bounds.x + renderGeometry(entity).geometry.bounds.width / 2" :cy="renderGeometry(entity).geometry.bounds.y + renderGeometry(entity).geometry.bounds.height / 2" :rx="renderGeometry(entity).geometry.bounds.width / 2" :ry="renderGeometry(entity).geometry.bounds.height / 2" v-bind="getSvgEntityProps(renderGeometry(entity))" :class="['canvas-shape', { selected: entity.selected }]" />
          <rect v-else-if="entity.kind === 'shape' || entity.kind === 'node' || entity.kind === 'group'" v-bind="getSvgEntityProps(renderGeometry(entity))" :class="[entity.kind === 'node' ? 'canvas-node' : 'canvas-shape', { selected: entity.selected }]" />
          <text v-if="entity.kind === 'node'" :x="renderGeometry(entity).geometry.bounds.x + 14" :y="renderGeometry(entity).geometry.bounds.y + 34" class="canvas-label">{{ entity.id }}</text>
          <text v-else-if="entity.kind === 'text'" :x="renderGeometry(entity).geometry.bounds.x" :y="renderGeometry(entity).geometry.bounds.y + 18" :class="['canvas-text', { selected: entity.selected }]">{{ scene.entities.textsById.get(entity.id)?.text }}</text>
        </template>
        <polyline v-if="pointer.state.value.edgeCreationPreview" :points="pointer.state.value.edgeCreationPreview.path.map(point => `${point.x},${point.y}`).join(' ')" class="canvas-connector-preview" />
        <circle v-if="pointer.state.value.portCreationPreview" :cx="pointer.state.value.portCreationPreview.point.x" :cy="pointer.state.value.portCreationPreview.point.y" r="6" class="canvas-port canvas-port--preview" pointer-events="none" />
        <DiagramBezierOverlay :pointer="pointer" :handles="visible.projection.value.activeHandles" :zoom="viewport.viewport.value.zoom" />
        <circle v-for="handle in visible.projection.value.activeHandles.filter(handle => handle.kind === 'edge-endpoint')" :key="handle.id" :cx="handle.point.x" :cy="handle.point.y" r="8" class="canvas-endpoint-handle" :aria-label="`Reconnect ${handle.id.endsWith(':source') ? 'source' : 'target'} endpoint`" @pointerdown.stop.prevent="beginEndpointMove(handle.ownerId, handle.id.endsWith(':source') ? 'source' : 'target', $event)" />
        <circle v-for="handle in visible.projection.value.activeHandles.filter(handle => handle.kind === 'edge-segment')" :key="handle.id" :cx="handle.point.x" :cy="handle.point.y" r="7" class="canvas-segment-handle" :aria-label="`Move connector segment ${handle.segmentIndex! + 1}`" @pointerdown.stop.prevent="beginSegmentMove(handle.ownerId, handle.segmentIndex!, $event)" />
        <rect v-for="handle in visible.projection.value.activeHandles.filter(handle => handle.kind === 'resize' && handle.resizeHandle)" :key="handle.id" class="canvas-resize-handle" :x="handle.point.x - 5 / viewport.viewport.value.zoom" :y="handle.point.y - 5 / viewport.viewport.value.zoom" :width="10 / viewport.viewport.value.zoom" :height="10 / viewport.viewport.value.zoom" @pointerdown.stop.prevent="pointer.beginResizeHandle(handle.ownerId, handle.resizeHandle!, $event)" />
      </svg>
    </div>
  </main>
</template>

<style scoped>
.canvas-lab { min-height: 0; flex: 1 1 auto; display: grid; grid-template-rows: auto auto minmax(25rem, 1fr); gap: .8rem; color: #253930; }
.canvas-lab__header { display: flex; align-items: end; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
.eyebrow { margin: 0 0 .3rem; color: #65746d; font-size: .72rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.4rem); }
.canvas-lab__header p:last-child { margin: .35rem 0 0; color: #637069; }
.diagram-demo-nav { display: flex; flex-wrap: wrap; gap: .4rem; }
.diagram-demo-nav a { padding: .5rem .7rem; border: 1px solid #d6ddd6; border-radius: 999px; color: #2d5146; text-decoration: none; font-size: .82rem; font-weight: 700; }
.diagram-demo-nav a[aria-current="page"] { color: white; background: #285247; border-color: #285247; }
.canvas-lab__toolbar { display: grid; gap: .5rem; padding: .65rem; border: 1px solid #dce3dc; border-radius: .8rem; background: #fffdf8; }
.tool-row { display: flex; flex-wrap: wrap; gap: .4rem; }
.canvas-lab__ortho-toggle { min-height: 2.1rem; display: inline-flex; align-items: center; gap: .4rem; padding: .25rem .5rem; border: 1px solid #d1d9d1; border-radius: .5rem; background: #f3f7f3; color: #285247; font-size: .8rem; font-weight: 700; }
.tool-row button { min-height: 2.1rem; padding: .35rem .65rem; border: 1px solid #d1d9d1; border-radius: .5rem; background: white; color: #23372f; font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; }
.tool-row button.active { color: white; background: #285247; }
.tool-row button:disabled { opacity: .45; cursor: not-allowed; }
.canvas-lab__inspector { display: flex; flex-wrap: wrap; gap: .55rem 1rem; align-items: center; color: #61716a; font-size: .8rem; }
.canvas-lab__inspector label { display: inline-flex; align-items: center; gap: .4rem; }
.canvas-lab__inspector input { min-width: 14rem; min-height: 2rem; padding: .3rem .55rem; border: 1px solid #ccd8ce; border-radius: .45rem; font: inherit; }
.canvas-lab__stage { position: relative; min-height: 0; overflow: hidden; border: 1px solid #cbd6ce; border-radius: .9rem; background: #f8f6ef; box-shadow: 0 16px 40px #324a3d12; }
.canvas-lab__svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; outline-offset: -4px; }
.canvas-lab__svg { user-select: none; -webkit-user-select: none; }
.canvas-node { fill: #fffefa; stroke: #31574b; stroke-width: 2; rx: 8; }
.canvas-node.selected, .canvas-shape.selected { stroke: #087f67; stroke-width: 3; }
.canvas-shape { fill: #d9efe4; stroke: #54806e; stroke-width: 2; }
.canvas-path { fill: none; stroke: #b35b3f; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
.canvas-path.selected { stroke: #087f67; }
.canvas-edge { fill: none; stroke: #31544d; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.canvas-edge.selected { stroke: #087f67; stroke-width: 4; }
.canvas-port { fill: #24433d; stroke: white; stroke-width: 2; cursor: crosshair; }
.canvas-port--preview { fill: #0a9c78; stroke: white; stroke-width: 2; }
.canvas-endpoint-handle { fill: white; stroke: #bf5c3a; stroke-width: 2.5; cursor: crosshair; }
.canvas-segment-handle { fill: #fffefa; stroke: #087f67; stroke-width: 2; cursor: move; }
.canvas-label { fill: #24433d; font-size: 14px; font-weight: 700; pointer-events: none; }
.canvas-text { fill: #253930; font: 650 16px system-ui, sans-serif; pointer-events: none; }
.canvas-text.selected { fill: #087f67; }
.canvas-connector-preview { fill: none; stroke: #087f67; stroke-width: 3; stroke-dasharray: 7 5; pointer-events: none; }
.canvas-resize-handle { fill: white; stroke: #087f67; stroke-width: 2; vector-effect: non-scaling-stroke; cursor: nwse-resize; }
@media (max-width: 760px) { .canvas-lab { grid-template-rows: auto auto minmax(25rem, 58vh); } }
</style>
