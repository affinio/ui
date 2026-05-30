<script setup lang="ts">
import { computed, ref } from "vue"
import {
  getDomEntityStyle,
  getSvgEntityProps,
  useDiagramEngine,
  useDiagramPointerController,
  useDiagramSelection,
  useDiagramViewport,
  useDiagramVisibleEntities,
  type DiagramRenderEntity,
} from "@affino/diagram-vue"
import { createEntityGeometry, type DiagramGeometry, type DiagramPoint, type DiagramSceneInput } from "@affino/diagram-core"

const stageRef = ref<HTMLElement | null>(null)

const WORLD_BOUNDS = Object.freeze({ x: -40, y: -40, width: 980, height: 460 })
const MIN_ZOOM = 0.45
const MAX_ZOOM = 2.4

const initialScene: DiagramSceneInput = {
  nodes: [
    { id: "utility", kind: "node", x: 60, y: 70, width: 150, height: 78, portIds: ["utility-out"] },
    { id: "transformer-a", kind: "node", x: 360, y: 48, width: 170, height: 96, portIds: ["transformer-a-in", "transformer-a-out"] },
    { id: "feeder-north", kind: "node", x: 710, y: 30, width: 150, height: 78, portIds: ["feeder-north-in"] },
    { id: "feeder-south", kind: "node", x: 710, y: 190, width: 150, height: 78, portIds: ["feeder-south-in"] },
    { id: "backup", kind: "node", x: 350, y: 250, width: 160, height: 82, portIds: ["backup-out"] },
  ],
  ports: [
    { id: "utility-out", kind: "port", nodeId: "utility", x: 150, y: 39 },
    { id: "transformer-a-in", kind: "port", nodeId: "transformer-a", x: 0, y: 48 },
    { id: "transformer-a-out", kind: "port", nodeId: "transformer-a", x: 170, y: 48 },
    { id: "feeder-north-in", kind: "port", nodeId: "feeder-north", x: 0, y: 39 },
    { id: "feeder-south-in", kind: "port", nodeId: "feeder-south", x: 0, y: 39 },
    { id: "backup-out", kind: "port", nodeId: "backup", x: 160, y: 41 },
  ],
  edges: [
    { id: "edge-utility-transformer", kind: "edge", source: { kind: "port", portId: "utility-out" }, target: { kind: "port", portId: "transformer-a-in" } },
    { id: "edge-transformer-north", kind: "edge", source: { kind: "port", portId: "transformer-a-out" }, target: { kind: "port", portId: "feeder-north-in" }, points: [{ x: 620, y: 96 }, { x: 620, y: 69 }] },
    { id: "edge-transformer-south", kind: "edge", source: { kind: "port", portId: "transformer-a-out" }, target: { kind: "port", portId: "feeder-south-in" }, points: [{ x: 620, y: 96 }, { x: 620, y: 229 }] },
    { id: "edge-backup-south", kind: "edge", source: { kind: "port", portId: "backup-out" }, target: { kind: "port", portId: "feeder-south-in" }, points: [{ x: 600, y: 291 }, { x: 600, y: 229 }] },
  ],
  texts: [
    { id: "label-utility", kind: "text", x: 82, y: 99, text: "Utility source", width: 112, height: 18 },
    { id: "label-transformer", kind: "text", x: 386, y: 84, text: "Transformer A", width: 118, height: 18 },
    { id: "label-north", kind: "text", x: 737, y: 59, text: "North feeder", width: 96, height: 18 },
    { id: "label-south", kind: "text", x: 737, y: 219, text: "South feeder", width: 96, height: 18 },
    { id: "label-backup", kind: "text", x: 383, y: 282, text: "Backup feed", width: 94, height: 18 },
  ],
  shapes: [
    { id: "bus-a", kind: "shape", shape: "rect", x: 580, y: 54, width: 10, height: 210 },
  ],
  viewport: { x: 0, y: 0, width: 980, height: 420, zoom: 1 },
}

const diagram = useDiagramEngine(initialScene)
const selection = useDiagramSelection(diagram)
const visible = useDiagramVisibleEntities(diagram, { overscan: 80 })
const viewport = useDiagramViewport(diagram, { element: stageRef })
const pointer = useDiagramPointerController(diagram, { toWorldPoint })
const pointerProps = pointer.getSvgPointerProps()

