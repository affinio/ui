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
  refreshVisible()
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
    const geometry = createEntityGeometry(id, scene.entities)
    if (!geometry) {
      continue
    }
    entities.push(Object.freeze({ id, kind: geometry.kind, layer: "svg", geometry, selected: selected.has(id) }))
  }
  const activeGeometries = entities.filter((entity) => entity.selected).map((entity) => entity.geometry)
  const anchorGeometries = activeGeometries.filter((geometry) => geometry.kind !== "edge")
  return Object.freeze({
    ids: Object.freeze(entities.map((entity) => entity.id)),
    nodes: freezeKind(entities, "node"),
    edges: freezeKind(entities, "edge"),
    texts: freezeKind(entities, "text"),
    shapes: freezeKind(entities, "shape"),
    ports: freezeKind(entities, "port"),
    activeHandles: Object.freeze(activeGeometries.flatMap(createHandles)),
    overlayAnchors: Object.freeze(anchorGeometries.map(createOverlayAnchor)),
  })
}

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

function createOverlayAnchor(geometry: DiagramGeometry): DiagramOverlayAnchor {
  return { id: geometry.id, kind: geometry.kind, rect: geometry.hitBounds }
}

function inflate(rect: DiagramRect, amount: number): DiagramRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }
}
