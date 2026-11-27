import { getCurrentScope, onScopeDispose, shallowRef, unref, watch } from "vue"
import type { MaybeRef, ShallowRef } from "vue"
import { createEntityGeometry, resolveDiagramTextContent, rotatePoint, type DiagramContentOverrides, type DiagramGeometry, type DiagramId, type DiagramPoint, type DiagramRect, type DiagramResizeHandle } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import { createDiagramEnginePresentationSource } from "@affino/diagram-core"
import type { DiagramPresentationSource } from "@affino/diagram-core"
import type { DiagramPointerController } from "./useDiagramPointerController.js"
import type { DiagramDragPreviewMode, DiagramHandle, DiagramInteractionPreviewMode, DiagramOverlayAnchor, DiagramRenderEntity, DiagramVisibleProjection } from "./types.js"

export type DiagramVisibleEntitiesOptions = Readonly<{
  overscan?: number
  includeSelection?: boolean
  /** Applies transient pointer geometry to entities, points, and selection handles during an active gesture. */
  pointer?: MaybeRef<DiagramPointerController>
  /** Controls presentation of every Core-resolved candidate during an active edit. Defaults to live. */
  interactionPreviewMode?: MaybeRef<DiagramInteractionPreviewMode>
  /** Read-only content presentation. Reactive Maps may be replaced or mutated to refresh the projection. */
  contentOverrides?: MaybeRef<DiagramContentOverrides | undefined>
  /** @deprecated Use `interactionPreviewMode`; removed in next major (TODO(next-major)). */
  dragPreviewMode?: MaybeRef<DiagramDragPreviewMode>
}>

export type DiagramVisibleEntitiesController = Readonly<{
  projection: ShallowRef<DiagramVisibleProjection>
  refreshVisible: (bounds?: DiagramRect) => void
  dispose: () => void
}>

const EMPTY_PROJECTION: DiagramVisibleProjection = Object.freeze({
  sourceId: "",
  renderScopeId: "",
  interactionPreviewMode: "live",
  interactionPreview: Object.freeze([]),
  dragPreviewMode: "live",
  dragPreview: Object.freeze([]),
  ordered: Object.freeze([]),
  ids: Object.freeze([]),
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
  texts: Object.freeze([]),
  shapes: Object.freeze([]),
  tables: Object.freeze([]),
  ports: Object.freeze([]),
  activeHandles: Object.freeze([]),
  overlayAnchors: Object.freeze([]),
})

let nextProjectionId = 1

export function useDiagramVisibleEntities(input: DiagramEngineController | DiagramPresentationSource, options: DiagramVisibleEntitiesOptions = {}): DiagramVisibleEntitiesController {
  const editable = "dispatch" in input
  const source = editable ? createDiagramEnginePresentationSource(input.engine) : input
  const renderScopeId = `diagram-projection-${nextProjectionId++}`
  const getScene = () => editable ? input.scene.value : source.getScene()
  const projection = shallowRef<DiagramVisibleProjection>(EMPTY_PROJECTION)
  const entityCache = new Map<DiagramId, { geometry: DiagramGeometry; selected: boolean; displayText?: string; entity: DiagramRenderEntity }>()
  const getPointer = () => editable && options.pointer ? unref(options.pointer) : undefined
  const getInteractionPreviewMode = () => options.interactionPreviewMode
    ? unref(options.interactionPreviewMode)
    : options.dragPreviewMode ? unref(options.dragPreviewMode) : "live"
  const getContentOverrides = () => options.contentOverrides ? unref(options.contentOverrides) : undefined
  const refreshVisible = (bounds?: DiagramRect) => {
    const viewportBounds: DiagramRect = bounds ?? getScene().viewport
    projection.value = buildProjection(
      source,
      renderScopeId,
      getScene(),
      inflate(viewportBounds, options.overscan ?? 0),
      editable && (options.includeSelection ?? true),
      entityCache,
      getPointer(),
      getInteractionPreviewMode(),
      getContentOverrides(),
    )
  }
  const subscription = source.subscribe(() => refreshVisible())
  const stopPointerWatch = options.pointer || options.interactionPreviewMode || options.dragPreviewMode || options.contentOverrides ? watch(
    () => [getPointer()?.state.value, getInteractionPreviewMode(), getContentOverrides()] as const,
    () => refreshVisible(),
    { deep: true },
  ) : null
  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
    stopPointerWatch?.()
    if (editable) source.dispose()
  }
  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }
  return { projection, refreshVisible, dispose }
}