const selectedLabel = computed(() => {
  const id = selection.selection.value.primaryId
  return id ? id.replace(/-/g, " ") : "none"
})
const revision = computed(() => diagram.scene.value.revision)
const visibleCount = computed(() => visible.projection.value.ids.length)
const tool = computed(() => pointer.state.value.tool)
const previewDelta = computed(() => pointer.state.value.previewDelta)
const displayViewport = computed(() => {
  const current = viewport.viewport.value
  const delta = pointer.state.value.tool === "pan" ? previewDelta.value : null
  if (!delta) {
    return current
  }
  return { ...current, x: current.x - delta.x, y: current.y - delta.y }
})
const viewBox = computed(() => {
  const current = displayViewport.value
  return `${current.x} ${current.y} ${Math.max(1, current.width)} ${Math.max(1, current.height)}`
})
const zoomPercent = computed(() => `${Math.round(viewport.viewport.value.zoom * 100)}%`)
const minimapViewBox = computed(() => `${WORLD_BOUNDS.x} ${WORLD_BOUNDS.y} ${WORLD_BOUNDS.width} ${WORLD_BOUNDS.height}`)
const minimapViewport = computed(() => ({
  x: displayViewport.value.x,
  y: displayViewport.value.y,
  width: displayViewport.value.width,
  height: displayViewport.value.height,
}))
const labelLayerStyle = computed(() => {
  const current = displayViewport.value
  return {
    transform: `matrix(${current.zoom}, 0, 0, ${current.zoom}, ${-current.x * current.zoom}, ${-current.y * current.zoom})`,
  }
})
const minimapNodes = computed(() => {
  const scene = diagram.scene.value
  return scene.order.nodeIds
    .map((id) => createEntityGeometry(id, scene.entities))
    .filter((geometry): geometry is DiagramGeometry => geometry !== null)
})

function toWorldPoint(event: PointerEvent): DiagramPoint {
  const rect = stageRef.value?.getBoundingClientRect()
  const current = viewport.viewport.value
  if (!rect) {
    return { x: event.clientX + current.x, y: event.clientY + current.y }
  }
  return {
    x: current.x + (event.clientX - rect.left) / current.zoom,
    y: current.y + (event.clientY - rect.top) / current.zoom,
  }
}

function entityTransform(entity: DiagramRenderEntity): string | undefined {
  const delta = previewDelta.value
  if (!delta || !entity.selected) {
    return undefined
  }
  return `translate(${delta.x} ${delta.y})`
}

function textStyle(entity: DiagramRenderEntity): Readonly<Record<string, string>> {
  const style = getDomEntityStyle(entity)
  const delta = previewDelta.value
  if (!delta || !entity.selected || pointer.state.value.tool === "pan") {
    return style
  }
  return {
    ...style,
    transform: `translate(${entity.geometry.bounds.x + delta.x}px, ${entity.geometry.bounds.y + delta.y}px)`,
  }
}

function focusEntity(id: string): void {
  selection.setSelection([id], id)
}

function nudgeSelected(delta: DiagramPoint): void {
  const ids = selection.selection.value.ids
  if (!ids.length) {
    return
  }
  diagram.dispatch({ type: "moveEntities", ids, delta, historyKey: "demo-nudge" })
}

function snapSelectedToGrid(): void {
  const id = selection.selection.value.primaryId
  if (!id) {
    return
  }
  const entity = visible.projection.value.nodes.find((item) => item.id === id)
  if (!entity) {
    return
  }
  const snap = diagram.engine.snapPoint({ x: entity.geometry.bounds.x, y: entity.geometry.bounds.y }, { gridSize: 24 })
  diagram.dispatch({
    type: "moveEntities",
    ids: selection.selection.value.ids,
    delta: { x: snap.point.x - entity.geometry.bounds.x, y: snap.point.y - entity.geometry.bounds.y },
  })
}

function panViewport(delta: DiagramPoint): void {
  const current = viewport.viewport.value
  viewport.setViewport({ x: current.x + delta.x, y: current.y + delta.y })
}

