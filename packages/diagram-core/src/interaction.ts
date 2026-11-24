import { createEntityGeometry, inflateRect, rectFromPoints as boundsFromPoints, resolveEndpoint } from "./geometry.js"
import { routeOrthogonalConnector } from "./geometry.js"
import { clampViewportToBounds } from "./viewport.js"
import type { DiagramEngine } from "./DiagramEngine.js"
import type { DiagramCommand, DiagramDynamicInputState, DiagramEdgeCreationPreview, DiagramEdgeEndpoint, DiagramId, DiagramGeometry, DiagramInteractionSnapOptions, DiagramInteractionSnapshot, DiagramInteractionTool, DiagramMarqueeMode, DiagramPointerEvent, DiagramPoint, DiagramRect, DiagramResizeEntry, DiagramResizeHandle, DiagramSnapCandidate, DiagramSnapGuide, DiagramSnapResult, DiagramViewportConstraints, DiagramOrthogonalRouteOptions, DiagramShape, DiagramTableResizeAxis, DiagramTableResizePreview } from "./types.js"

type ScheduleFrame = (callback: () => void) => void
const AXIS_LOCK_ACTIVATION_TOLERANCE_PX = 4
const EMPTY_SNAP_MARKERS: ReadonlyArray<DiagramSnapCandidate> = Object.freeze([])

export type DiagramInteractionOptions = Readonly<{
  scheduleFrame?: ScheduleFrame
  marqueeMode?: DiagramMarqueeMode
  snap?: DiagramInteractionSnapOptions
  viewportConstraints?: DiagramViewportConstraints
}>

export class DiagramInteractionController {
  private tool: DiagramInteractionTool = "select"
  private activePointer: DiagramPointerEvent | null = null
  private startPoint: DiagramPoint | null = null
  private latestPoint: DiagramPoint | null = null
  private latestShiftKey = false
  private shiftAxis: "x" | "y" | null = null
  private previewDelta: DiagramPoint | null = null
  private marquee: DiagramRect | null = null
  private resizeOwnerId: DiagramId | null = null
  private resizeSelectionIds: ReadonlyArray<DiagramId> = []
  private resizeHandle: DiagramResizeHandle | null = null
  private resizeStartBounds: DiagramRect | null = null
  private resizeStartRotation = 0
  private resizePreview: DiagramResizeEntry | null = null
  private resizePreviewEntries: ReadonlyArray<DiagramResizeEntry> = Object.freeze([])
  private tableResizePreview: DiagramTableResizePreview | null = null
  private tableResizeStart: Readonly<{ id: DiagramId; axis: DiagramTableResizeAxis; index: number; size: number; rotation: number }> | null = null
  private edgeEndpointId: DiagramId | null = null
  private edgeEndpointKind: "source" | "target" | null = null
  private edgeEndpointStart: DiagramPoint | null = null
  private edgeEndpointOppositeStart: DiagramPoint | null = null
  private edgeEndpointCardinalAngle: 0 | 90 | 180 | 270 | null = null
  private edgeEndpointPreview: DiagramPoint | null = null
  private edgeEndpointConnection: DiagramEdgeEndpoint | null = null
  private edgeWaypointPreview: ReadonlyArray<DiagramPoint> | null = null
  private dragSelectionIds: ReadonlyArray<DiagramId> = Object.freeze([])
  private snapGuides: ReadonlyArray<DiagramSnapGuide> = Object.freeze([])
  private snapResult: DiagramSnapResult | null = null
  private dynamicInput: DiagramDynamicInputState | null = null
  private previewDynamicInput: DiagramDynamicInputState | null = null
  private edgeCreationId: DiagramId | null = null
  private edgeCreationSource: DiagramEdgeEndpoint | null = null
  private edgeCreationPreview: DiagramEdgeCreationPreview | null = null
  private edgeRouteOptions: DiagramOrthogonalRouteOptions = {}
  private edgeClickPlacement = false
  private edgeCreationWaypoints: DiagramPoint[] = []
  private lineCreationId: DiagramId | null = null
  private lineCreationPreview: DiagramShape | null = null
  private pathCreationId: DiagramId | null = null
  private pathVertices: DiagramPoint[] = []
  private pathCurrentPoint: DiagramPoint | null = null
  private clickToPlaceLine = false
  private pathVertexPreview: Readonly<{ id: DiagramId; index: number; point: DiagramPoint }> | null = null
  private vertexDragKind: "path" | "edge" | null = null
  private vertexDragStart: DiagramPoint | null = null
  private framePending = false
  private pendingMoveCount = 0
  private commitCount = 0
  private gestureGeneration = 0
  private gestureHistoryId = 0
  private readonly scheduleFrame: ScheduleFrame
  private readonly marqueeMode: DiagramMarqueeMode
  private readonly snapOptions: DiagramInteractionSnapOptions
  private readonly viewportConstraints: DiagramViewportConstraints | undefined

  constructor(private readonly engine: DiagramEngine, options: DiagramInteractionOptions = {}) {
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame
    this.marqueeMode = options.marqueeMode ?? "contain"
    this.snapOptions = options.snap ?? {}
    this.viewportConstraints = options.viewportConstraints
  }

  setTool(tool: DiagramInteractionTool): void {
    this.cancel()
    this.tool = tool
  }