function buildProjection(
  source: DiagramPresentationSource,
  renderScopeId: string,
  scene: import("@affino/diagram-core").DiagramScene,
  bounds: DiagramRect,
  includeSelection: boolean,
  entityCache: Map<DiagramId, { geometry: DiagramGeometry; selected: boolean; displayText?: string; entity: DiagramRenderEntity }>,
  pointer?: DiagramPointerController,
  interactionPreviewMode: DiagramInteractionPreviewMode = "live",
  contentOverrides?: DiagramContentOverrides,
): DiagramVisibleProjection {
  const pointerState = pointer?.state.value
  const previewActive = pointerState?.active === true
  const preserveCommittedPresentation = pointerState?.active === true && interactionPreviewMode !== "live"
  const ids = new Set(source.queryVisible(bounds))
  if (includeSelection) {
    for (const id of scene.selection.ids) {
      ids.add(id)
    }
  }
  const selected = new Set(includeSelection ? scene.selection.ids : [])
  const entities: DiagramRenderEntity[] = []
  const interactionPreview: DiagramRenderEntity[] = []
  for (const id of ids) {
    const previewGeometry = previewActive ? pointer?.getPreviewGeometry(id) : null
    const committedGeometry = contentOverrides?.textByEntityId?.has(id)
      ? source.getPresentedGeometrySnapshot(id, contentOverrides)
      : source.getGeometrySnapshot(id)
    if (preserveCommittedPresentation && previewGeometry && committedGeometry && previewGeometry !== committedGeometry) {
      interactionPreview.push(Object.freeze({ id, kind: previewGeometry.kind, layer: "svg" as const, geometry: previewGeometry, selected: false, ...(previewGeometry.style ? { style: previewGeometry.style } : {}) }))
    }
    const geometry = preserveCommittedPresentation ? committedGeometry : previewGeometry ?? committedGeometry
    if (!geometry) {
      continue
    }
    const isSelected = selected.has(id)
    const cached = entityCache.get(id)
    const text = scene.entities.textsById.get(id)
    const displayText = text ? resolveDiagramTextContent(contentOverrides, id, text.text) : undefined
    if (cached?.geometry === geometry && cached.selected === isSelected && cached.displayText === displayText) {
      entities.push(cached.entity)
      continue
    }
    const entity = Object.freeze({ id, kind: geometry.kind, layer: "svg" as const, geometry, selected: isSelected, ...(geometry.style ? { style: geometry.style } : {}), ...(displayText !== undefined ? { displayText } : {}) })
    entityCache.set(id, { geometry, selected: isSelected, displayText, entity })
    entities.push(entity)
  }
  const renderRank = new Map(source.getRenderOrder({ includePorts: true }).map((id, index) => [id, index]))
  entities.sort((a, b) => (renderRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (renderRank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
  for (const id of entityCache.keys()) {
    if (!ids.has(id)) entityCache.delete(id)
  }
  const activeGeometries = entities.filter((entity) => entity.selected).map((entity) => entity.geometry)
  const anchorGeometries = activeGeometries.filter((geometry) => geometry.kind !== "edge" || Boolean(geometry.corners?.length))
  const activeHandles = [
    ...(anchorGeometries.length > 1 ? createGroupHandles(anchorGeometries) : activeGeometries.flatMap(createHandles)),
    ...activeGeometries.flatMap((geometry) => geometry.kind === "edge" ? createEdgeWaypointHandles(geometry, scene.entities.edgesById.get(geometry.id)) : geometry.kind === "shape" ? [...createPathVertexHandles(geometry), ...createBezierHandles(geometry)] : []),
    ...activeGeometries.filter((geometry) => geometry.kind === "edge").flatMap(createEdgeEndpointHandles),
    ...activeGeometries.filter((geometry) => geometry.kind === "edge").flatMap((geometry) => createEdgeSegmentHandles(geometry, scene.entities.edgesById.get(geometry.id))),
  ]
  return Object.freeze({
    sourceId: source.sourceId,
    renderScopeId,
    interactionPreviewMode,
    interactionPreview: Object.freeze(interactionPreview),
    dragPreviewMode: interactionPreviewMode,
    dragPreview: Object.freeze(interactionPreview),
    ordered: Object.freeze(entities),
    ids: Object.freeze(entities.map((entity) => entity.id)),
    nodes: freezeKind(entities, "node"),
    edges: freezeKind(entities, "edge"),
    texts: freezeKind(entities, "text"),
    shapes: freezeKind(entities, "shape"),
    tables: freezeKind(entities, "table"),
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
  if (geometry.kind === "edge") return []
  const rect = geometry.unrotatedBounds ?? geometry.bounds
  if (geometry.kind === "port") {
    return [{ id: `${geometry.id}:port`, ownerId: geometry.id, kind: "port", point: geometry.point ?? { x: rect.x, y: rect.y } }]
  }
  const points = resizeHandlePoints(rect, geometry.rotation ?? 0, geometry.flipX === true, geometry.flipY === true)
  return (Object.entries(points) as Array<[DiagramResizeHandle, DiagramPoint]>).map(([handle, point]) => ({
    id: `${geometry.id}:${handle}`, ownerId: geometry.id, kind: "resize", resizeHandle: handle, point,
  }))
}

function createEdgeEndpointHandles(geometry: DiagramGeometry): DiagramHandle[] {
  if (geometry.kind !== "edge" || !geometry.path?.length) return []
  return [
    { id: `${geometry.id}:source`, ownerId: geometry.id, kind: "edge-endpoint", point: geometry.path[0]! },
    { id: `${geometry.id}:target`, ownerId: geometry.id, kind: "edge-endpoint", point: geometry.path[geometry.path.length - 1]! },
  ]
}

function createEdgeWaypointHandles(geometry: DiagramGeometry, edge?: import("@affino/diagram-core").DiagramEdge): DiagramHandle[] {
  if (edge?.routing?.mode === "auto") return (edge.routing.waypoints ?? []).map((point, index) => ({ id: `${geometry.id}:waypoint:${index}`, ownerId: geometry.id, kind: "waypoint", segmentIndex: index, point }))
  if (geometry.kind !== "edge" || !geometry.path || geometry.path.length < 3) return []
  return geometry.path.slice(1, -1).map((point, index) => ({ id: `${geometry.id}:waypoint:${index}`, ownerId: geometry.id, kind: "waypoint", segmentIndex: index, point }))
}

function createEdgeSegmentHandles(geometry: DiagramGeometry, edge?: import("@affino/diagram-core").DiagramEdge): DiagramHandle[] {
  if (geometry.kind !== "edge" || !geometry.path || geometry.path.length < 2) return []
  const path = geometry.path
  const hiddenSegments = new Set<number>()
  const axisAt = (index: number): "horizontal" | "vertical" | null => {
    const start = path[index]!, end = path[index + 1]!
    if (Math.abs(start.y - end.y) <= 1e-6 && start.x !== end.x) return "horizontal"
    if (Math.abs(start.x - end.x) <= 1e-6 && start.y !== end.y) return "vertical"
    return null
  }
  const sameRun = (left: number, right: number): boolean => {
    const axis = axisAt(left)
    if (!axis || axisAt(right) !== axis) return false
    const a = path[left]!, b = path[right]!
    return axis === "horizontal" ? a.y === b.y : a.x === b.x
  }
  if (edge && edge.source.kind !== "point") {
    for (let index = 0; index < path.length - 1 && (index === 0 || sameRun(index - 1, index)); index += 1) hiddenSegments.add(index)
  }
  if (edge && edge.target.kind !== "point") {
    for (let index = path.length - 2; index >= 0 && (index === path.length - 2 || sameRun(index, index + 1)); index -= 1) hiddenSegments.add(index)
  }
  const handles: DiagramHandle[] = []
  for (let index = 0; index < path.length - 1; index += 1) {
    if (hiddenSegments.has(index)) continue
    const start = path[index]!, end = path[index + 1]!
    const horizontal = Math.abs(start.y - end.y) <= 1e-6 && start.x !== end.x
    const vertical = Math.abs(start.x - end.x) <= 1e-6 && start.y !== end.y
    if (!horizontal && !vertical) continue
    handles.push({ id: `${geometry.id}:segment:${index}`, ownerId: geometry.id, kind: "edge-segment", segmentIndex: index, point: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } })
  }
  return handles
}

function createPathVertexHandles(geometry: DiagramGeometry): DiagramHandle[] {
  if (geometry.pathContours?.length) return []
  if (geometry.kind !== "shape" || !geometry.path || geometry.path.length < 2) return []
  return geometry.path.map((point, index) => ({ id: `${geometry.id}:vertex:${index}`, ownerId: geometry.id, kind: "path-vertex", point }))
}

function createBezierHandles(geometry: DiagramGeometry): DiagramHandle[] {
  if (geometry.kind !== "shape" || !geometry.pathContours?.length) return []
  const handles: DiagramHandle[] = []
  geometry.pathContours.forEach((contour, contourIndex) => {
    if (!contour.closed && contour.segments[0]?.kind === "cubic") handles.push({
      id: `${geometry.id}:bezier:${contourIndex}:0:anchor-start`, ownerId: geometry.id, kind: "bezier-anchor", contourIndex, segmentIndex: 0, bezierHandle: "anchor", anchorSide: "start", point: contour.segments[0].start,
    })
    contour.segments.forEach((segment, segmentIndex) => {
    if (segment.kind !== "cubic") return
    handles.push(
      { id: `${geometry.id}:bezier:${contourIndex}:${segmentIndex}:anchor`, ownerId: geometry.id, kind: "bezier-anchor", contourIndex, segmentIndex, bezierHandle: "anchor", anchorSide: "end", point: segment.end },
      { id: `${geometry.id}:bezier:${contourIndex}:${segmentIndex}:in`, ownerId: geometry.id, kind: "bezier-incoming", contourIndex, segmentIndex, bezierHandle: "incoming", point: segment.control2 },
      { id: `${geometry.id}:bezier:${contourIndex}:${segmentIndex}:out`, ownerId: geometry.id, kind: "bezier-outgoing", contourIndex, segmentIndex, bezierHandle: "outgoing", point: segment.control1 },
    )
    })
  })
  return handles
}

function createGroupHandles(geometries: ReadonlyArray<DiagramGeometry>): DiagramHandle[] {
  const rect = unionRects(geometries.map((geometry) => geometry.bounds))
  if (!rect) return []
  return (Object.entries(resizeHandlePoints(rect, 0, false, false)) as Array<[DiagramResizeHandle, DiagramPoint]>).map(([handle, point]) => ({
    id: `${SELECTION_OWNER_ID}:${handle}`, ownerId: SELECTION_OWNER_ID, kind: "resize", resizeHandle: handle, point,
  }))
}

function resizeHandlePoints(rect: DiagramRect, rotation: number, flipX: boolean, flipY: boolean): Record<DiagramResizeHandle, DiagramPoint> {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const local: Record<DiagramResizeHandle, DiagramPoint> = {
    nw: { x: left, y: top }, n: { x: center.x, y: top }, ne: { x: right, y: top },
    e: { x: right, y: center.y }, se: { x: right, y: bottom }, s: { x: center.x, y: bottom },
    sw: { x: left, y: bottom }, w: { x: left, y: center.y },
  }
  const transform = (point: DiagramPoint) => rotatePoint({
    x: rect.x + (flipX ? rect.width - (point.x - rect.x) : point.x - rect.x),
    y: rect.y + (flipY ? rect.height - (point.y - rect.y) : point.y - rect.y),
  }, center, rotation)
  return Object.fromEntries(Object.entries(local).map(([handle, point]) => [handle, transform(point)])) as Record<DiagramResizeHandle, DiagramPoint>
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
  return { id: geometry.id, kind: geometry.kind, rect: geometry.hitBounds, ...(geometry.corners ? { corners: geometry.corners } : {}) }
}

function inflate(rect: DiagramRect, amount: number): DiagramRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }
}