function zoomViewport(multiplier: number, anchor?: DiagramPoint): void {
  const current = viewport.viewport.value
  const nextZoom = clamp(current.zoom * multiplier, MIN_ZOOM, MAX_ZOOM)
  if (nextZoom === current.zoom) {
    return
  }
  const anchorPoint = anchor ?? { x: current.x + current.width / 2, y: current.y + current.height / 2 }
  const nextWidth = current.width * (current.zoom / nextZoom)
  const nextHeight = current.height * (current.zoom / nextZoom)
  const anchorRatioX = (anchorPoint.x - current.x) / current.width
  const anchorRatioY = (anchorPoint.y - current.y) / current.height
  viewport.setViewport({
    x: anchorPoint.x - nextWidth * anchorRatioX,
    y: anchorPoint.y - nextHeight * anchorRatioY,
    width: nextWidth,
    height: nextHeight,
    zoom: nextZoom,
  })
}

let wheelFrame: number | null = null
let pendingWheelPan: DiagramPoint = { x: 0, y: 0 }

function handleWheel(event: WheelEvent): void {
  event.preventDefault()
  if (event.ctrlKey || event.metaKey) {
    zoomViewport(event.deltaY < 0 ? 1.08 : 0.92, toWorldPoint(event as unknown as PointerEvent))
    return
  }
  pendingWheelPan = {
    x: pendingWheelPan.x + event.deltaX / viewport.viewport.value.zoom,
    y: pendingWheelPan.y + event.deltaY / viewport.viewport.value.zoom,
  }
  if (wheelFrame !== null) {
    return
  }
  wheelFrame = requestAnimationFrame(() => {
    wheelFrame = null
    const delta = pendingWheelPan
    pendingWheelPan = { x: 0, y: 0 }
    panViewport(delta)
  })
}

function centerViewport(point: DiagramPoint): void {
  const current = viewport.viewport.value
  viewport.setViewport({ x: point.x - current.width / 2, y: point.y - current.height / 2 })
}

function handleMinimapPointer(event: PointerEvent): void {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = WORLD_BOUNDS.x + ((event.clientX - rect.left) / rect.width) * WORLD_BOUNDS.width
  const y = WORLD_BOUNDS.y + ((event.clientY - rect.top) / rect.height) * WORLD_BOUNDS.height
  centerViewport({ x, y })
}

