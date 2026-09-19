import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { createEntityGeometry, type DiagramGeometry, type DiagramId, type DiagramRect } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import type { DiagramHandle, DiagramOverlayAnchor, DiagramRenderEntity, DiagramVisibleProjection } from "./types.js"

export type DiagramVisibleEntitiesOptions = Readonly<{
  overscan?: number
  includeSelection?: boolean
}>

export type DiagramVisibleEntitiesController = Readonly<{
  projection: ShallowRef<DiagramVisibleProjection>
  refreshVisible: (bounds?: DiagramRect) => void
  dispose: () => void
}>

const EMPTY_PROJECTION: DiagramVisibleProjection = Object.freeze({
  ids: Object.freeze([]),
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
  texts: Object.freeze([]),
  shapes: Object.freeze([]),
  ports: Object.freeze([]),
  activeHandles: Object.freeze([]),
  overlayAnchors: Object.freeze([]),
})

export function useDiagramVisibleEntities(controller: DiagramEngineController, options: DiagramVisibleEntitiesOptions = {}): DiagramVisibleEntitiesController {
  const projection = shallowRef<DiagramVisibleProjection>(EMPTY_PROJECTION)
  const refreshVisible = (bounds?: DiagramRect) => {
    const viewportBounds: DiagramRect = bounds ?? controller.scene.value.viewport
    projection.value = buildProjection(controller, inflate(viewportBounds, options.overscan ?? 0), options.includeSelection ?? true)
  }
  const subscription = controller.engine.subscribe(() => refreshVisible())
  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
  }
  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }
  return { projection, refreshVisible, dispose }
}

function buildProjection(controller: DiagramEngineController, bounds: DiagramRect, includeSelection: boolean): DiagramVisibleProjection {
  const scene = controller.scene.value
  const ids = new Set(controller.engine.queryVisible(bounds))
  if (includeSelection) {
    for (const id of scene.selection.ids) {
      ids.add(id)
    }
  }
  const selected = new Set(scene.selection.ids)
  const entities: DiagramRenderEntity[] = []
  for (const id of ids) {
    const geometry = controller.engine.getGeometrySnapshot(id)
    if (!geometry) {
      continue
    }
    entities.push(Object.freeze({ id, kind: geometry.kind, layer: "svg", geometry, selected: selected.has(id) }))
  }
  const activeGeometries = entities.filter((entity) => entity.selected).map((entity) => entity.geometry)
  const anchorGeometries = activeGeometries.filter((geometry) => geometry.kind !== "edge")
  const activeHandles = anchorGeometries.length > 1 ? createGroupHandles(anchorGeometries) : activeGeometries.flatMap(createHandles)
  return Object.freeze({
    ids: Object.freeze(entities.map((entity) => entity.id)),
    nodes: freezeKind(entities, "node"),
    edges: freezeKind(entities, "edge"),
    texts: freezeKind(entities, "text"),
    shapes: freezeKind(entities, "shape"),
    ports: freezeKind(entities, "port"),
    activeHandles: Object.freeze(activeHandles),
    overlayAnchors: Object.freeze(anchorGeometries.map(createOverlayAnchor)),
  })
}

const SELECTION_OWNER_ID = "__selection__"

function freezeKind(entities: ReadonlyArray<DiagramRenderEntity>, kind: DiagramRenderEntity["kind"]): ReadonlyArray<DiagramRenderEntity> {
  return Object.freeze(entities.filter((entity) => entity.kind === kind))
}

function createHandles(geometry: DiagramGeometry): DiagramHandle[] {
  if (geometry.kind === "edge") {
    return []
  }
  const rect = geometry.unrotatedBounds ?? geometry.bounds
  if (geometry.kind === "port") {
    return [{ id: `${geometry.id}:port`, ownerId: geometry.id, kind: "port", point: geometry.point ?? { x: rect.x, y: rect.y } }]
  }
  const corners = geometry.corners ?? [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return [
    { id: `${geometry.id}:nw`, ownerId: geometry.id, kind: "resize", point: corners[0]! },
    { id: `${geometry.id}:ne`, ownerId: geometry.id, kind: "resize", point: corners[1]! },
    { id: `${geometry.id}:se`, ownerId: geometry.id, kind: "resize", point: corners[2]! },
    { id: `${geometry.id}:sw`, ownerId: geometry.id, kind: "resize", point: corners[3]! },
  ]
}

function createGroupHandles(geometries: ReadonlyArray<DiagramGeometry>): DiagramHandle[] {
  const rect = unionRects(geometries.map((geometry) => geometry.bounds))
  if (!rect) return []
  return [
    { id: `${SELECTION_OWNER_ID}:nw`, ownerId: SELECTION_OWNER_ID, kind: "resize", point: { x: rect.x, y: rect.y } },
    { id: `${SELECTION_OWNER_ID}:ne`, ownerId: SELECTION_OWNER_ID, kind: "resize", point: { x: rect.x + rect.width, y: rect.y } },
    { id: `${SELECTION_OWNER_ID}:se`, ownerId: SELECTION_OWNER_ID, kind: "resize", point: { x: rect.x + rect.width, y: rect.y + rect.height } },
    { id: `${SELECTION_OWNER_ID}:sw`, ownerId: SELECTION_OWNER_ID, kind: "resize", point: { x: rect.x, y: rect.y + rect.height } },
  ]
}

function unionRects(rects: ReadonlyArray<DiagramRect>): DiagramRect | null {
  if (!rects.length) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const rect of rects) {
    minX = Math.min(minX, rect.x)
    minY = Math.min(minY, rect.y)
    maxX = Math.max(maxX, rect.x + rect.width)
    maxY = Math.max(maxY, rect.y + rect.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function createOverlayAnchor(geometry: DiagramGeometry): DiagramOverlayAnchor {
  return { id: geometry.id, kind: geometry.kind, rect: geometry.hitBounds }
}

function inflate(rect: DiagramRect, amount: number): DiagramRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }
}