  pointerDown(event: DiagramPointerEvent): void {
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.activePointer = event
      this.latestPoint = event.point
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.activePointer = event
      this.latestPoint = event.point
      this.latestShiftKey = event.shiftKey === true
      return
    }
    this.gestureGeneration += 1
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.shiftAxis = null
    this.previewDelta = null
    this.marquee = null
    this.snapGuides = Object.freeze([])
    this.snapResult = null
    if (this.tool === "select") {
      const hit = this.engine.hitTest(event.point, { radius: 2 })
      if (hit) {
        let targetId = hit.id
        if (hit.kind === "port") {
          const port = this.engine.getScene().entities.portsById.get(hit.id)
          targetId = port?.nodeId ?? ""
          if (!targetId || !this.engine.canMove([targetId])) {
            this.tool = "select"
            return
          }
        }
        const ownerGroup = [...this.engine.getScene().entities.groupsById.values()].find((group) => group.childIds.includes(targetId))
        if (ownerGroup) targetId = ownerGroup.id
        const selection = this.engine.getScene().selection
        if (event.shiftKey) {
          this.engine.dispatch({ type: "setSelection", selection: { ids: [targetId], primaryId: targetId }, mode: "toggle" })
        } else if (!selection.ids.includes(targetId)) {
          this.engine.dispatch({ type: "setSelection", selection: { ids: [targetId], primaryId: targetId } })
        }
        const nextSelection = this.engine.getScene().selection
        this.dragSelectionIds = Object.freeze(nextSelection.ids.filter((id) => {
          const geometry = this.engine.getGeometrySnapshot(id)
          return geometry && geometry.kind !== "port" && this.engine.canMove([id])
        }))
        this.tool = this.dragSelectionIds.length && nextSelection.ids.includes(targetId) ? "drag-selection" : "select"
      } else {
        this.engine.dispatch({ type: "setSelection", selection: { ids: [], primaryId: null } })
        this.tool = "marquee"
      }
    }
  }

  beginResizeHandle(ownerId: DiagramId, handle: DiagramResizeHandle, event: DiagramPointerEvent): boolean {
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    if (!geometry || geometry.kind === "edge" || geometry.kind === "port" || !this.engine.canResize([ownerId])) {
      return false
    }
    this.cancel()
    this.tool = "resize-selection"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.shiftAxis = null
    this.resizeOwnerId = ownerId
    this.resizeHandle = handle
    this.resizeStartBounds = geometry.unrotatedBounds ?? geometry.bounds
    this.resizeStartRotation = geometry.rotation ?? 0
    return true
  }

  /** Starts a row or column boundary resize. The preview is transient until pointerUp. */
  beginTableResizeHandle(ownerId: DiagramId, axis: DiagramTableResizeAxis, index: number, event: DiagramPointerEvent): boolean {
    const table = this.engine.getScene().entities.tablesById.get(ownerId)
    if (!table || !this.engine.canResize([ownerId]) || !Number.isFinite(event.point.x) || !Number.isFinite(event.point.y)
      || !Number.isInteger(index) || index < 0 || index >= (axis === "row" ? table.rowCount - 1 : table.columnCount - 1)) return false
    this.cancel()
    this.tool = "resize-table-axis"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.tableResizeStart = {
      id: ownerId,
      axis,
      index,
      size: axis === "row" ? table.rowHeights![index]! : table.columnWidths![index]!,
      rotation: table.rotation ?? 0,
    }
    return true
  }

  beginEdgeEndpointHandle(ownerId: DiagramId, endpoint: "source" | "target", event: DiagramPointerEvent): boolean {
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    if (!geometry || geometry.kind !== "edge" || !geometry.path?.length) return false
    const point = endpoint === "source" ? geometry.path[0]! : geometry.path[geometry.path.length - 1]!
    const oppositePoint = endpoint === "source" ? geometry.path[geometry.path.length - 1]! : geometry.path[0]!
    this.cancel()
    this.tool = "drag-edge-endpoint"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.shiftAxis = null
    this.edgeEndpointId = ownerId
    this.edgeEndpointKind = endpoint
    this.edgeEndpointStart = point
    this.edgeEndpointOppositeStart = oppositePoint
    return true
  }

  beginPathVertexHandle(ownerId: DiagramId, index: number, event: DiagramPointerEvent): boolean {
    const shape = this.engine.getScene().entities.shapesById.get(ownerId)
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    const point = geometry?.path?.[index]
    if (!shape?.points || shape.shape !== "line" || !point || !Number.isInteger(index) || !this.engine.canMove([ownerId])) return false
    this.cancel()
    this.tool = "drag-path-vertex"
    this.activePointer = event; this.startPoint = event.point; this.latestPoint = event.point
    this.pathVertexPreview = { id: ownerId, index, point }
    this.vertexDragStart = point; this.vertexDragKind = "path"
    return true
  }

  beginEdgeWaypointHandle(ownerId: DiagramId, index: number, event: DiagramPointerEvent): boolean {
    const edge = this.engine.getScene().entities.edgesById.get(ownerId)
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    const point = edge?.points?.[index]
    if (!edge || !point || !geometry || !Number.isInteger(index) || !this.engine.canMove([ownerId])) return false
    this.cancel()
    this.tool = "drag-path-vertex"
    this.activePointer = event; this.startPoint = event.point; this.latestPoint = event.point
    this.vertexDragStart = point; this.vertexDragKind = "edge"
    this.edgeEndpointId = ownerId
    this.edgeWaypointPreview = [...(edge.points ?? [])]
    this.pathVertexPreview = { id: ownerId, index, point }
    return true
  }

  /** Starts a transient connector drawing gesture. The caller supplies the stable ID before committing. */
  beginEdgeCreation(id: DiagramId, event: DiagramPointerEvent, routeOptions: DiagramOrthogonalRouteOptions = {}): boolean {
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)
      || (routeOptions.terminalLead !== undefined && (!Number.isFinite(routeOptions.terminalLead) || routeOptions.terminalLead < 0))
      || (routeOptions.firstAxis !== undefined && routeOptions.firstAxis !== "horizontal" && routeOptions.firstAxis !== "vertical")) return false
    this.cancel()
    this.tool = "connect-edge"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.edgeCreationId = id
    this.edgeRouteOptions = routeOptions
    this.edgeCreationSource = this.snapEndpoint(event.point, event.point)
    this.updateEdgeCreationPreview()
    return true
  }

  /** Starts click-to-place connector routing; clicks add bends and `finishEdgePathCreation` commits once. */
  beginEdgePathCreation(id: DiagramId, event: DiagramPointerEvent, routeOptions: DiagramOrthogonalRouteOptions = {}): boolean {
    if (!this.beginEdgeCreation(id, event, routeOptions)) return false
    this.activePointer = null
    this.edgeClickPlacement = true
    this.edgeCreationWaypoints = []
    return true
  }

  finishEdgePathCreation(point?: DiagramPoint): boolean {
    if (!this.edgeClickPlacement || !this.edgeCreationId || !this.edgeCreationPreview) return false
    if (point) this.latestPoint = point
    this.updateEdgeCreationPreview()
    const preview = this.edgeCreationPreview!
    this.engine.dispatch({ type: "createEdge", edge: { id: preview.id, kind: "edge", source: preview.source, target: preview.target, points: preview.points }, historyKey: `connect:${preview.id}:${++this.gestureHistoryId}` })
    this.commitCount += 1
    this.cancel()
    return true
  }

  /** Starts a line-shape drawing gesture with the same transient snapping contract as connector creation. */
  beginLineCreation(id: DiagramId, event: DiagramPointerEvent): boolean {
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)) return false
    this.cancel()
    this.tool = "draw-line"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
    this.lineCreationId = id
    this.updateLineCreationPreview()
    return true
  }

  /** Starts a click-to-place free line (two clicks) or polyline (`finishPathCreation`). */
  beginPathCreation(id: DiagramId, event: DiagramPointerEvent, mode: "line" | "path" = "path"): boolean {
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)) return false
    this.cancel()
    this.tool = "draw-path"
    this.pathCreationId = id
    this.clickToPlaceLine = mode === "line"
    const start = this.snapEndpoint(event.point, event.point)
    const point = this.endpointPoint(start) ?? event.point
    this.pathVertices = [point]
    this.pathCurrentPoint = point
    this.startPoint = point
    this.latestPoint = point
    this.previewDynamicInput = dynamicInputFor(point, point)
    return true
  }

  /** Commits the pending click as a vertex; pointer motion alone never adds vertices. */
  addPathVertex(point?: DiagramPoint, finish = false): boolean {
    if (this.tool !== "draw-path" || !this.pathCreationId || !this.pathVertices.length) return false
    const candidate = point ?? this.latestPoint ?? this.pathCurrentPoint
    if (!candidate || ![candidate.x, candidate.y].every(Number.isFinite)) return false
    const snappedEndpoint = this.snapEndpoint(candidate, this.pathVertices[this.pathVertices.length - 1]!)
    const vertex = this.endpointPoint(snappedEndpoint) ?? candidate
    const last = this.pathVertices[this.pathVertices.length - 1]!
    if (last.x !== vertex.x || last.y !== vertex.y) this.pathVertices.push(vertex)
    this.pathCurrentPoint = vertex
    this.previewDynamicInput = dynamicInputFor(vertex, vertex)
    if (this.clickToPlaceLine || finish) return this.finishPathCreation()
    return true
  }

  finishPathCreation(): boolean {
    if (this.tool !== "draw-path" || !this.pathCreationId || this.pathVertices.length < 2) return false
    const path = this.pathVertices
    this.engine.dispatch({ type: "createPath", path: { id: this.pathCreationId, kind: "path", points: Object.freeze([...path]) }, historyKey: `draw-path:${this.pathCreationId}:${++this.gestureHistoryId}` })
    this.commitCount += 1
    this.cancel()
    return true
  }

  beginResizeSelectionHandle(handle: DiagramResizeHandle, event: DiagramPointerEvent): boolean {
    const ids = this.engine.getScene().selection.ids.filter((id) => {
      const geometry = this.engine.getGeometrySnapshot(id)
      return geometry && geometry.kind !== "edge" && geometry.kind !== "port" && this.engine.canResize([id])
    })
    if (ids.length < 2) {
      return false
    }
    const bounds = unionRects(ids.map((id) => this.engine.getGeometrySnapshot(id)?.unrotatedBounds ?? this.engine.getGeometrySnapshot(id)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect)))
    if (!bounds) {
      return false
    }
    this.cancel()
    this.tool = "resize-selection"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.shiftAxis = null
    this.resizeSelectionIds = ids
    this.resizeHandle = handle
    this.resizeStartBounds = bounds
    this.resizeStartRotation = 0
    return true
  }

  pointerMove(event: DiagramPointerEvent): void {
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.latestPoint = event.point
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.latestPoint = event.point
      this.scheduleCreationPreview()
      return
    }
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.scheduleCreationPreview()
      return
    }
    this.dynamicInput = null
    this.updateShiftAxis(event.shiftKey === true, event.point)
    this.pendingMoveCount += 1
    if (!this.framePending) {
      this.framePending = true
      const generation = this.gestureGeneration
      this.scheduleFrame(() => {
        if (generation !== this.gestureGeneration) return
        this.flushPointerMove()
      })
    }
  }

  /** Overrides the active gesture endpoint with finite world-space numeric input. */
  setDynamicInput(values: Partial<DiagramDynamicInputState>): boolean {
    const persistentDrawing = (this.tool === "draw-path" && this.pathCreationId) || (this.tool === "connect-edge" && this.edgeClickPlacement)
    if ((!this.activePointer && !persistentDrawing) || !this.startPoint || !this.latestPoint) return false
    const base = this.tool === "draw-path" ? this.pathVertices[this.pathVertices.length - 1] ?? this.startPoint : this.tool === "connect-edge" ? this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.startPoint : this.startPoint
    const current = this.dynamicInput ?? dynamicInputFor(base, this.latestPoint)
    const next = { ...current, ...values }
    if (!Object.values(next).every(Number.isFinite) || next.length < 0) return false
    let point = { x: next.x, y: next.y }
    if (values.dx !== undefined || values.dy !== undefined) point = { x: base.x + next.dx, y: base.y + next.dy }
    if (values.length !== undefined || values.angle !== undefined) {
      const radians = next.angle * Math.PI / 180
      point = { x: base.x + Math.cos(radians) * next.length, y: base.y + Math.sin(radians) * next.length }
    }
    if (![point.x, point.y].every(Number.isFinite)) return false
    this.latestPoint = point
    this.dynamicInput = dynamicInputFor(base, point)
    this.previewDynamicInput = this.dynamicInput
    this.flushPointerMove()
    return true
  }

  confirmDynamicInput(): boolean {
    if (this.tool === "draw-path" && this.pathCreationId && this.latestPoint) return this.addPathVertex(this.latestPoint, this.clickToPlaceLine)
    if (this.tool === "connect-edge" && this.edgeClickPlacement) return this.finishEdgePathCreation(this.latestPoint ?? undefined)
    if (!this.activePointer || !this.latestPoint) return false
    this.pointerUp({ ...this.activePointer, point: this.latestPoint, shiftKey: this.latestShiftKey })
    return true
  }

  cancelDynamicInput(): void {
    this.cancel()
  }

  pointerUp(event: DiagramPointerEvent): void {
    if (this.tool === "connect-edge" && this.edgeClickPlacement && this.activePointer?.id === event.id) {
      this.activePointer = null
      this.latestPoint = event.point
      const endpoint = this.snapEndpoint(event.point, this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.startPoint!)
      if (endpoint.kind === "port" || (event.clickCount ?? 0) >= 2) this.finishEdgePathCreation(event.point)
      else {
        const snapped = this.endpointPoint(endpoint) ?? event.point
        const previous = this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.endpointPoint(this.edgeCreationSource!)!
        if (previous.x !== snapped.x || previous.y !== snapped.y) this.edgeCreationWaypoints.push(snapped)
        this.previewDynamicInput = dynamicInputFor(snapped, snapped)
        this.updateEdgeCreationPreview()
      }
      return
    }
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.pathVertexPreview = { ...this.pathVertexPreview, point: this.resolveFreeSnap(event.point, this.vertexDragStart ?? event.point) }
      if (this.vertexDragKind === "edge" && this.edgeWaypointPreview) {
        const points = [...this.edgeWaypointPreview]; points[this.pathVertexPreview.index] = this.pathVertexPreview.point; this.edgeWaypointPreview = points
      }
      const preview = this.pathVertexPreview
      if (this.vertexDragKind === "edge") this.engine.dispatch({ type: "moveEdgeWaypoint", id: preview.id, index: preview.index, point: preview.point })
      else this.engine.dispatch({ type: "movePathVertex", id: preview.id, index: preview.index, point: preview.point })
      this.commitCount += 1
      this.clearGesture()
      this.tool = "select"
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.addPathVertex(event.point, (event.clickCount ?? 0) >= 2)
      this.activePointer = null
      return
    }
    this.updateShiftAxis(event.shiftKey === true, event.point)
    this.flushPointerMove()
    if (this.tool === "resize-table-axis" && this.tableResizePreview && this.tableResizePreview.size !== this.tableResizeStart?.size) {
      const preview = this.tableResizePreview
      const historyKey = `table-resize:${preview.id}:${preview.axis}:${preview.index}:${++this.gestureHistoryId}`
      this.engine.dispatch(preview.axis === "row"
        ? { type: "resizeTableRow", id: preview.id, index: preview.index, height: preview.size, historyKey }
        : { type: "resizeTableColumn", id: preview.id, index: preview.index, width: preview.size, historyKey })
      this.commitCount += 1
    }
    if (this.tool === "drag-selection" && this.previewDelta) {
      const selection = this.engine.getScene().selection
      this.engine.dispatch({ type: "moveEntities", ids: this.dragSelectionIds, delta: this.previewDelta, historyKey: `drag:${selection.primaryId ?? "selection"}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "pan" && this.previewDelta) {
      const viewport = this.engine.getScene().viewport
      const nextViewport = { ...viewport, x: viewport.x - this.previewDelta.x, y: viewport.y - this.previewDelta.y }
      const committedViewport = this.viewportConstraints ? clampViewportToBounds(nextViewport, this.viewportConstraints) : nextViewport
      this.engine.dispatch({ type: "setViewport", viewport: committedViewport, historyKey: `pan:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "resize-selection" && this.resizePreviewEntries.length) {
      this.engine.dispatch({ type: "resizeEntities", entries: this.resizePreviewEntries, historyKey: `resize:${this.resizePreview?.id ?? "selection"}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "drag-edge-endpoint" && this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
      && (this.edgeEndpointPreview.x !== this.edgeEndpointStart?.x || this.edgeEndpointPreview.y !== this.edgeEndpointStart?.y || this.edgeEndpointConnection !== null)) {
      const edge = this.engine.getScene().entities.edgesById.get(this.edgeEndpointId)
      const commands: DiagramCommand[] = [this.edgeEndpointConnection
        ? { type: "reconnectEdgeEndpoint", id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, connection: this.edgeEndpointConnection }
        : { type: "moveEdgeEndpoint", id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview }]
      if (edge && this.edgeWaypointPreview) {
        for (let index = 0; index < this.edgeWaypointPreview.length; index += 1) {
          const point = this.edgeWaypointPreview[index]!
          const previous = edge.points?.[index]
          if (!previous || previous.x !== point.x || previous.y !== point.y) {
            commands.push({ type: "moveEdgeWaypoint" as const, id: this.edgeEndpointId, index, point })
          }
        }
      }
      if (commands.length > 1) this.engine.dispatchBatch(commands)
      else this.engine.dispatch(commands[0]!)
      this.commitCount += 1
    }
    if (this.tool === "connect-edge" && this.edgeCreationPreview) {
      const preview = this.edgeCreationPreview
      this.engine.dispatch({ type: "createEdge", edge: { id: preview.id, kind: "edge", source: preview.source, target: preview.target, points: preview.points }, historyKey: `connect:${preview.id}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "draw-line" && this.lineCreationPreview) {
      this.engine.dispatch({ type: "createShape", shape: this.lineCreationPreview, historyKey: `draw-line:${this.lineCreationPreview.id}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "marquee" && this.marquee) {
      const ids = this.getMarqueeSelectionIds(this.marquee)
      this.engine.dispatch({ type: "setSelection", selection: { ids, primaryId: ids[0] ?? null }, mode: this.activePointer.shiftKey ? "add" : "replace" })
      this.commitCount += 1
    }
    this.clearGesture()
    if (this.tool === "drag-selection" || this.tool === "marquee" || this.tool === "resize-selection" || this.tool === "resize-table-axis" || this.tool === "drag-edge-endpoint" || this.tool === "connect-edge" || this.tool === "draw-line") {
      this.tool = "select"
    }
  }

  cancel(): void {
    this.clearGesture()
    this.tool = "select"
  }

  /** Returns renderer-ready geometry for active move and table resize previews. */
  getPreviewGeometry(id: DiagramId): DiagramGeometry | null {
    const geometry = this.engine.getGeometrySnapshot(id)
    if (geometry?.kind === "edge" && this.pathVertexPreview?.id === id && this.vertexDragKind === "edge") {
      const edge = this.engine.getScene().entities.edgesById.get(id)
      if (edge) {
        const path = [...(geometry.path ?? [])]
        if (path[this.pathVertexPreview.index + 1]) path[this.pathVertexPreview.index + 1] = this.pathVertexPreview.point
        const bounds = boundsFromPoints(path)
        return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
      }
    }
    if (geometry?.kind === "shape" && this.pathVertexPreview?.id === id && this.vertexDragKind === "path" && geometry.path) {
      const path = [...geometry.path]; path[this.pathVertexPreview.index] = this.pathVertexPreview.point
      const bounds = boundsFromPoints(path)
      return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
    }
    if (geometry?.kind === "table") {
      if (this.tableResizePreview?.id === id) {
        const scene = this.engine.getScene()
        const table = scene.entities.tablesById.get(id)
        if (table) return createEntityGeometry(id, { ...scene.entities, tablesById: new Map([[id, { ...table, width: this.tableResizePreview.width, height: this.tableResizePreview.height }]]) })
      }
      const directEntry = this.resizePreviewEntries.find((entry) => entry.id === id)
      if (directEntry) return resizePreviewGeometry(geometry, directEntry)
      if (this.tool === "resize-selection") {
        const scene = this.engine.getScene()
        const ownerGroup = [...scene.entities.groupsById.values()].find((group) => group.childIds.includes(id))
        const groupEntry = ownerGroup ? this.resizePreviewEntries.find((entry) => entry.id === ownerGroup.id) : undefined
        const groupGeometry = ownerGroup && groupEntry ? this.engine.getGeometrySnapshot(ownerGroup.id) : null
        if (ownerGroup && groupEntry && groupGeometry) {
          const from = groupGeometry.bounds
          const to = { x: groupEntry.x ?? from.x, y: groupEntry.y ?? from.y, width: groupEntry.width ?? from.width, height: groupEntry.height ?? from.height }
          const scaleX = from.width === 0 ? 1 : to.width / from.width
          const scaleY = from.height === 0 ? 1 : to.height / from.height
          const tableBounds = geometry.unrotatedBounds ?? geometry.bounds
          return resizePreviewGeometry(geometry, {
            id,
            x: to.x + (tableBounds.x - from.x) * scaleX,
            y: to.y + (tableBounds.y - from.y) * scaleY,
            width: tableBounds.width * scaleX,
            height: tableBounds.height * scaleY,
          })
        }
      }
    }
    if (geometry?.kind === "edge" && geometry.path?.length && this.edgeEndpointId === id && this.edgeEndpointKind && this.edgeEndpointPreview) {
      const path = [
        this.edgeEndpointKind === "source" ? this.edgeEndpointPreview : geometry.path[0]!,
        ...(this.edgeWaypointPreview ?? geometry.path.slice(1, -1)),
        this.edgeEndpointKind === "target" ? this.edgeEndpointPreview : geometry.path[geometry.path.length - 1]!,
      ]
      const bounds = boundsFromPoints(path)
      return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
    }
    if (this.tool === "resize-selection") {
      const directEntry = this.resizePreviewEntries.find((entry) => entry.id === id)
      if (directEntry && geometry && geometry.kind !== "edge" && geometry.kind !== "port") return resizePreviewGeometry(geometry, directEntry)
      if (geometry?.kind === "port") {
        const port = this.engine.getScene().entities.portsById.get(id)
        const node = port ? this.engine.getScene().entities.nodesById.get(port.nodeId) : undefined
        const nodeGeometry = node ? this.engine.getGeometrySnapshot(node.id) : null
        const nodeEntry = node && nodeGeometry ? this.resizeEntryForEntity(node.id, nodeGeometry) : null
        if (port && node && nodeEntry) {
          const width = nodeEntry.width ?? node.width
          const height = nodeEntry.height ?? node.height
          const portX = node.width === 0 ? port.x : port.x / node.width * width
          const portY = node.height === 0 ? port.y : port.y / node.height * height
          const local = {
            x: node.flipX ? width - portX : portX,
            y: node.flipY ? height - portY : portY,
          }
          const center = { x: (nodeEntry.x ?? node.x) + width / 2, y: (nodeEntry.y ?? node.y) + height / 2 }
          const point = rotatePoint({ x: (nodeEntry.x ?? node.x) + local.x, y: (nodeEntry.y ?? node.y) + local.y }, center, node.rotation ?? 0)
          const radius = port.radius ?? 4
          const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
          return Object.freeze({ ...geometry, point, bounds, hitBounds: inflateRect(bounds, 4) })
        }
      }
      const scene = this.engine.getScene()
      const group = [...scene.entities.groupsById.values()].find((candidate) => candidate.childIds.includes(id))
      const groupEntry = group ? this.resizePreviewEntries.find((entry) => entry.id === group.id) : undefined
      const groupGeometry = group ? this.engine.getGeometrySnapshot(group.id) : null
      if (group && groupEntry && groupGeometry && geometry) {
        const from = groupGeometry.bounds
        const to = { x: groupEntry.x ?? from.x, y: groupEntry.y ?? from.y, width: groupEntry.width ?? from.width, height: groupEntry.height ?? from.height }
        const scaleX = from.width === 0 ? 1 : to.width / from.width
        const scaleY = from.height === 0 ? 1 : to.height / from.height
        if (geometry.kind === "edge" && geometry.path) {
          const transform = (point: DiagramPoint) => ({ x: to.x + (point.x - from.x) * scaleX, y: to.y + (point.y - from.y) * scaleY })
          const path = geometry.path.map(transform)
          const bounds = boundsFromPoints(path)
          return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
        }
        if (geometry.kind !== "port" && geometry.kind !== "edge") {
          const bounds = geometry.unrotatedBounds ?? geometry.bounds
          return resizePreviewGeometry(geometry, {
            id,
            x: to.x + (bounds.x - from.x) * scaleX,
            y: to.y + (bounds.y - from.y) * scaleY,
            width: bounds.width * scaleX,
            height: bounds.height * scaleY,
          })
        }
      }
    }
    if (geometry?.kind === "port" && this.tool === "drag-selection" && this.previewDelta) {
      const port = this.engine.getScene().entities.portsById.get(id)
      if (port && this.isDraggedEntity(port.nodeId)) {
        const point = { x: geometry.point!.x + this.previewDelta.x, y: geometry.point!.y + this.previewDelta.y }
        const bounds = { x: point.x - (port.radius ?? 4), y: point.y - (port.radius ?? 4), width: (port.radius ?? 4) * 2, height: (port.radius ?? 4) * 2 }
        return Object.freeze({ ...geometry, point, bounds, hitBounds: inflateRect(bounds, 4) })
      }
    }
    if (!geometry || this.tool !== "drag-selection" || !this.previewDelta) return geometry
    const scene = this.engine.getScene()
    const edge = scene.entities.edgesById.get(id)
    if (geometry.kind === "edge" && edge) {
      const delta = this.previewDelta
      const moved = new Set(this.expandedDragSelectionIds())
      const endpointMoves = (endpoint: typeof edge.source): boolean => endpoint.kind === "point"
        ? moved.has(id)
        : endpoint.kind === "node"
          ? moved.has(endpoint.nodeId)
          : moved.has(scene.entities.portsById.get(endpoint.portId)?.nodeId ?? "")
      const path = geometry.path?.map((point, index) => {
        const isSource = index === 0
        const isTarget = index === (geometry.path?.length ?? 0) - 1
        const move = isSource ? endpointMoves(edge.source) : isTarget ? endpointMoves(edge.target) : moved.has(id)
        return move ? { x: point.x + delta.x, y: point.y + delta.y } : point
      })
      if (path?.length) {
        const changed = path.some((point, index) => point !== geometry.path?.[index])
        if (!changed) return geometry
        const bounds = boundsFromPoints(path)
        return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
      }
    }
    if (!this.isDraggedEntity(id)) return geometry
    const move = (point: DiagramPoint): DiagramPoint => ({ x: point.x + this.previewDelta!.x, y: point.y + this.previewDelta!.y })
    return Object.freeze({
      ...geometry,
      bounds: { ...geometry.bounds, x: geometry.bounds.x + this.previewDelta.x, y: geometry.bounds.y + this.previewDelta.y },
      hitBounds: { ...geometry.hitBounds, x: geometry.hitBounds.x + this.previewDelta.x, y: geometry.hitBounds.y + this.previewDelta.y },
      unrotatedBounds: geometry.unrotatedBounds ? { ...geometry.unrotatedBounds, x: geometry.unrotatedBounds.x + this.previewDelta.x, y: geometry.unrotatedBounds.y + this.previewDelta.y } : undefined,
      corners: geometry.corners?.map(move),
      path: geometry.path?.map(move),
      point: geometry.point ? move(geometry.point) : undefined,
    })
  }

  getSnapshot(): DiagramInteractionSnapshot {
    const hasPreview = this.previewDelta !== null || this.resizePreviewEntries.length > 0 || this.edgeEndpointPreview !== null || this.edgeCreationPreview !== null || this.lineCreationPreview !== null || this.pathCreationId !== null || this.pathVertexPreview !== null
    const endpointOrigin = this.edgeEndpointOppositeStart ?? (this.tool === "connect-edge" || this.tool === "draw-line" ? this.startPoint : null)
    const endpointAngle = (this.tool === "drag-edge-endpoint" || this.tool === "connect-edge" || this.tool === "draw-line") && endpointOrigin && this.latestPoint
      ? (this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.configuredAngle(this.latestPoint, endpointOrigin))
      : null
    const movementAngle = this.tool === "drag-selection" && this.startPoint && this.latestPoint && !this.latestShiftKey
      ? this.configuredAngle(this.latestPoint, this.startPoint)
      : null
    const constraint = !hasPreview ? null : endpointAngle !== null
      ? { kind: "angle" as const, angle: endpointAngle }
      : this.tool === "drag-selection" && this.latestShiftKey && this.shiftAxis
        ? { kind: "axis" as const, axis: this.shiftAxis }
        : movementAngle !== null ? { kind: this.snapOptions.ortho ? "ortho" as const : "angle" as const, angle: movementAngle }
          : null
    return {
      tool: this.tool,
      active: this.activePointer !== null || this.pathCreationId !== null || this.edgeClickPlacement,
      previewDelta: this.previewDelta,
      resizePreview: this.resizePreview,
      resizePreviewEntries: this.resizePreviewEntries,
      tableResizePreview: this.tableResizePreview,
      edgeEndpointPreview: this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
        ? { id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview, ...(this.edgeEndpointConnection ? { connection: this.edgeEndpointConnection } : {}) }
        : null,
      snapGuides: this.snapGuides,
      snapResult: this.snapResult,
      snapMarkers: this.snapResult?.candidate ? Object.freeze([this.snapResult.candidate]) : EMPTY_SNAP_MARKERS,
      constraint,
      dynamicInput: this.dynamicInput ?? this.previewDynamicInput,
      edgeCreationPreview: this.edgeCreationPreview,
      shapeCreationPreview: this.lineCreationPreview,
      pathCreationPreview: this.pathCreationId && this.pathVertices.length && this.pathCurrentPoint
        ? { id: this.pathCreationId, vertices: Object.freeze([...this.pathVertices]), current: this.pathCurrentPoint }
        : null,
      edgeWaypointPreview: this.edgeEndpointId && this.edgeWaypointPreview ? { id: this.edgeEndpointId, points: this.edgeWaypointPreview } : null,
      pathVertexPreview: this.pathVertexPreview,
      marquee: this.marquee,
    }
  }

  getPendingMoveCount(): number {
    return this.pendingMoveCount
  }

  getCommitCount(): number {
    return this.commitCount
  }

  private flushPointerMove(): void {
    this.framePending = false
    if (!this.startPoint || !this.latestPoint) {
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.pathCurrentPoint = this.resolveFreeSnap(this.latestPoint, this.pathVertices[this.pathVertices.length - 1]!)
      this.previewDynamicInput = dynamicInputFor(this.pathVertices[this.pathVertices.length - 1]!, this.pathCurrentPoint)
      return
    }
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.updateEdgeCreationPreview()
      return
    }
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.pathVertexPreview = { ...this.pathVertexPreview, point: this.resolveFreeSnap(this.latestPoint, this.vertexDragStart ?? this.latestPoint) }
      if (this.vertexDragKind === "edge" && this.edgeWaypointPreview) {
        const points = [...this.edgeWaypointPreview]; points[this.pathVertexPreview.index] = this.pathVertexPreview.point; this.edgeWaypointPreview = points
      }
      return
    }
    this.previewDynamicInput = dynamicInputFor(this.startPoint, this.latestPoint)
    const delta = { x: this.latestPoint.x - this.startPoint.x, y: this.latestPoint.y - this.startPoint.y }
    if (this.tool === "drag-selection" || this.tool === "pan") {
      if (this.tool === "pan" && this.viewportConstraints) {
        const viewport = this.engine.getScene().viewport
        const constrainedViewport = clampViewportToBounds({ ...viewport, x: viewport.x - delta.x, y: viewport.y - delta.y }, this.viewportConstraints)
        this.previewDelta = { x: viewport.x - constrainedViewport.x, y: viewport.y - constrainedViewport.y }
        return
      }
      const axisConstraint = this.tool === "drag-selection" && this.latestShiftKey ? this.shiftAxis ?? undefined : undefined
      let constrainedDelta = axisConstraint === "x"
        ? { x: delta.x, y: 0 }
        : axisConstraint === "y"
          ? { x: 0, y: delta.y }
          : delta
      const configuredAngle = axisConstraint ? null : this.configuredAngle(this.latestPoint, this.startPoint)
      if (configuredAngle !== null) {
        const constrainedPoint = projectToAngle(this.startPoint, this.latestPoint, configuredAngle)
        constrainedDelta = { x: constrainedPoint.x - this.startPoint.x, y: constrainedPoint.y - this.startPoint.y }
      }
      if (this.tool === "drag-selection" && this.snapOptions.enabled !== false) {
        const viewport = this.engine.getScene().viewport
        const zoom = viewport.zoom > 0 ? viewport.zoom : 1
        const selection = this.engine.getScene().selection
        const snapIds = [...new Set([...this.dragSelectionIds, ...this.expandedDragSelectionIds()])]
        const snapped = this.engine.snapTranslation({ ...selection, ids: snapIds, primaryId: this.dragSelectionIds.includes(selection.primaryId ?? "") ? selection.primaryId : this.dragSelectionIds[0] ?? null }, constrainedDelta, {
          radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
          gridSize: this.snapOptions.gridSize,
          axisConstraint,
          snapToPorts: this.snapOptions.snapToPorts,
          snapToAlignment: this.snapOptions.snapToAlignment,
          snapToEqualSpacing: this.snapOptions.snapToEqualSpacing ?? true,
          kinds: this.snapOptions.kinds,
          origin: this.startPoint,
          includeCandidates: true,
        })
        this.previewDelta = snapped.point
        this.snapGuides = snapped.guides
        if (configuredAngle !== null) {
          const constrainedPoint = projectToAngle(this.startPoint, { x: this.startPoint.x + snapped.point.x, y: this.startPoint.y + snapped.point.y }, configuredAngle)
          const constrainedSnap = { x: constrainedPoint.x - this.startPoint.x, y: constrainedPoint.y - this.startPoint.y }
          if (constrainedSnap.x !== snapped.point.x || constrainedSnap.y !== snapped.point.y) this.snapGuides = Object.freeze([])
          this.previewDelta = constrainedSnap
        }
        const preservesCandidate = configuredAngle === null || (this.previewDelta.x === snapped.point.x && this.previewDelta.y === snapped.point.y)
        this.snapResult = { point: this.previewDelta, snapped: snapped.snapped, source: snapped.source, ...(preservesCandidate && snapped.candidate ? { candidate: snapped.candidate, targetId: snapped.targetId } : {}) }
      } else {
        this.previewDelta = constrainedDelta
        this.snapGuides = Object.freeze([])
        this.snapResult = null
      }
      return
    }
    if (this.tool === "resize-selection") {
      this.resizePreviewEntries = this.createResizePreviewEntries(delta)
      this.resizePreview = this.resizePreviewEntries[0] ?? null
      return
    }
    if (this.tool === "resize-table-axis") {
      this.updateTableResizePreview()
      return
    }
    if (this.tool === "drag-edge-endpoint") {
      if (!this.edgeEndpointStart) return
      const origin = this.edgeEndpointStart
      const angle = this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.edgeEndpointOppositeStart ? this.configuredAngle(this.latestPoint, this.edgeEndpointOppositeStart) : null
      const axisConstraint = angle === null ? undefined : angle === 0 || angle === 180 ? "x" : "y"
      let desiredPoint = angle === null
        ? this.latestPoint
        : projectToAngle(this.edgeEndpointOppositeStart ?? origin, this.latestPoint, angle)
      if (this.snapOptions.enabled === false) {
        this.edgeEndpointPreview = desiredPoint
        this.snapResult = null
        this.edgeEndpointConnection = null
      } else {
        const viewport = this.engine.getScene().viewport
        const zoom = viewport.zoom > 0 ? viewport.zoom : 1
        const snap = this.engine.snapPoint(desiredPoint, {
          radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
          gridSize: this.snapOptions.gridSize,
          axisConstraint,
          snapToPorts: this.snapOptions.snapToPorts,
          snapToAlignment: this.snapOptions.snapToAlignment,
          excludeIds: new Set(this.edgeEndpointId ? [this.edgeEndpointId] : []),
          kinds: this.snapOptions.kinds,
          tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
          origin: this.edgeEndpointOppositeStart ?? undefined,
          angleIncrement: this.snapOptions.angleIncrement,
          additionalAngles: this.snapOptions.additionalAngles,
          ortho: this.snapOptions.ortho,
        })
        this.edgeEndpointPreview = angle === null || !this.edgeEndpointOppositeStart
          ? snap.point
          : projectToAngle(this.edgeEndpointOppositeStart, snap.point, angle)
        this.edgeEndpointConnection = null
        if (this.snapOptions.endpointMode === "reattach" && snap.source === "port" && snap.targetId) {
          const portPoint = this.engine.getGeometrySnapshot(snap.targetId)?.point
          if (portPoint && portPoint.x === this.edgeEndpointPreview.x && portPoint.y === this.edgeEndpointPreview.y) {
            this.edgeEndpointConnection = { kind: "port", portId: snap.targetId }
          }
        }
        this.snapResult = this.edgeEndpointPreview.x === snap.point.x && this.edgeEndpointPreview.y === snap.point.y
          ? snap
          : { point: this.edgeEndpointPreview, snapped: snap.snapped, source: snap.source, candidates: snap.candidates }
      }
      this.edgeWaypointPreview = this.createOrthogonalWaypointPreview(this.edgeEndpointPreview)
      return
    }
    if (this.tool === "connect-edge") {
      this.updateEdgeCreationPreview()
      return
    }
    if (this.tool === "draw-line") {
      this.updateLineCreationPreview()
      return
    }
    if (this.tool === "marquee") {
      this.marquee = rectFromPoints(this.startPoint, this.latestPoint)
    }
  }

  private scheduleCreationPreview(): void {
    this.pendingMoveCount += 1
    if (this.framePending) return
    this.framePending = true
    const generation = this.gestureGeneration
    this.scheduleFrame(() => {
      if (generation !== this.gestureGeneration) return
      this.flushPointerMove()
    })
  }

  private resolveFreeSnap(point: DiagramPoint, origin: DiagramPoint): DiagramPoint {
    const zoom = this.engine.getScene().viewport.zoom || 1
    const snap = this.engine.snapPoint(point, {
      radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
      gridSize: this.snapOptions.gridSize,
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      kinds: this.snapOptions.kinds,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
      origin,
      angleIncrement: this.snapOptions.angleIncrement,
      additionalAngles: this.snapOptions.additionalAngles,
      ortho: this.snapOptions.ortho,
    })
    this.snapResult = snap
    return snap.point
  }

  private endpointPoint(endpoint: DiagramEdgeEndpoint): DiagramPoint | null {
    if (endpoint.kind === "point") return endpoint.point
    if (endpoint.kind === "port") return this.engine.getGeometrySnapshot(endpoint.portId)?.point ?? null
    const bounds = this.engine.getGeometrySnapshot(endpoint.nodeId)?.bounds
    return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null
  }

  private createResizePreviewEntries(delta: DiagramPoint): ReadonlyArray<DiagramResizeEntry> {
    if (this.resizeSelectionIds.length) {
      return this.createSelectionResizePreviewEntries(delta)
    }
    const entry = this.createResizePreview(delta)
    return entry ? Object.freeze([entry]) : Object.freeze([])
  }

  private updateTableResizePreview(): void {
    const start = this.tableResizeStart
    const point = this.latestPoint
    const table = start ? this.engine.getScene().entities.tablesById.get(start.id) : null
    if (!start || !point || !this.startPoint || !table) return
    const dx = point.x - this.startPoint.x
    const dy = point.y - this.startPoint.y
    const radians = start.rotation * Math.PI / 180
    const localX = dx * Math.cos(radians) + dy * Math.sin(radians)
    const localY = -dx * Math.sin(radians) + dy * Math.cos(radians)
    const size = Math.max(1, start.size + (start.axis === "row" ? localY : localX))
    const rowHeights = [...table.rowHeights!]
    const columnWidths = [...table.columnWidths!]
    if (start.axis === "row") rowHeights[start.index] = size
    else columnWidths[start.index] = size
    this.tableResizePreview = Object.freeze({
      id: start.id, axis: start.axis, index: start.index, size,
      width: columnWidths.reduce((sum, value) => sum + value, 0),
      height: rowHeights.reduce((sum, value) => sum + value, 0),
      rowHeights: Object.freeze(rowHeights), columnWidths: Object.freeze(columnWidths),
    })
  }

  private snapEndpoint(point: DiagramPoint, origin: DiagramPoint): DiagramEdgeEndpoint {
    const angle = this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.configuredAngle(point, origin)
    const desiredPoint = angle === null ? point : projectToAngle(origin, point, angle)
    if (this.snapOptions.enabled === false) {
      this.snapResult = null
      return { kind: "point", point: desiredPoint }
    }
    const zoom = this.engine.getScene().viewport.zoom || 1
    const snap = this.engine.snapPoint(desiredPoint, {
      radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
      gridSize: this.snapOptions.gridSize,
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      kinds: this.snapOptions.kinds,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
      origin: angle === null ? origin : undefined,
      angleIncrement: angle === null ? this.snapOptions.angleIncrement : undefined,
      additionalAngles: this.snapOptions.additionalAngles,
      ortho: angle === null ? this.snapOptions.ortho : undefined,
    })
    const resolvedPoint = angle === null ? snap.point : projectToAngle(origin, snap.point, angle)
    const compatibleSnap = resolvedPoint.x === snap.point.x && resolvedPoint.y === snap.point.y
    this.snapResult = compatibleSnap
      ? snap
      : { point: resolvedPoint, snapped: true, source: "angle", candidates: snap.candidates }
    return compatibleSnap && snap.source === "port" && snap.targetId
      ? { kind: "port", portId: snap.targetId }
      : { kind: "point", point: resolvedPoint }
  }

  private updateEdgeCreationPreview(): void {
    if (!this.edgeCreationId || !this.edgeCreationSource || !this.startPoint || !this.latestPoint) return
    const target = this.snapEndpoint(this.latestPoint, this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.startPoint)
    const entities = this.engine.getScene().entities
    const sourcePoint = resolveEndpoint(this.edgeCreationSource, entities)
    const targetPoint = resolveEndpoint(target, entities)
    const stops = [sourcePoint, ...this.edgeCreationWaypoints, targetPoint]
    const routes = stops.slice(1).map((next, index) => routeOrthogonalConnector(stops[index]!, next, this.edgeRouteOptions))
    const routePath = routes.flatMap((route, index) => index ? route.path.slice(1) : route.path)
    const routePoints = [...this.edgeCreationWaypoints, ...routes.flatMap((route) => route.points)]
    this.edgeCreationPreview = Object.freeze({
      id: this.edgeCreationId,
      source: this.edgeCreationSource,
      target,
      points: Object.freeze(routePoints.map((point) => Object.freeze(point))),
      path: Object.freeze(routePath.map((point) => Object.freeze(point))),
    })
  }

  private updateLineCreationPreview(): void {
    if (!this.lineCreationId || !this.startPoint || !this.latestPoint) return
    const endpoint = this.snapEndpoint(this.latestPoint, this.startPoint)
    const entities = this.engine.getScene().entities
    const target = resolveEndpoint(endpoint, entities)
    const source = this.startPoint
    const x = Math.min(source.x, target.x)
    const y = Math.min(source.y, target.y)
    this.lineCreationPreview = Object.freeze({
      id: this.lineCreationId, kind: "shape", shape: "line", x, y,
      width: Math.abs(target.x - source.x), height: Math.abs(target.y - source.y),
      flipX: target.x < source.x, flipY: target.y < source.y,
    })
  }

  private createSelectionResizePreviewEntries(delta: DiagramPoint): ReadonlyArray<DiagramResizeEntry> {
    if (!this.resizeHandle || !this.resizeStartBounds) return Object.freeze([])
    const nextBounds = resizeBoundsByHandle(this.resizeStartBounds, this.resizeHandle, delta, this.minimumResizeSize(this.resizeSelectionIds, this.resizeStartBounds), this.latestShiftKey, this.resizeGridSize())
    const scaleX = this.resizeStartBounds.width ? nextBounds.width / this.resizeStartBounds.width : 1
    const scaleY = this.resizeStartBounds.height ? nextBounds.height / this.resizeStartBounds.height : 1
    const entries: DiagramResizeEntry[] = []
    for (const id of this.resizeSelectionIds) {
      const geometry = this.engine.getGeometrySnapshot(id)
      const bounds = geometry?.unrotatedBounds ?? geometry?.bounds
      if (!bounds) continue
      entries.push({
        id,
        x: nextBounds.x + (bounds.x - this.resizeStartBounds.x) * scaleX,
        y: nextBounds.y + (bounds.y - this.resizeStartBounds.y) * scaleY,
        width: Math.max(8, bounds.width * scaleX),
        height: Math.max(8, bounds.height * scaleY),
      })
    }
    return Object.freeze(entries)
  }

  private createResizePreview(delta: DiagramPoint): DiagramResizeEntry | null {
    if (!this.resizeOwnerId || !this.resizeHandle || !this.resizeStartBounds) return null
    const bounds = this.resizeStartBounds
    const localDelta = rotateDelta(delta, -this.resizeStartRotation)
    const minSize = this.minimumResizeSize([this.resizeOwnerId], bounds)
    const nextBounds = resizeBoundsByHandle(bounds, this.resizeHandle, localDelta, minSize, this.latestShiftKey, this.resizeGridSize())
    const { x, y, width, height } = nextBounds

    const entry: { id: DiagramId; x?: number; y?: number; width?: number; height?: number } = { id: this.resizeOwnerId, width, height }
    if (this.resizeStartRotation) {
      const anchored = anchorRotatedResize(bounds, this.resizeHandle, width, height, this.resizeStartRotation)
      entry.x = anchored.x
      entry.y = anchored.y
    } else {
      if (x !== bounds.x) entry.x = x
      if (y !== bounds.y) entry.y = y
    }
    return entry
  }

  private resizeGridSize(): number | undefined {
    return this.snapOptions.enabled === false ? undefined : this.snapOptions.gridSize
  }

  private minimumResizeSize(ids: ReadonlyArray<DiagramId>, overallBounds: DiagramRect): number {
    const entities = this.engine.getScene().entities
    let minimum = 8
    for (const id of ids) {
      const childIds = entities.groupsById.get(id)?.childIds ?? [id]
      for (const childId of childIds) {
        const shape = entities.shapesById.get(childId)
        if (shape?.shape === "rect" && shape.cornerRadius) {
          const geometry = this.engine.getGeometrySnapshot(childId)
          const bounds = geometry?.unrotatedBounds ?? geometry?.bounds
          const scaleX = bounds?.width ? overallBounds.width / bounds.width : 1
          const scaleY = bounds?.height ? overallBounds.height / bounds.height : 1
          minimum = Math.max(minimum, shape.cornerRadius * 2 * scaleX, shape.cornerRadius * 2 * scaleY)
        }
      }
    }
    return minimum
  }

  private expandedDragSelectionIds(): DiagramId[] {
    const groups = this.engine.getScene().entities.groupsById
    const ids = new Set(this.dragSelectionIds)
    for (const id of this.dragSelectionIds) {
      for (const childId of groups.get(id)?.childIds ?? []) ids.add(childId)
    }
    return [...ids]
  }

  private resizeEntryForEntity(id: DiagramId, geometry: DiagramGeometry): DiagramResizeEntry | null {
    const direct = this.resizePreviewEntries.find((entry) => entry.id === id)
    if (direct) return direct
    const group = [...this.engine.getScene().entities.groupsById.values()].find((candidate) => candidate.childIds.includes(id))
    const groupEntry = group ? this.resizePreviewEntries.find((entry) => entry.id === group.id) : undefined
    const groupGeometry = group ? this.engine.getGeometrySnapshot(group.id) : null
    if (!group || !groupEntry || !groupGeometry) return null
    const from = groupGeometry.bounds
    const to = { x: groupEntry.x ?? from.x, y: groupEntry.y ?? from.y, width: groupEntry.width ?? from.width, height: groupEntry.height ?? from.height }
    const bounds = geometry.unrotatedBounds ?? geometry.bounds
    const scaleX = from.width === 0 ? 1 : to.width / from.width
    const scaleY = from.height === 0 ? 1 : to.height / from.height
    return { id, x: to.x + (bounds.x - from.x) * scaleX, y: to.y + (bounds.y - from.y) * scaleY, width: bounds.width * scaleX, height: bounds.height * scaleY }
  }

  private isDraggedEntity(id: DiagramId): boolean {
    if (this.dragSelectionIds.includes(id)) return true
    const groups = this.engine.getScene().entities.groupsById
    return this.dragSelectionIds.some((groupId) => groups.get(groupId)?.childIds.includes(id) === true)
  }

  private updateShiftAxis(shiftKey: boolean, point: DiagramPoint): void {
    const wasShifted = this.latestShiftKey
    this.latestShiftKey = shiftKey
    if (!shiftKey) {
      this.shiftAxis = null
      this.edgeEndpointCardinalAngle = null
      return
    }
    if (!wasShifted) {
      this.shiftAxis = null
      this.edgeEndpointCardinalAngle = null
    }
    if (this.tool === "drag-edge-endpoint" || this.tool === "connect-edge" || this.tool === "draw-line") {
      const angleOrigin = this.edgeEndpointOppositeStart ?? (this.tool === "connect-edge" || this.tool === "draw-line" ? this.startPoint : null)
      if (this.edgeEndpointCardinalAngle === null && angleOrigin && this.startPoint && this.isPastAxisActivation(point, this.startPoint)) {
        this.edgeEndpointCardinalAngle = nearestCardinalAngle(point, angleOrigin)
      }
      return
    }
    if (this.shiftAxis || !this.startPoint || this.tool !== "drag-selection") return

    const delta = { x: point.x - this.startPoint.x, y: point.y - this.startPoint.y }
    if (!this.isPastAxisActivation(point, this.startPoint)) return
    this.shiftAxis = Math.abs(delta.x) >= Math.abs(delta.y) ? "x" : "y"
  }

  private isPastAxisActivation(point: DiagramPoint, origin: DiagramPoint): boolean {
    const viewport = this.engine.getScene().viewport
    const zoom = viewport.zoom > 0 ? viewport.zoom : 1
    return Math.hypot(point.x - origin.x, point.y - origin.y) * zoom >= AXIS_LOCK_ACTIVATION_TOLERANCE_PX
  }

  private configuredAngle(point: DiagramPoint, origin: DiagramPoint): number | null {
    const increment = this.snapOptions.ortho ? 90 : this.snapOptions.angleIncrement
    const additional = this.snapOptions.additionalAngles ?? []
    if ((!increment || !Number.isFinite(increment) || increment <= 0) && !additional.length) return null
    const raw = Math.atan2(point.y - origin.y, point.x - origin.x) * 180 / Math.PI
    const candidates = [...(increment && Number.isFinite(increment) && increment > 0 ? [Math.round(raw / increment) * increment] : []), ...additional.filter(Number.isFinite)]
    if (!candidates.length) return null
    const angularDistance = (angle: number) => Math.abs(((angle - raw + 540) % 360) - 180)
    return candidates.reduce((best, candidate) => angularDistance(candidate) < angularDistance(best) ? candidate : best)
  }

  private createOrthogonalWaypointPreview(endpoint: DiagramPoint | null): ReadonlyArray<DiagramPoint> | null {
    if (!endpoint || !this.edgeEndpointId || !this.edgeEndpointKind) return null
    const edge = this.engine.getScene().entities.edgesById.get(this.edgeEndpointId)
    const points = edge?.points
    if (!edge || !points?.length) return points ?? null
    const geometry = this.engine.getGeometrySnapshot(this.edgeEndpointId)
    const path = geometry?.path
    if (!path?.length || !isOrthogonalPath(path)) return points

    const nextPoints = points.map((point) => ({ x: point.x, y: point.y }))
    if (this.edgeEndpointKind === "source") {
      const waypointIndex = 0
      const routeIndex = 1
      const inward = findDistinctPoint(path, routeIndex, 1)
      if (!inward) return nextPoints
      const segment = segmentAxis(path[routeIndex]!, inward)
      if (segment === "horizontal") nextPoints[waypointIndex] = { x: endpoint.x, y: inward.y }
      else if (segment === "vertical") nextPoints[waypointIndex] = { x: inward.x, y: endpoint.y }
    } else {
      const waypointIndex = points.length - 1
      const routeIndex = path.length - 2
      const inward = findDistinctPoint(path, routeIndex, -1)
      if (!inward) return nextPoints
      const segment = segmentAxis(inward, path[routeIndex]!)
      if (segment === "horizontal") nextPoints[waypointIndex] = { x: endpoint.x, y: inward.y }
      else if (segment === "vertical") nextPoints[waypointIndex] = { x: inward.x, y: endpoint.y }
    }
    return nextPoints
  }

  private getMarqueeSelectionIds(rect: DiagramRect): DiagramId[] {
    const visible = new Set(this.engine.queryVisible(rect))
    const scene = this.engine.getScene()
    const groupedChildren = new Set([...scene.entities.groupsById.values()].flatMap((group) => group.childIds))
    return [
      ...scene.order.groupIds,
      ...scene.order.nodeIds,
      ...scene.order.shapeIds,
      ...scene.order.tableIds,
      ...scene.order.textIds,
      ...scene.order.edgeIds,
    ].filter((id) => {
      if (groupedChildren.has(id)) return false
      if (!visible.has(id)) return false
      if (this.marqueeMode === "intersect") return true
      const geometry = createEntityGeometry(id, scene.entities)
      return geometry ? rectContainsRect(rect, geometry.bounds) : false
    })
  }

  private clearGesture(): void {
    this.gestureGeneration += 1
    this.activePointer = null
    this.startPoint = null
    this.latestPoint = null
    this.latestShiftKey = false
    this.shiftAxis = null
    this.previewDelta = null
    this.marquee = null
    this.resizeOwnerId = null
    this.resizeSelectionIds = []
    this.resizeHandle = null
    this.resizeStartBounds = null
    this.resizeStartRotation = 0
    this.resizePreview = null
    this.resizePreviewEntries = Object.freeze([])
    this.tableResizePreview = null
    this.tableResizeStart = null
    this.dragSelectionIds = Object.freeze([])
    this.snapGuides = Object.freeze([])
    this.snapResult = null
    this.dynamicInput = null
    this.previewDynamicInput = null
    this.edgeCreationId = null
    this.edgeCreationSource = null
    this.edgeCreationPreview = null
    this.lineCreationId = null
    this.lineCreationPreview = null
    this.pathCreationId = null
    this.pathVertices = []
    this.pathCurrentPoint = null
    this.clickToPlaceLine = false
    this.pathVertexPreview = null
    this.vertexDragKind = null
    this.vertexDragStart = null
    this.edgeRouteOptions = {}
    this.edgeClickPlacement = false
    this.edgeCreationWaypoints = []
    this.edgeEndpointId = null
    this.edgeEndpointKind = null
    this.edgeEndpointStart = null
    this.edgeEndpointOppositeStart = null
    this.edgeEndpointCardinalAngle = null
    this.edgeEndpointPreview = null
    this.edgeEndpointConnection = null
    this.edgeWaypointPreview = null
    this.framePending = false
    this.pendingMoveCount = 0
  }
}

function resizePreviewGeometry(geometry: DiagramGeometry, entry: DiagramResizeEntry): DiagramGeometry {
  const previous = geometry.unrotatedBounds ?? geometry.bounds
  const unrotatedBounds = {
    x: entry.x ?? previous.x,
    y: entry.y ?? previous.y,
    width: entry.width ?? previous.width,
    height: entry.height ?? previous.height,
  }
  const corners = geometry.rotation ? [
    { x: unrotatedBounds.x, y: unrotatedBounds.y },
    { x: unrotatedBounds.x + unrotatedBounds.width, y: unrotatedBounds.y },
    { x: unrotatedBounds.x + unrotatedBounds.width, y: unrotatedBounds.y + unrotatedBounds.height },
    { x: unrotatedBounds.x, y: unrotatedBounds.y + unrotatedBounds.height },
  ].map((point) => rotatePoint(point, rectCenter(unrotatedBounds), geometry.rotation!)) : undefined
  const bounds = corners ? boundsFromPoints(corners) : unrotatedBounds
  return Object.freeze({ ...geometry, bounds, unrotatedBounds, corners, hitBounds: inflateRect(bounds, geometry.kind === "node" ? 4 : 3) })
}

export function createDiagramInteractionController(engine: DiagramEngine, options: DiagramInteractionOptions = {}): DiagramInteractionController {
  return new DiagramInteractionController(engine, options)
}

function defaultScheduleFrame(callback: () => void): void {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback())
    return
  }
  callback()
}

function rotateDelta(delta: DiagramPoint, rotation: number): DiagramPoint {
  const angle = rotation * (Math.PI / 180)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: delta.x * cos - delta.y * sin, y: delta.x * sin + delta.y * cos }
}

function nearestCardinalAngle(point: DiagramPoint, origin: DiagramPoint): 0 | 90 | 180 | 270 {
  const degrees = (Math.atan2(point.y - origin.y, point.x - origin.x) * 180 / Math.PI + 360) % 360
  const candidates = [0, 180, 90, 270] as const
  let nearest: 0 | 90 | 180 | 270 = candidates[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const difference = Math.abs(degrees - candidate)
    const distance = Math.min(difference, 360 - difference)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}

function projectToAngle(origin: DiagramPoint, point: DiagramPoint, angle: number): DiagramPoint {
  const distance = Math.hypot(point.x - origin.x, point.y - origin.y)
  const normalized = (angle % 360 + 360) % 360
  if (normalized === 0) return { x: origin.x + distance, y: origin.y }
  if (normalized === 90) return { x: origin.x, y: origin.y + distance }
  if (normalized === 180) return { x: origin.x - distance, y: origin.y }
  if (normalized === 270) return { x: origin.x, y: origin.y - distance }
  const radians = normalized * Math.PI / 180
  return { x: origin.x + Math.cos(radians) * distance, y: origin.y + Math.sin(radians) * distance }
}

function segmentAxis(start: DiagramPoint, end: DiagramPoint): "horizontal" | "vertical" | null {
  if (Math.abs(start.y - end.y) <= 1e-6) return "horizontal"
  if (Math.abs(start.x - end.x) <= 1e-6) return "vertical"
  return null
}

function isOrthogonalPath(path: ReadonlyArray<DiagramPoint>): boolean {
  for (let index = 1; index < path.length; index += 1) {
    if (!segmentAxis(path[index - 1]!, path[index]!)) return false
  }
  return true
}

function findDistinctPoint(path: ReadonlyArray<DiagramPoint>, index: number, step: 1 | -1): DiagramPoint | null {
  const origin = path[index]
  if (!origin) return null
  for (let nextIndex = index + step; nextIndex >= 0 && nextIndex < path.length; nextIndex += step) {
    const next = path[nextIndex]!
    if (Math.abs(origin.x - next.x) <= 1e-6 && Math.abs(origin.y - next.y) <= 1e-6) continue
    if (segmentAxis(origin, next)) return next
  }
  return null
}

function resizeBoundsByHandle(bounds: DiagramRect, handle: DiagramResizeHandle, delta: DiagramPoint, minSize: number, preserveAspectRatio = false, gridSize?: number): DiagramRect {
  let x = bounds.x
  let y = bounds.y
  let width = bounds.width
  let height = bounds.height
  if (handle.includes("e")) width = Math.max(minSize, bounds.width + delta.x)
  if (handle.includes("s")) height = Math.max(minSize, bounds.height + delta.y)
  if (handle.includes("w")) {
    width = Math.max(minSize, bounds.width - delta.x)
    x = bounds.x + (bounds.width - width)
  }
  if (handle.includes("n")) {
    height = Math.max(minSize, bounds.height - delta.y)
    y = bounds.y + (bounds.height - height)
  }
  if (preserveAspectRatio && bounds.width > 0 && bounds.height > 0) {
    const ratio = bounds.width / bounds.height
    const widthChange = handle.includes("e") || handle.includes("w") ? Math.abs(width - bounds.width) : 0
    const heightChangeAsWidth = (handle.includes("n") || handle.includes("s")) ? Math.abs(height - bounds.height) * ratio : 0
    let nextWidth = widthChange >= heightChangeAsWidth ? width : height * ratio
    if (gridSize && gridSize > 0) nextWidth = Math.round(nextWidth / gridSize) * gridSize
    nextWidth = Math.max(minSize, nextWidth)
    width = nextWidth
    height = width / ratio
    if (handle.includes("w")) x = bounds.x + bounds.width - width
    if (handle.includes("n")) y = bounds.y + bounds.height - height
  } else if (gridSize && gridSize > 0) {
    if (handle.includes("e") || handle.includes("w")) width = Math.max(minSize, Math.round(width / gridSize) * gridSize)
    if (handle.includes("n") || handle.includes("s")) height = Math.max(minSize, Math.round(height / gridSize) * gridSize)
    if (handle.includes("w")) x = bounds.x + bounds.width - width
    if (handle.includes("n")) y = bounds.y + bounds.height - height
  }
  return { x, y, width, height }
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

function anchorRotatedResize(bounds: DiagramRect, handle: DiagramResizeHandle, width: number, height: number, rotation: number): DiagramPoint {
  const oldAnchor = anchorPointForHandle(bounds, handle)
  const newAnchorOffset = oppositeCornerOffset(handle, width, height)
  const oldAnchorWorld = rotatePoint(oldAnchor, rectCenter(bounds), rotation)
  const newCenterOffset = { x: width / 2, y: height / 2 }
  const rotatedAnchorOffset = rotateDelta({ x: newAnchorOffset.x - newCenterOffset.x, y: newAnchorOffset.y - newCenterOffset.y }, rotation)
  return {
    x: oldAnchorWorld.x - newCenterOffset.x - rotatedAnchorOffset.x,
    y: oldAnchorWorld.y - newCenterOffset.y - rotatedAnchorOffset.y,
  }
}

function anchorPointForHandle(bounds: DiagramRect, handle: DiagramResizeHandle): DiagramPoint {
  const offset = oppositeCornerOffset(handle, bounds.width, bounds.height)
  return { x: bounds.x + offset.x, y: bounds.y + offset.y }
}

function oppositeCornerOffset(handle: DiagramResizeHandle, width: number, height: number): DiagramPoint {
  return {
    x: handle.includes("w") ? width : 0,
    y: handle.includes("n") ? height : 0,
  }
}

function rectCenter(rect: DiagramRect): DiagramPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function dynamicInputFor(origin: DiagramPoint, point: DiagramPoint): DiagramDynamicInputState {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
  return { x: point.x, y: point.y, dx, dy, length: Math.hypot(dx, dy), angle }
}

function rotatePoint(point: DiagramPoint, center: DiagramPoint, rotation: number): DiagramPoint {
  const delta = rotateDelta({ x: point.x - center.x, y: point.y - center.y }, rotation)
  return { x: center.x + delta.x, y: center.y + delta.y }
}

function rectFromPoints(a: DiagramPoint, b: DiagramPoint): DiagramRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

function rectContainsRect(outer: DiagramRect, inner: DiagramRect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}