function resetViewport(): void {
  viewport.setViewport({ x: 0, y: 0, width: 980, height: 420, zoom: 1 })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
</script>

<template>
  <section class="diagram-page">
    <aside class="diagram-sidebar" aria-label="Diagram controls">
      <header>
        <p class="diagram-eyebrow">@affino/diagram-vue</p>
        <h1>Switchgear diagram workspace</h1>
      </header>

      <div class="diagram-toolbar" role="toolbar" aria-label="Diagram tools">
        <button :class="{ active: tool === 'select' }" type="button" @click="pointer.setTool('select')">Select</button>
        <button :class="{ active: tool === 'pan' }" type="button" @click="pointer.setTool('pan')">Pan</button>
        <button type="button" @click="diagram.dispatch({ type: 'undo' })">Undo</button>
        <button type="button" @click="diagram.dispatch({ type: 'redo' })">Redo</button>
      </div>

      <div class="diagram-viewport-controls" aria-label="Canvas navigation">
        <button type="button" @click="panViewport({ x: -80, y: 0 })">←</button>
        <button type="button" @click="panViewport({ x: 0, y: -60 })">↑</button>
        <button type="button" @click="panViewport({ x: 0, y: 60 })">↓</button>
        <button type="button" @click="panViewport({ x: 80, y: 0 })">→</button>
        <button type="button" @click="zoomViewport(0.85)">−</button>
        <output aria-label="Zoom level">{{ zoomPercent }}</output>
        <button type="button" @click="zoomViewport(1.18)">+</button>
        <button type="button" @click="resetViewport">Fit</button>
      </div>

      <svg class="diagram-minimap" :viewBox="minimapViewBox" aria-label="Canvas minimap" style="height: 9rem" @pointerdown="handleMinimapPointer">
        <rect class="diagram-minimap__bg" :x="WORLD_BOUNDS.x" :y="WORLD_BOUNDS.y" :width="WORLD_BOUNDS.width" :height="WORLD_BOUNDS.height" />
        <rect v-for="node in minimapNodes" :key="node.id" class="diagram-minimap__node" :x="node.bounds.x" :y="node.bounds.y" :width="node.bounds.width" :height="node.bounds.height" />
        <rect class="diagram-minimap__viewport" :x="minimapViewport.x" :y="minimapViewport.y" :width="minimapViewport.width" :height="minimapViewport.height" />
      </svg>

      <div class="diagram-list" aria-label="Entities">
        <button type="button" @click="focusEntity('utility')">Utility source</button>
        <button type="button" @click="focusEntity('transformer-a')">Transformer A</button>
        <button type="button" @click="focusEntity('feeder-north')">North feeder</button>
        <button type="button" @click="focusEntity('feeder-south')">South feeder</button>
        <button type="button" @click="focusEntity('backup')">Backup feed</button>
      </div>

      <div class="diagram-actions" aria-label="Selected entity actions">
        <button type="button" @click="nudgeSelected({ x: -12, y: 0 })">←</button>
        <button type="button" @click="nudgeSelected({ x: 0, y: -12 })">↑</button>
        <button type="button" @click="nudgeSelected({ x: 0, y: 12 })">↓</button>
        <button type="button" @click="nudgeSelected({ x: 12, y: 0 })">→</button>
        <button class="wide" type="button" @click="snapSelectedToGrid">Snap grid</button>
        <button class="wide" type="button" @click="resetViewport">Reset view</button>
      </div>

      <dl class="diagram-stats">
        <div>
          <dt>Selected</dt>
          <dd>{{ selectedLabel }}</dd>
        </div>
        <div>
          <dt>Visible</dt>
          <dd>{{ visibleCount }}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{{ revision }}</dd>
        </div>
      </dl>
    </aside>

    <div class="diagram-shell">
      <div ref="stageRef" class="diagram-stage">
        <svg class="diagram-svg" :viewBox="viewBox" v-bind="pointerProps" @wheel="handleWheel">
          <defs>
            <pattern id="diagram-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" class="diagram-grid-line" />
            </pattern>
          </defs>
          <rect class="diagram-grid-fill" :x="displayViewport.x" :y="displayViewport.y" :width="displayViewport.width" :height="displayViewport.height" fill="url(#diagram-grid)" />
          <rect v-for="shape in visible.projection.value.shapes" :key="shape.id" class="diagram-bus" v-bind="getSvgEntityProps(shape)" />
          <polyline v-for="edge in visible.projection.value.edges" :key="edge.id" class="diagram-edge" :class="{ selected: edge.selected }" v-bind="getSvgEntityProps(edge)" :transform="entityTransform(edge)" />
          <rect v-for="node in visible.projection.value.nodes" :key="node.id" class="diagram-node" :class="{ selected: node.selected }" v-bind="getSvgEntityProps(node)" :transform="entityTransform(node)" />
          <circle v-for="port in visible.projection.value.ports" :key="port.id" class="diagram-port" v-bind="getSvgEntityProps(port)" :transform="entityTransform(port)" />
          <rect v-for="anchor in visible.projection.value.overlayAnchors" :key="anchor.id" class="diagram-anchor" :x="anchor.rect.x" :y="anchor.rect.y" :width="anchor.rect.width" :height="anchor.rect.height" />
          <circle v-for="handle in visible.projection.value.activeHandles" :key="handle.id" class="diagram-handle" :cx="handle.point.x" :cy="handle.point.y" r="5" />
        </svg>

        <div class="diagram-label-layer" :style="labelLayerStyle" aria-hidden="true">
          <span v-for="text in visible.projection.value.texts" :key="text.id" class="diagram-label" :style="textStyle(text)">
            {{ diagram.scene.value.entities.textsById.get(text.id)?.text }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.diagram-page {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 22rem minmax(0, 1fr);
  gap: 1rem;
  color: #24312f;
}

.diagram-sidebar,
.diagram-shell {
  border: 1px solid rgba(35, 49, 46, 0.14);
  background: rgba(255, 252, 247, 0.86);
  box-shadow: 0 18px 42px rgba(76, 65, 49, 0.08);
}

.diagram-sidebar {
  min-height: 0;
  overflow: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-radius: 8px;
}

.diagram-sidebar h1 {
  margin: 0.2rem 0 0;
  font-size: 1.45rem;
  line-height: 1.15;
  letter-spacing: 0;
}

.diagram-eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.7rem;
  font-weight: 700;
  color: #5d6e68;
}

.diagram-toolbar,
.diagram-viewport-controls,
.diagram-list,
.diagram-actions,
.diagram-stats {
  display: grid;
  gap: 0.5rem;
}

.diagram-toolbar {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.diagram-actions {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.diagram-actions .wide {
  grid-column: span 2;
}

button {
  min-height: 2.35rem;
  border: 1px solid rgba(35, 49, 46, 0.16);
  border-radius: 6px;
  background: #fffdf9;
  color: #24312f;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
}

button:hover,
button.active {
  background: #24433d;
  color: #fffaf3;
}

.diagram-viewport-controls {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.diagram-viewport-controls output {
  min-height: 2.35rem;
  display: grid;
  place-items: center;
  border: 1px solid rgba(35, 49, 46, 0.12);
  border-radius: 6px;
  background: rgba(255, 253, 249, 0.68);
  font-size: 0.82rem;
  font-weight: 800;
}

.diagram-minimap {
  display: block;
  width: 100%;
  height: 9rem;
  flex: 0 0 9rem;
  border: 1px solid rgba(35, 49, 46, 0.16);
  border-radius: 8px;
  background: #eef2ed;
  cursor: crosshair;
}

.diagram-minimap__bg {
  fill: #f8f4ed;
}

.diagram-minimap__node {
  fill: #41665d;
  opacity: 0.82;
}

.diagram-minimap__viewport {
  fill: rgba(13, 127, 104, 0.14);
  stroke: #0d7f68;
  stroke-width: 8;
  vector-effect: non-scaling-stroke;
}

.diagram-list button {
  text-align: left;
  padding-inline: 0.8rem;
}

.diagram-stats {
  margin: 0;
  grid-template-columns: 1fr;
}

.diagram-stats div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  border-top: 1px solid rgba(35, 49, 46, 0.12);
  padding-top: 0.65rem;
}

.diagram-stats dt,
.diagram-stats dd {
  margin: 0;
  font-size: 0.84rem;
}

.diagram-stats dt {
  color: #697872;
}

.diagram-stats dd {
  font-weight: 800;
  text-transform: capitalize;
}

.diagram-shell {
  min-width: 0;
  min-height: 0;
  border-radius: 8px;
  overflow: hidden;
}

.diagram-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 30rem;
  overflow: hidden;
  background: #f7f3ec;
}

.diagram-svg,
.diagram-label-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.diagram-svg {
  touch-action: none;
  user-select: none;
}

.diagram-label-layer {
  transform-origin: 0 0;
  will-change: transform;
}

.diagram-grid-line {
  fill: none;
  stroke: rgba(36, 67, 61, 0.11);
  stroke-width: 1;
}

.diagram-grid-fill {
  pointer-events: none;
}

.diagram-node {
  fill: #fffefa;
  stroke: #28463f;
  stroke-width: 2;
  rx: 6;
}

.diagram-node.selected {
  fill: #e8f5ef;
  stroke: #0d7f68;
  stroke-width: 3;
}

.diagram-bus {
  fill: #c85d3c;
  stroke: #8d321e;
  stroke-width: 1;
}

.diagram-edge {
  fill: none;
  stroke: #31544d;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.diagram-edge.selected {
  stroke: #0d7f68;
}

.diagram-port {
  fill: #24433d;
  stroke: #fffaf3;
  stroke-width: 2;
}

.diagram-anchor {
  fill: none;
  stroke: rgba(13, 127, 104, 0.28);
  stroke-dasharray: 5 4;
  pointer-events: none;
}

.diagram-handle {
  fill: #0d7f68;
  stroke: #fffaf3;
  stroke-width: 2;
  pointer-events: none;
}

.diagram-label-layer {
  pointer-events: none;
}

.diagram-label {
  display: grid;
  place-items: center;
  color: #24312f;
  font-size: 0.82rem;
  font-weight: 800;
  text-align: center;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .diagram-page {
    grid-template-columns: minmax(0, 1fr);
  }

  .diagram-sidebar {
    max-height: 18rem;
  }
}
</style>
