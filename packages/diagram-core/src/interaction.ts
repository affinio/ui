import { createEntityGeometry, diagramPortHostId, inflateRect, pointAtRouteFraction, rectFromPoints as boundsFromPoints, rectIntersects, resolveEdgePath, resolveEndpoint, routeOrthogonalConnector } from "./geometry.js"
import { pathContourBoundsPoints } from "./pathOperations.js"
import { clampViewportToBounds } from "./viewport.js"
import { transformPathContour, translatePathContour } from "./pathOperations.js"
import type { DiagramEngine } from "./DiagramEngine.js"
import type { DiagramBezierAnchor, DiagramBezierHandleKind, DiagramBezierHandlePreview, DiagramBezierCreationOptions, DiagramBezierCreationPreview, DiagramPathCreationOptions, DiagramCommand, DiagramDynamicInputState, DiagramEdge, DiagramEdgeCreationPreview, DiagramEdgeEndpoint, DiagramEdgeSegmentPreview, DiagramEntities, DiagramId, DiagramGeometry, DiagramInteractionSnapOptions, DiagramInteractionSnapshot, DiagramInteractionTool, DiagramJunction, DiagramJunctionRenderGeometry, DiagramMarqueeMode, DiagramPointerEvent, DiagramPoint, DiagramPort, DiagramPortAnchor, DiagramPortCreationOptions, DiagramPortCreationPreview, DiagramRect, DiagramResizeEntry, DiagramResizeHandle, DiagramSnapCandidate, DiagramSnapGuide, DiagramSnapResult, DiagramViewportConstraints, DiagramOrthogonalRouteOptions, DiagramShape, DiagramTableResizeAxis, DiagramTableResizePreview, DiagramPathContour, DiagramPathSegment } from "./types.js"

type ScheduleFrame = (callback: () => void) => void
const AXIS_LOCK_ACTIVATION_TOLERANCE_PX = 4
const EMPTY_SNAP_MARKERS: ReadonlyArray<DiagramSnapCandidate> = Object.freeze([])
type EdgeSegmentDrag = Readonly<{ id: DiagramId; segmentIndex: number; firstSegment: number; lastSegment: number; axis: "horizontal" | "vertical"; path: ReadonlyArray<DiagramPoint>; source: DiagramEdgeEndpoint; target: DiagramEdgeEndpoint; waypointIndex?: number }>

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
  private latestAltKey = false
  private shiftAxis: "x" | "y" | null = null
  private previewDelta: DiagramPoint | null = null
  private previewDeltasById = new Map<DiagramId, DiagramPoint>()
  private dragActivated = false
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
  private edgeSegmentDrag: EdgeSegmentDrag | null = null
  private edgeSegmentPreview: DiagramEdgeSegmentPreview | null = null
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
  private edgeCreationJunctions = new Map<DiagramId, DiagramJunction>()
  private edgeCreationJunctionIds = new Map<"source" | "target", DiagramId>()
  private lineCreationId: DiagramId | null = null
  private lineCreationPreview: DiagramShape | null = null
  private pathCreationId: DiagramId | null = null
  private pathVertices: DiagramPoint[] = []
  private pathCurrentPoint: DiagramPoint | null = null
  private pathCreationOptions: DiagramPathCreationOptions = {}
  private pathClosePending = false
  private bezierCreationId: DiagramId | null = null
  private bezierAnchors: DiagramBezierAnchor[] = []
  private bezierPendingAnchor: DiagramPoint | null = null
  private bezierPendingHandle: DiagramPoint | null = null
  private bezierClosePending = false
  private bezierClosed = false
  private bezierCreationOptions: DiagramBezierCreationOptions = {}
  private bezierHandlePreview: DiagramBezierHandlePreview | null = null
  private bezierHandleCommitContours: ReadonlyArray<DiagramPathContour> | null = null
  private bezierHandleStart: Readonly<{ id: DiagramId; contourIndex: number; segmentIndex: number; handle: DiagramBezierHandleKind; anchorSide?: "start" | "end"; contours: ReadonlyArray<DiagramPathContour> }> | null = null
  private clickToPlaceLine = false
  private pathVertexPreview: Readonly<{ id: DiagramId; index: number; point: DiagramPoint }> | null = null
  private portCreationId: DiagramId | null = null
  private portCreationOptions: DiagramPortCreationOptions = {}
  private portCreationPreview: DiagramPortCreationPreview | null = null
  private vertexDragKind: "path" | "edge" | null = null
  private vertexDragStart: DiagramPoint | null = null
  private vertexConstraintOrigin: DiagramPoint | null = null
  private vertexCardinalAngle: 0 | 90 | 180 | 270 | null = null
  private framePending = false
  private pendingMoveCount = 0
  private commitCount = 0
  private gestureGeneration = 0
  private gestureHistoryId = 0
  private readonly scheduleFrame: ScheduleFrame
  private readonly marqueeMode: DiagramMarqueeMode
  private readonly snapOptions: DiagramInteractionSnapOptions
  private readonly viewportConstraints: DiagramViewportConstraints | undefined
  private readonly editingLockSubscription: { unsubscribe: () => void }

  constructor(private readonly engine: DiagramEngine, options: DiagramInteractionOptions = {}) {
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame
    this.marqueeMode = options.marqueeMode ?? "contain"
    this.snapOptions = options.snap ?? {}
    this.viewportConstraints = options.viewportConstraints
    this.editingLockSubscription = this.engine.subscribeEditingLock((locked) => { if (locked) this.cancel() })
  }

  setTool(tool: DiagramInteractionTool): void {
    this.cancel()
    if (this.engine.isEditingLocked()) return
    this.tool = tool
  }

  pointerDown(event: DiagramPointerEvent): void {
    if (this.engine.isEditingLocked()) return
    if (this.tool === "create-port" && this.portCreationId) {
      this.gestureGeneration += 1
      this.activePointer = event
      this.startPoint = event.point
      this.latestPoint = event.point
      this.updatePortCreationPreview()
      return
    }
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.activePointer = event
      this.latestPoint = event.point
      this.updateEdgeCreationPreview()
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.activePointer = event
      this.latestPoint = event.point
      this.updateShiftAxis(event.shiftKey === true, event.point)
      return
    }
    if (this.tool === "draw-bezier" && this.bezierCreationId) {
      this.latestShiftKey = event.shiftKey === true
      this.edgeEndpointCardinalAngle = null
      this.shiftAxis = null
      const anchor = this.resolveBezierPoint(event.point)
      const first = this.bezierAnchors[0]?.point
      const tolerance = (this.bezierCreationOptions.closeTolerancePx ?? this.snapOptions.tolerancePx ?? 8) / (this.engine.getScene().viewport.zoom || 1)
      this.bezierClosePending = Boolean(first && this.bezierAnchors.length > 1 && distance(first, anchor) <= tolerance)
      this.bezierPendingAnchor = this.bezierClosePending ? first! : anchor
      this.bezierPendingHandle = null
      this.activePointer = event
      this.startPoint = this.bezierPendingAnchor
      this.latestPoint = event.point
      this.latestShiftKey = event.shiftKey === true
      this.updateShiftAxis(event.shiftKey === true, event.point)
      return
    }
    this.gestureGeneration += 1
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.latestAltKey = event.altKey === true
    this.shiftAxis = null
    this.previewDelta = null
    this.previewDeltasById.clear()
    this.dragActivated = false
    this.marquee = null
    this.snapGuides = Object.freeze([])
    this.snapResult = null
    if (this.tool === "select") {
      const hit = this.engine.hitTest(event.point, { radius: 2 })
      if (hit) {
        let targetId = hit.id
        if (hit.kind === "port") {
          const port = this.engine.getScene().entities.portsById.get(hit.id)
          targetId = port ? diagramPortHostId(port) : ""
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
    if (this.engine.isEditingLocked()) return false
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
    this.latestAltKey = event.altKey === true
    this.shiftAxis = null
    this.resizeOwnerId = ownerId
    this.resizeHandle = handle
    this.resizeStartBounds = geometry.unrotatedBounds ?? geometry.bounds
    this.resizeStartRotation = geometry.rotation ?? 0
    return true
  }

  /** Starts a row or column boundary resize. The preview is transient until pointerUp. */
  beginTableResizeHandle(ownerId: DiagramId, axis: DiagramTableResizeAxis, index: number, event: DiagramPointerEvent): boolean {
    if (this.engine.isEditingLocked()) return false
    const table = this.engine.getScene().entities.tablesById.get(ownerId)
    if (!table || !this.engine.canResize([ownerId]) || !Number.isFinite(event.point.x) || !Number.isFinite(event.point.y)
      || !Number.isInteger(index) || index < 0 || index >= (axis === "row" ? table.rowCount - 1 : table.columnCount - 1)) return false
    this.cancel()
    this.tool = "resize-table-axis"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.latestAltKey = event.altKey === true
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
    if (this.engine.isEditingLocked()) return false
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    if (!geometry || geometry.kind !== "edge" || !geometry.path?.length) return false
    const point = endpoint === "source" ? geometry.path[0]! : geometry.path[geometry.path.length - 1]!
    const oppositePoint = endpoint === "source" ? geometry.path[geometry.path.length - 1]! : geometry.path[0]!
    this.cancel()
    this.tool = "drag-edge-endpoint"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.latestAltKey = event.altKey === true
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
    if (this.engine.isEditingLocked()) return false
    const shape = this.engine.getScene().entities.shapesById.get(ownerId)
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    const point = geometry?.path?.[index]
    if (!shape?.points || shape.shape !== "line" || !point || !Number.isInteger(index) || !this.engine.canMove([ownerId])) return false
    this.cancel()
    this.tool = "drag-path-vertex"
    this.activePointer = event; this.startPoint = event.point; this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
    this.vertexConstraintOrigin = shape.points.length === 2 && (index === 0 || index === shape.points.length - 1)
      ? geometry!.path?.[index === 0 ? 1 : 0] ?? null
      : null
    this.vertexCardinalAngle = this.latestShiftKey && this.vertexConstraintOrigin ? nearestCardinalAngle(event.point, this.vertexConstraintOrigin) : null
    this.vertexDragStart = point; this.vertexDragKind = "path"
    this.pathVertexPreview = { id: ownerId, index, point: this.resolvePathVertexPoint(event.point) }
    return true
  }

  beginEdgeWaypointHandle(ownerId: DiagramId, index: number, event: DiagramPointerEvent): boolean {
    if (this.engine.isEditingLocked()) return false
    const edge = this.engine.getScene().entities.edgesById.get(ownerId)
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    const routePoints = edge?.routing?.mode === "auto" ? edge.routing.waypoints ?? [] : edge?.points
    const point = routePoints?.[index]
    if (!edge || !point || !geometry || !Number.isInteger(index) || !this.engine.canMove([ownerId])) return false
    this.cancel()
    this.tool = "drag-path-vertex"
    this.activePointer = event; this.startPoint = event.point; this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
    this.vertexConstraintOrigin = point
    this.vertexCardinalAngle = null
    this.vertexDragStart = point; this.vertexDragKind = "edge"
    this.edgeEndpointId = ownerId
    this.edgeWaypointPreview = [...(routePoints ?? [])]
    this.pathVertexPreview = { id: ownerId, index, point }
    return true
  }

  /** Begins dragging an orthogonal connector segment; route changes stay transient until pointerup. */
  beginEdgeSegmentHandle(ownerId: DiagramId, segmentIndex: number, event: DiagramPointerEvent): boolean {
    if (this.engine.isEditingLocked() || !Number.isInteger(segmentIndex) || ![event.point.x, event.point.y].every(Number.isFinite)) return false
    const edge = this.engine.getScene().entities.edgesById.get(ownerId)
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    const path = geometry?.path
    if (!edge || !path || path.length < 2 || segmentIndex < 0 || segmentIndex >= path.length - 1 || !this.engine.canMove([ownerId])) return false
    const selectedStart = path[segmentIndex]!, selectedEnd = path[segmentIndex + 1]!
    const axis = segmentAxis(selectedStart, selectedEnd)
    if (!axis || (selectedStart.x === selectedEnd.x && selectedStart.y === selectedEnd.y)) return false
    const sameRun = (index: number): boolean => {
      const start = path[index]!, end = path[index + 1]!
      return segmentAxis(start, end) === axis && (axis === "horizontal" ? start.y === selectedStart.y && end.y === selectedStart.y : start.x === selectedStart.x && end.x === selectedStart.x)
    }
    let firstSegment = segmentIndex
    let lastSegment = segmentIndex
    while (firstSegment > 0 && sameRun(firstSegment - 1)) firstSegment -= 1
    while (lastSegment + 1 < path.length - 1 && sameRun(lastSegment + 1)) lastSegment += 1
    this.cancel()
    this.tool = "drag-edge-segment"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.edgeEndpointId = ownerId
    this.edgeWaypointPreview = [...(edge.points ?? [])]
    const waypointIndex = edge.routing?.mode === "auto" ? (edge.routing.waypoints ?? []).findIndex((point) => pointOnOrthogonalSegment(point, selectedStart, selectedEnd, axis)) : -1
    this.edgeSegmentDrag = { id: ownerId, segmentIndex, firstSegment, lastSegment, axis, path: Object.freeze(path.map((point) => Object.freeze({ ...point }))), source: edge.source, target: edge.target, ...(waypointIndex >= 0 ? { waypointIndex } : {}) }
    return true
  }

  /** Starts a transient connector drawing gesture. The caller supplies the stable ID before committing. */
  beginEdgeCreation(id: DiagramId, event: DiagramPointerEvent, routeOptions: DiagramOrthogonalRouteOptions = {}): boolean {
    if (this.engine.isEditingLocked()) return false
    const validDirection = (direction: DiagramOrthogonalRouteOptions["sourceDirection"]) => direction === undefined || ["north", "east", "south", "west"].includes(direction)
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)
      || (routeOptions.terminalLead !== undefined && (!Number.isFinite(routeOptions.terminalLead) || routeOptions.terminalLead < 0))
      || (routeOptions.clearance !== undefined && (!Number.isFinite(routeOptions.clearance) || routeOptions.clearance < 0))
      || (routeOptions.maxBends !== undefined && (!Number.isInteger(routeOptions.maxBends) || routeOptions.maxBends < 0))
      || (routeOptions.maxRouteBends !== undefined && (!Number.isInteger(routeOptions.maxRouteBends) || routeOptions.maxRouteBends < 0))
      || (routeOptions.firstAxis !== undefined && routeOptions.firstAxis !== "horizontal" && routeOptions.firstAxis !== "vertical")
      || (routeOptions.mode !== undefined && routeOptions.mode !== "auto" && routeOptions.mode !== "manual")
      || !validDirection(routeOptions.sourceDirection) || !validDirection(routeOptions.targetDirection)
      || (routeOptions.waypoints ?? []).some((point) => ![point.x, point.y].every(Number.isFinite))) return false
    this.cancel()
    this.tool = "connect-edge"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDynamicInput = dynamicInputFor(event.point, event.point)
    this.latestShiftKey = event.shiftKey === true
    this.edgeCreationId = id
    this.edgeRouteOptions = routeOptions
    this.edgeCreationSource = this.snapEndpoint(event.point, event.point, true, "source")
    this.updateEdgeCreationPreview()
    return true
  }

  /** Starts click-to-place connector routing; clicks add bends and `finishEdgePathCreation` commits once. */
  beginEdgePathCreation(id: DiagramId, event: DiagramPointerEvent, routeOptions: DiagramOrthogonalRouteOptions = {}): boolean {
    if (this.engine.isEditingLocked()) return false
    if (!this.beginEdgeCreation(id, event, routeOptions)) return false
    this.activePointer = null
    this.edgeClickPlacement = true
    this.edgeCreationWaypoints = []
    return true
  }

  finishEdgePathCreation(point?: DiagramPoint): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (!this.edgeClickPlacement || !this.edgeCreationId || !this.edgeCreationPreview) return false
    if (point) this.latestPoint = point
    const lastWaypoint = this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1]
    const finalPoint = point ?? this.latestPoint
    const targetPoint = finalPoint ? this.endpointPoint(this.snapEndpoint(finalPoint, lastWaypoint ?? this.endpointPoint(this.edgeCreationSource!) ?? finalPoint, true, "target")) : null
    if (targetPoint && lastWaypoint && samePoint(lastWaypoint, targetPoint)) this.edgeCreationWaypoints.pop()
    this.updateEdgeCreationPreview()
    const preview = this.edgeCreationPreview!
    if (preview.diagnostics?.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) return false
    const committed = this.commitEdgeCreation(preview)
    this.commitCount += committed
    this.cancel()
    return committed > 0
  }

  /** Starts a line-shape drawing gesture with the same transient snapping contract as connector creation. */
  beginLineCreation(id: DiagramId, event: DiagramPointerEvent): boolean {
    if (this.engine.isEditingLocked()) return false
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)) return false
    this.cancel()
    this.tool = "draw-line"
    this.activePointer = event
    this.latestShiftKey = event.shiftKey === true
    this.lineCreationId = id
    const source = this.snapEndpoint(event.point, event.point)
    const start = this.endpointPoint(source) ?? event.point
    this.startPoint = start
    this.latestPoint = start
    this.updateLineCreationPreview()
    return true
  }

  /** Starts a click-to-place free line (two clicks) or polyline (`finishPathCreation`). */
  beginPathCreation(id: DiagramId, event: DiagramPointerEvent, modeOrOptions: "line" | "path" | DiagramPathCreationOptions = "path"): boolean {
    const mode = typeof modeOrOptions === "string" ? modeOrOptions : "path"
    const options = typeof modeOrOptions === "string" ? {} : modeOrOptions
    if (this.engine.isEditingLocked()) return false
    if (!id || this.engine.getGeometrySnapshot(id) || !finitePoint(event.point)
      || (options.closeTolerancePx !== undefined && (!Number.isFinite(options.closeTolerancePx) || options.closeTolerancePx < 0))) return false
    this.cancel()
    this.tool = "draw-path"
    this.pathCreationId = id
    this.clickToPlaceLine = mode === "line"
    this.pathCreationOptions = options
    this.pathClosePending = false
    this.latestShiftKey = event.shiftKey === true
    this.edgeEndpointCardinalAngle = null
    const start = this.snapEndpoint(event.point, event.point)
    const point = this.endpointPoint(start) ?? event.point
    this.pathVertices = [point]
    this.pathCurrentPoint = point
    this.startPoint = point
    this.latestPoint = point
    this.previewDynamicInput = dynamicInputFor(point, point)
    return true
  }

  /** Starts native cubic path creation. The first pointer event places the first anchor. */
  beginBezierCreation(id: DiagramId, event: DiagramPointerEvent, options: DiagramBezierCreationOptions = {}): boolean {
    if (this.engine.isEditingLocked() || !id || this.engine.getGeometrySnapshot(id) || !finitePoint(event.point)
      || (options.closeTolerancePx !== undefined && (!Number.isFinite(options.closeTolerancePx) || options.closeTolerancePx < 0))) return false
    this.cancel()
    this.tool = "draw-bezier"
    this.bezierCreationId = id
    this.bezierCreationOptions = options
    const point = this.resolvePathPoint(event.point)
    const anchor = bezierAnchor(point)
    this.bezierAnchors = [anchor]
    this.pathCurrentPoint = point
    this.latestPoint = point
    this.latestShiftKey = event.shiftKey === true
    this.startPoint = point
    this.previewDynamicInput = dynamicInputFor(point, point)
    return true
  }

  /** Commits one anchor in the active Bézier draft; `finish` completes the open contour. */
  addBezierAnchor(point?: DiagramPoint, finish = false): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (this.tool !== "draw-bezier" || !this.bezierCreationId || !this.bezierAnchors.length) return false
    const anchorPoint = point ?? this.bezierPendingAnchor ?? this.pathCurrentPoint
    if (!anchorPoint || !finitePoint(anchorPoint)) return false
    const previous = this.bezierAnchors[this.bezierAnchors.length - 1]!
    if (samePoint(previous.point, anchorPoint)) return finish ? this.finishBezierCreation() : false
    // The drag direction is the contour's forward tangent at this anchor.
    const outgoing = this.bezierPendingHandle ?? anchorPoint
    const vector = { x: outgoing.x - anchorPoint.x, y: outgoing.y - anchorPoint.y }
    const nextAnchor = { point: anchorPoint, incoming: { x: anchorPoint.x - vector.x, y: anchorPoint.y - vector.y }, outgoing }
    this.bezierAnchors[this.bezierAnchors.length - 1] = { ...previous, outgoing: previous.outgoing }
    this.bezierAnchors.push(nextAnchor)
    this.bezierPendingAnchor = null
    this.bezierPendingHandle = null
    this.pathCurrentPoint = anchorPoint
    this.edgeEndpointCardinalAngle = null
    this.shiftAxis = null
    if (finish) return this.finishBezierCreation()
    return true
  }

  finishBezierCreation(closed = false): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (this.tool !== "draw-bezier" || !this.bezierCreationId || this.bezierAnchors.length < 2) return false
    const anchors = [...this.bezierAnchors]
    const segments: DiagramPathSegment[] = []
    for (let index = 0; index < anchors.length - 1; index += 1) segments.push(bezierSegment(anchors[index]!, anchors[index + 1]!))
    if (closed && !samePoint(anchors[anchors.length - 1]!.point, anchors[0]!.point)) segments.push(bezierSegment(anchors[anchors.length - 1]!, anchors[0]!))
    const contour: DiagramPathContour = { segments: Object.freeze(segments), closed }
    const result = this.engine.dispatch({ type: "createPath", path: { id: this.bezierCreationId, kind: "path", contours: [contour] }, historyKey: `draw-bezier:${this.bezierCreationId}:${++this.gestureHistoryId}` })
    if (result.changed) {
      this.engine.dispatch({ type: "setSelection", selection: { ids: [this.bezierCreationId], primaryId: this.bezierCreationId } })
      this.commitCount += 1
    }
    this.cancel()
    return result.changed
  }

  /** Begins a transient drag of a cubic anchor or tangent handle on a selected path. */
  beginBezierHandle(id: DiagramId, contourIndex: number, segmentIndex: number, handle: DiagramBezierHandleKind, event: DiagramPointerEvent, anchorSide: "start" | "end" = "end"): boolean {
    if (this.engine.isEditingLocked() || !finitePoint(event.point) || !this.engine.canMove([id])) return false
    const shape = this.engine.getScene().entities.shapesById.get(id)
    const contours = shape?.pathContours
    const segment = contours?.[contourIndex]?.segments[segmentIndex]
    if (!shape || !segment || segment.kind !== "cubic") return false
    this.cancel()
    const localPoint = handle === "anchor" ? (anchorSide === "start" ? segment.start : segment.end) : handle === "incoming" ? segment.control2 : segment.control1
    const worldPoint = shapePathPointToWorld(shape, localPoint)
    this.tool = "drag-path-vertex"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.bezierHandleStart = { id, contourIndex, segmentIndex, handle, ...(handle === "anchor" ? { anchorSide } : {}), contours }
    this.bezierHandlePreview = { id, contourIndex, segmentIndex, handle, ...(handle === "anchor" ? { anchorSide } : {}), point: worldPoint, contours: this.engine.getGeometrySnapshot(id)?.pathContours ?? contours }
    return true
  }

  /** Starts one port placement gesture. After commit the create-port tool remains active for the next caller-supplied ID. */
  beginPortCreation(id: DiagramId, event: DiagramPointerEvent, options: DiagramPortCreationOptions = {}): boolean {
    if (this.engine.isEditingLocked()) return false
    if (!id || this.engine.getGeometrySnapshot(id) || ![event.point.x, event.point.y].every(Number.isFinite)
      || (options.vertexTolerancePx !== undefined && (!Number.isFinite(options.vertexTolerancePx) || options.vertexTolerancePx < 0))) return false
    this.cancel()
    this.tool = "create-port"
    this.portCreationId = id
    this.portCreationOptions = options
    this.startPoint = event.point
    this.latestPoint = event.point
    this.updatePortCreationPreview()
    return true
  }

  /** Commits the pending click as a vertex; pointer motion alone never adds vertices. */
  addPathVertex(point?: DiagramPoint, finish = false): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (this.tool !== "draw-path" || !this.pathCreationId || !this.pathVertices.length) return false
    const candidate = point ?? this.latestPoint ?? this.pathCurrentPoint
    if (!candidate || ![candidate.x, candidate.y].every(Number.isFinite)) return false
    this.updatePathClosePending(candidate)
    if (this.pathClosePending && !this.clickToPlaceLine) return this.commitPathCreation(true)
    const vertex = this.resolvePathPoint(candidate)
    const last = this.pathVertices[this.pathVertices.length - 1]!
    if (last.x !== vertex.x || last.y !== vertex.y) this.pathVertices.push(vertex)
    this.pathCurrentPoint = vertex
    this.previewDynamicInput = dynamicInputFor(vertex, vertex)
    this.shiftAxis = null
    this.edgeEndpointCardinalAngle = null
    if (this.clickToPlaceLine || finish) return this.finishPathCreation()
    return true
  }

  finishPathCreation(): boolean {
    return this.commitPathCreation(false)
  }

  private commitPathCreation(closed: boolean): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (this.tool !== "draw-path" || !this.pathCreationId || this.pathVertices.length < 2) return false
    const points = [...this.pathVertices]
    if (closed) points.push(points[0]!)
    const path = closed ? { id: this.pathCreationId, kind: "path" as const, contours: [{ closed: true, segments: points.slice(1).map((point, index) => ({ kind: "line" as const, start: points[index]!, end: point })) }] } : { id: this.pathCreationId, kind: "path" as const, points: Object.freeze(points) }
    this.engine.dispatch({ type: "createPath", path, historyKey: `draw-path:${this.pathCreationId}:${++this.gestureHistoryId}` })
    this.commitCount += 1
    this.cancel()
    return true
  }

  beginResizeSelectionHandle(handle: DiagramResizeHandle, event: DiagramPointerEvent): boolean {
    if (this.engine.isEditingLocked()) return false
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
    this.latestAltKey = event.altKey === true
    this.shiftAxis = null
    this.resizeSelectionIds = ids
    this.resizeHandle = handle
    this.resizeStartBounds = bounds
    this.resizeStartRotation = 0
    return true
  }

  pointerMove(event: DiagramPointerEvent): void {
    if (this.engine.isEditingLocked()) { this.cancel(); return }
    if (this.tool === "create-port" && this.portCreationId && (!this.activePointer || this.activePointer.id === event.id)) {
      this.latestPoint = event.point
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.updateShiftAxis(event.shiftKey === true, event.point)
      this.latestPoint = event.point
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.latestPoint = event.point
      this.updateShiftAxis(event.shiftKey === true, event.point)
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "draw-bezier" && this.bezierCreationId) {
      this.latestPoint = event.point
      this.latestShiftKey = event.shiftKey === true
      this.updateShiftAxis(event.shiftKey === true, event.point)
      if (this.activePointer?.id === event.id && this.bezierPendingAnchor) {
        this.bezierPendingHandle = this.resolveBezierTangent(this.bezierPendingAnchor, event.point, event.shiftKey === true)
      }
      this.scheduleCreationPreview()
      return
    }
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    this.latestAltKey = event.altKey === true
    if (this.tool === "drag-selection" && this.startPoint && this.isPastAxisActivation(event.point, this.startPoint)) this.dragActivated = true
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.updateVertexShiftConstraint(event.shiftKey === true, event.point)
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "drag-path-vertex" && this.bezierHandleStart) {
      this.latestShiftKey = event.shiftKey === true
      this.updateShiftAxis(event.shiftKey === true, event.point)
      this.scheduleCreationPreview()
      return
    }
    if (this.tool === "create-port" && this.portCreationId) {
      this.scheduleCreationPreview()
      return
    }
    this.dynamicInput = null
    this.latestAltKey = event.altKey === true
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
    if (this.engine.isEditingLocked()) return false
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
    if (this.tool === "drag-selection") this.dragActivated = true
    this.latestPoint = point
    this.dynamicInput = dynamicInputFor(base, point)
    this.previewDynamicInput = this.dynamicInput
    this.flushPointerMove()
    return true
  }

  confirmDynamicInput(): boolean {
    if (this.engine.isEditingLocked()) { this.cancel(); return false }
    if (this.tool === "draw-path" && this.pathCreationId && this.latestPoint) return this.clickToPlaceLine ? this.addPathVertex(this.latestPoint, true) : this.finishPathCreation()
    if (this.tool === "connect-edge" && this.edgeClickPlacement) return this.finishEdgePathCreation(this.latestPoint ?? undefined)
    if (!this.activePointer || !this.latestPoint) return false
    this.pointerUp({ ...this.activePointer, point: this.latestPoint, shiftKey: this.latestShiftKey })
    return true
  }

  cancelDynamicInput(): void {
    this.cancel()
  }

  pointerUp(event: DiagramPointerEvent): void {
    if (this.engine.isEditingLocked()) { this.cancel(); return }
    if (this.tool === "connect-edge" && this.edgeClickPlacement && this.activePointer?.id === event.id) {
      this.activePointer = null
      this.latestPoint = event.point
      this.updateShiftAxis(event.shiftKey === true, event.point)
      const endpoint = this.snapEndpoint(event.point, this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.endpointPoint(this.edgeCreationSource!) ?? this.startPoint!, true, "target")
      if (endpoint.kind === "port" || endpoint.kind === "junction" || (event.clickCount ?? 0) >= 2) this.finishEdgePathCreation(event.point)
      else {
        const snapped = this.endpointPoint(endpoint) ?? event.point
        const previous = this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.endpointPoint(this.edgeCreationSource!)!
        if (previous.x !== snapped.x || previous.y !== snapped.y) {
          this.edgeCreationWaypoints.push(snapped)
          this.edgeEndpointCardinalAngle = null
          this.shiftAxis = null
        }
        this.previewDynamicInput = dynamicInputFor(snapped, snapped)
        this.updateEdgeCreationPreview()
      }
      return
    }
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    if (this.tool === "drag-selection" && this.startPoint && this.isPastAxisActivation(event.point, this.startPoint)) this.dragActivated = true
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.updateVertexShiftConstraint(event.shiftKey === true, event.point)
      this.pathVertexPreview = { ...this.pathVertexPreview, point: this.resolvePathVertexPoint(event.point) }
      if (this.vertexDragKind === "edge" && this.edgeWaypointPreview) {
        this.edgeWaypointPreview = this.repairOrthogonalWaypointPreview(this.pathVertexPreview.id, this.pathVertexPreview.index, this.pathVertexPreview.point)
      }
      const preview = this.pathVertexPreview
      if (this.vertexDragKind === "edge") {
        const edge = this.engine.getScene().entities.edgesById.get(preview.id)
        if (edge && this.edgeWaypointPreview) {
          if (edge.routing?.mode === "auto") this.engine.dispatch({ type: "updateEdgeRouting", id: preview.id, routing: { ...edge.routing, waypoints: this.edgeWaypointPreview } })
          else {
            const commands: DiagramCommand[] = [...(edge.points ?? []).keys()].reverse().map((index) => ({ type: "removeEdgeWaypoint", id: preview.id, index }))
            this.edgeWaypointPreview.forEach((point, index) => commands.push({ type: "insertEdgeWaypoint", id: preview.id, index, point }))
            this.engine.dispatchBatch(commands)
          }
        }
      } else this.engine.dispatch({ type: "movePathVertex", id: preview.id, index: preview.index, point: preview.point })
      this.commitCount += 1
      this.clearGesture()
      this.tool = "select"
      return
    }
    if (this.tool === "drag-path-vertex" && this.bezierHandleStart) {
      this.latestShiftKey = event.shiftKey === true
      this.updateBezierHandlePreview(event.point)
      const preview = this.bezierHandlePreview
      const shape = preview ? this.engine.getScene().entities.shapesById.get(preview.id) : null
      if (preview && shape) {
        const result = this.engine.dispatch({ type: "updateShapePath", id: preview.id, pathContours: this.bezierHandleCommitContours ?? [] })
        if (result.changed) this.commitCount += 1
      }
      this.clearGesture()
      this.tool = "select"
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.updateShiftAxis(event.shiftKey === true, event.point)
      this.updatePathClosePending(event.point)
      this.pathCurrentPoint = this.pathClosePending && !this.clickToPlaceLine ? this.pathVertices[0]! : this.resolvePathPoint(event.point)
      if (this.pathClosePending && !this.clickToPlaceLine) this.commitPathCreation(true)
      else this.addPathVertex(this.pathCurrentPoint, (event.clickCount ?? 0) >= 2)
      this.activePointer = null
      return
    }
    if (this.tool === "draw-bezier" && this.bezierCreationId) {
      this.latestPoint = event.point
      this.updateShiftAxis(event.shiftKey === true, event.point)
      if (this.activePointer?.id === event.id && this.bezierPendingAnchor) {
        if (this.bezierClosePending) this.finishBezierCreation(true)
        else {
          this.bezierPendingAnchor = this.resolveBezierPoint(this.bezierPendingAnchor)
          if (this.bezierPendingHandle && event.shiftKey) this.bezierPendingHandle = this.resolveBezierTangent(this.bezierPendingAnchor, event.point, true)
          const placedAnchor = this.bezierPendingAnchor
          this.addBezierAnchor(placedAnchor)
          this.latestPoint = placedAnchor
          if ((event.clickCount ?? 0) >= 2) this.finishBezierCreation()
          else this.activePointer = null
        }
      } else if ((event.clickCount ?? 0) >= 2) this.finishBezierCreation()
      return
    }
    if (this.tool === "create-port" && this.portCreationId) {
      this.updatePortCreationPreview()
      const preview = this.portCreationPreview
      if (preview) {
        this.engine.dispatch({ type: "createPort", port: { id: preview.id, kind: "port", hostId: preview.hostId, anchor: preview.anchor } })
        if (this.engine.getScene().entities.portsById.has(preview.id)) this.commitCount += 1
      }
      this.clearGesture()
      this.tool = "create-port"
      return
    }
    this.latestAltKey = event.altKey === true
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
    if (this.tool === "drag-selection" && this.dragActivated && this.previewDelta) {
      const selection = this.engine.getScene().selection
      const historyKey = `drag:${selection.primaryId ?? "selection"}:${++this.gestureHistoryId}`
      const strictSize = this.strictGridSize()
      if (strictSize && this.previewDeltasById.size) {
        const snap = { gridSize: strictSize, strictGrid: true }
        const commands: DiagramCommand[] = [...this.previewDeltasById]
          .filter(([, delta]) => delta.x !== 0 || delta.y !== 0)
          .map(([id, delta]) => ({ type: "moveEntities", ids: [id], delta, snap }))
        if (commands.length) this.engine.dispatchBatch(commands)
      } else this.engine.dispatch({ type: "moveEntities", ids: this.dragSelectionIds, delta: this.previewDelta, historyKey })
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
      const gridSize = this.strictGridSize()
      this.engine.dispatch({ type: "resizeEntities", entries: this.resizePreviewEntries, ...(gridSize && !this.latestAltKey ? { snap: { gridSize, strictGrid: true } } : {}), historyKey: `resize:${this.resizePreview?.id ?? "selection"}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "drag-edge-segment" && this.edgeSegmentDrag) {
      const drag = this.edgeSegmentDrag
      const preview = this.edgeSegmentPreview
      const edge = this.engine.getScene().entities.edgesById.get(drag.id)
      if (preview && edge?.routing?.mode === "auto") {
        if (!samePoints(drag.path.slice(1, -1), preview.points)) {
          const first = preview.path[drag.segmentIndex]!, second = preview.path[drag.segmentIndex + 1]!
          const movedConstraint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
          const waypoints = [...(edge.routing.waypoints ?? [])]
          if (drag.waypointIndex !== undefined && drag.waypointIndex < waypoints.length) waypoints[drag.waypointIndex] = movedConstraint
          else if (!waypoints.some((point) => samePoint(point, movedConstraint))) waypoints.push(movedConstraint)
          const result = this.engine.dispatch({ type: "updateEdgeRouting", id: drag.id, routing: { ...edge.routing, waypoints } })
          if (result.changed) this.commitCount += 1
        }
      } else if (preview) {
        const oldPoints = edge?.points ?? []
        if (!samePoints(oldPoints, preview.points) || !sameEndpoint(drag.source, preview.source) || !sameEndpoint(drag.target, preview.target)) {
          const commands: DiagramCommand[] = []
          if (drag.source.kind === "point" && preview.source.kind === "point" && !samePoint(drag.source.point, preview.source.point)) commands.push({ type: "moveEdgeEndpoint", id: drag.id, endpoint: "source", point: preview.source.point })
          if (drag.target.kind === "point" && preview.target.kind === "point" && !samePoint(drag.target.point, preview.target.point)) commands.push({ type: "moveEdgeEndpoint", id: drag.id, endpoint: "target", point: preview.target.point })
          for (let index = oldPoints.length - 1; index >= 0; index -= 1) commands.push({ type: "removeEdgeWaypoint", id: drag.id, index })
          for (let index = 0; index < preview.points.length; index += 1) commands.push({ type: "insertEdgeWaypoint", id: drag.id, index, point: preview.points[index]! })
          if (commands.length && this.engine.dispatchBatch(commands).changed) this.commitCount += 1
        }
      }
      this.clearGesture()
      this.tool = "select"
      return
    }
    if (this.tool === "drag-edge-endpoint" && this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
      && (this.edgeEndpointPreview.x !== this.edgeEndpointStart?.x || this.edgeEndpointPreview.y !== this.edgeEndpointStart?.y || this.edgeEndpointConnection !== null)) {
      const edge = this.engine.getScene().entities.edgesById.get(this.edgeEndpointId)
      const commands: DiagramCommand[] = [this.edgeEndpointConnection
        ? { type: "reconnectEdgeEndpoint", id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, connection: this.edgeEndpointConnection }
        : { type: "moveEdgeEndpoint", id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview }]
      if (this.edgeEndpointConnection?.kind === "junction") {
        const junction = this.edgeCreationJunctions.get(this.edgeEndpointConnection.junctionId)
        if (junction) commands.unshift({ type: "createJunction", junction })
      }
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
      if (!preview.diagnostics?.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) {
        this.commitCount += this.commitEdgeCreation(preview)
      }
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

  dispose(): void {
    this.cancel()
    this.editingLockSubscription.unsubscribe()
  }

  /** Returns renderer-ready geometry for active move and table resize previews. */
  getPreviewGeometry(id: DiagramId): DiagramGeometry | null {
    const geometry = this.engine.getGeometrySnapshot(id)
    if (geometry?.kind === "port") {
      const port = this.engine.getScene().entities.portsById.get(id)
      const hostId = port ? diagramPortHostId(port) : ""
      const hostGeometry = hostId ? this.getPreviewGeometry(hostId) : null
      const committedHostGeometry = hostId ? this.engine.getGeometrySnapshot(hostId) : null
      if (port && hostGeometry && committedHostGeometry && hostGeometry !== committedHostGeometry) {
        let point = this.resolvePreviewPortPoint(port, hostGeometry, committedHostGeometry)
        if (this.isStrictGridEnabled() && (this.resizePreviewEntries.length > 0 || this.tableResizePreview !== null)) point = this.applyStrictGrid(point)
        const radius = port.radius ?? 4
        const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
        return Object.freeze({ ...geometry, point, bounds, hitBounds: inflateRect(bounds, 4) })
      }
    }
    if (geometry?.kind === "group" && this.previewDeltasById.size) {
      const group = this.engine.getScene().entities.groupsById.get(id)
      const bounds = group ? unionRects(group.childIds.map((childId) => this.getPreviewGeometry(childId)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect))) : null
      if (bounds) return Object.freeze({ ...geometry, bounds, hitBounds: inflateRect(bounds, 6) })
    }
    if (geometry?.kind === "edge" && this.edgeSegmentPreview?.id === id) {
      const path = this.edgeSegmentPreview.path
      const bounds = boundsFromPoints(path)
      return Object.freeze({ ...geometry, path: Object.freeze([...path]), bounds, hitBounds: inflateRect(bounds, 6) })
    }
    const edgeForRoutePreview = this.engine.getScene().entities.edgesById.get(id)
    if (geometry?.kind === "edge" && edgeForRoutePreview?.routing?.mode === "auto") {
      const automaticPreview = this.getAutomaticRoutePreviewGeometry(id, geometry, edgeForRoutePreview)
      if (automaticPreview) return automaticPreview
    }
    if (geometry?.kind === "edge" && this.pathVertexPreview?.id === id && this.vertexDragKind === "edge") {
      const edge = this.engine.getScene().entities.edgesById.get(id)
      if (edge) {
        const committedPath = geometry.path ?? []
        const path = this.edgeWaypointPreview
          ? [committedPath[0]!, ...this.edgeWaypointPreview, committedPath[committedPath.length - 1]!]
          : [...committedPath]
        const bounds = boundsFromPoints(path)
        return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
      }
    }
    if (geometry?.kind === "shape" && this.pathVertexPreview?.id === id && this.vertexDragKind === "path" && geometry.path) {
      const path = [...geometry.path]; path[this.pathVertexPreview.index] = this.pathVertexPreview.point
      const bounds = boundsFromPoints(path)
      return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
    }
    if (geometry?.kind === "shape" && this.bezierHandlePreview?.id === id) {
      const points = this.bezierHandlePreview.contours.flatMap(pathContourBoundsPoints)
      const bounds = boundsFromPoints(points)
      return Object.freeze({ ...geometry, pathContours: this.bezierHandlePreview.contours, bounds, hitBounds: inflateRect(bounds, 6) })
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
      const scene = this.engine.getScene()
      const directEntry = this.resizePreviewEntries.find((entry) => entry.id === id)
      if (directEntry && geometry && geometry.kind !== "edge" && geometry.kind !== "port") {
        const shape = scene.entities.shapesById.get(id)
        if (shape && (shape.points || shape.pathContours)) {
          const previewShape = resizeShapePathPreview(shape, directEntry, this.latestAltKey ? undefined : this.strictGridSize())
          return createEntityGeometry(id, { ...scene.entities, shapesById: new Map([[id, previewShape]]) })
        }
        return resizePreviewGeometry(geometry, directEntry)
      }
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
          const childEntry = {
            id,
            x: to.x + (bounds.x - from.x) * scaleX,
            y: to.y + (bounds.y - from.y) * scaleY,
            width: bounds.width * scaleX,
            height: bounds.height * scaleY,
          }
          const shape = scene.entities.shapesById.get(id)
          if (shape && (shape.points || shape.pathContours)) {
            const previewShape = resizeShapePathPreview(shape, childEntry, this.strictGridSize())
            return createEntityGeometry(id, { ...scene.entities, shapesById: new Map([[id, previewShape]]) })
          }
          return resizePreviewGeometry(geometry, childEntry)
        }
      }
    }
    if (!geometry || this.tool !== "drag-selection" || !this.previewDelta) return geometry
    const scene = this.engine.getScene()
    const edge = scene.entities.edgesById.get(id)
    if (geometry.kind === "edge" && edge) {
      const delta = this.previewDeltasById.get(id) ?? this.previewDelta
      const moved = new Set(this.expandedDragSelectionIds())
      const endpointMoves = (endpoint: typeof edge.source): boolean => endpoint.kind === "point"
        ? moved.has(id)
        : endpoint.kind === "node"
          ? moved.has(endpoint.nodeId)
          : endpoint.kind === "junction"
            ? moved.has(scene.entities.junctionsById.get(endpoint.junctionId)?.hostEdgeId ?? "")
            : moved.has(scene.entities.portsById.get(endpoint.portId) ? diagramPortHostId(scene.entities.portsById.get(endpoint.portId)!) : "")
      const path = geometry.path?.map((point, index) => {
        const isSource = index === 0
        const isTarget = index === (geometry.path?.length ?? 0) - 1
        const move = isSource ? endpointMoves(edge.source) : isTarget ? endpointMoves(edge.target) : moved.has(id)
        const endpoint = isSource ? edge.source : isTarget ? edge.target : null
        const hostId = endpoint?.kind === "node" ? endpoint.nodeId : endpoint?.kind === "port" ? diagramPortHostId(scene.entities.portsById.get(endpoint.portId)!) : id
        const endpointDelta = this.previewDeltasById.get(hostId) ?? delta
        return move ? { x: point.x + endpointDelta.x, y: point.y + endpointDelta.y } : point
      })
      if (path?.length) {
        const changed = path.some((point, index) => point !== geometry.path?.[index])
        if (!changed) return geometry
        const bounds = boundsFromPoints(path)
        return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
      }
    }
    if (!this.isDraggedEntity(id)) return geometry
    const entityDelta = this.previewDeltasById.get(id) ?? this.previewDelta
    const move = (point: DiagramPoint): DiagramPoint => ({ x: point.x + entityDelta.x, y: point.y + entityDelta.y })
    return Object.freeze({
      ...geometry,
      bounds: { ...geometry.bounds, x: geometry.bounds.x + entityDelta.x, y: geometry.bounds.y + entityDelta.y },
      hitBounds: { ...geometry.hitBounds, x: geometry.hitBounds.x + entityDelta.x, y: geometry.hitBounds.y + entityDelta.y },
      unrotatedBounds: geometry.unrotatedBounds ? { ...geometry.unrotatedBounds, x: geometry.unrotatedBounds.x + entityDelta.x, y: geometry.unrotatedBounds.y + entityDelta.y } : undefined,
      corners: geometry.corners?.map(move),
      path: geometry.path?.map(move),
      pathContours: geometry.pathContours?.map((contour) => translatePathContour(contour, this.previewDelta!.x, this.previewDelta!.y)),
      point: geometry.point ? move(geometry.point) : undefined,
    })
  }

  getSnapshot(): DiagramInteractionSnapshot {
    const hasPreview = this.previewDelta !== null || this.resizePreviewEntries.length > 0 || this.edgeEndpointPreview !== null || this.edgeSegmentPreview !== null || this.edgeCreationPreview !== null || this.lineCreationPreview !== null || this.pathCreationId !== null || this.bezierCreationId !== null || this.bezierHandlePreview !== null || this.pathVertexPreview !== null || this.portCreationPreview !== null
    const endpointOrigin = this.edgeEndpointOppositeStart ?? (this.tool === "connect-edge" || this.tool === "draw-line" ? this.startPoint : null)
    const endpointAngle = (this.tool === "drag-edge-endpoint" || this.tool === "connect-edge" || this.tool === "draw-line") && endpointOrigin && this.latestPoint
      ? (this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.configuredAngle(this.latestPoint, endpointOrigin, isCreationTool(this.tool)))
      : null
    const movementAngle = this.tool === "drag-selection" && this.startPoint && this.latestPoint && !this.latestShiftKey
      ? this.configuredAngle(this.latestPoint, this.startPoint)
      : null
    const constraint = !hasPreview ? null : endpointAngle !== null
      ? { kind: "angle" as const, angle: endpointAngle }
      : this.edgeSegmentPreview
        ? { kind: "axis" as const, axis: this.edgeSegmentPreview.axis === "horizontal" ? "y" as const : "x" as const }
      : this.tool === "drag-selection" && this.latestShiftKey && this.shiftAxis
        ? { kind: "axis" as const, axis: this.shiftAxis }
        : movementAngle !== null ? { kind: "angle" as const, angle: movementAngle }
          : null
    return {
      tool: this.tool,
      active: this.activePointer !== null || this.pathCreationId !== null || this.bezierCreationId !== null || this.edgeClickPlacement,
      editingLocked: this.engine.isEditingLocked(),
      previewDelta: this.previewDelta,
      resizePreview: this.resizePreview,
      resizePreviewEntries: this.resizePreviewEntries,
      tableResizePreview: this.tableResizePreview,
      edgeEndpointPreview: this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
        ? { id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview, ...(this.edgeEndpointConnection ? { connection: this.edgeEndpointConnection } : {}), ...(this.edgeEndpointConnection?.kind === "junction" && this.prospectiveJunction(this.edgeEndpointConnection.junctionId) ? { prospectiveJunction: this.prospectiveJunction(this.edgeEndpointConnection.junctionId)! } : {}) }
        : null,
      edgeSegmentPreview: this.edgeSegmentPreview,
      snapGuides: this.snapGuides,
      snapResult: this.snapResult,
      snapMarkers: this.snapResult?.candidate ? Object.freeze([this.snapResult.candidate]) : EMPTY_SNAP_MARKERS,
      constraint,
      dynamicInput: this.dynamicInput ?? this.previewDynamicInput,
      edgeCreationPreview: this.edgeCreationPreview,
      shapeCreationPreview: this.lineCreationPreview,
      pathCreationPreview: this.pathCreationId && this.pathVertices.length && this.pathCurrentPoint
        ? { id: this.pathCreationId, vertices: Object.freeze([...this.pathVertices]), current: this.pathCurrentPoint, closing: this.pathClosePending, closeTarget: this.pathClosePending ? this.pathVertices[0]! : null }
        : null,
      bezierCreationPreview: this.bezierCreationId ? this.getBezierCreationPreview() : null,
      bezierHandlePreview: this.bezierHandlePreview,
      portCreationPreview: this.portCreationPreview,
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
    if (this.tool === "drag-selection" && !this.dragActivated) {
      this.previewDelta = null
      this.snapGuides = Object.freeze([])
      this.snapResult = null
      return
    }
    if (this.tool === "draw-path" && this.pathCreationId) {
      this.updatePathClosePending(this.latestPoint)
      this.pathCurrentPoint = this.pathClosePending && !this.clickToPlaceLine ? this.pathVertices[0]! : this.resolvePathPoint(this.latestPoint)
      this.previewDynamicInput = dynamicInputFor(this.pathVertices[this.pathVertices.length - 1]!, this.pathCurrentPoint)
      return
    }
    if (this.tool === "draw-bezier" && this.bezierCreationId) {
      this.updateBezierClosePending(this.latestPoint)
      this.pathCurrentPoint = this.bezierClosePending ? this.bezierAnchors[0]!.point : this.resolveBezierPoint(this.latestPoint)
      if (this.activePointer && this.bezierPendingAnchor) this.bezierPendingHandle = this.resolveBezierTangent(this.bezierPendingAnchor, this.latestPoint, this.latestShiftKey)
      return
    }
    if (this.tool === "drag-path-vertex" && this.bezierHandleStart) {
      this.updateBezierHandlePreview(this.latestPoint)
      return
    }
    if (this.tool === "create-port" && this.portCreationId) {
      this.updatePortCreationPreview()
      return
    }
    if (this.tool === "connect-edge" && this.edgeClickPlacement) {
      this.updateEdgeCreationPreview()
      return
    }
    if (this.tool === "drag-path-vertex" && this.pathVertexPreview) {
      this.pathVertexPreview = { ...this.pathVertexPreview, point: this.resolvePathVertexPoint(this.latestPoint) }
      if (this.vertexDragKind === "edge" && this.edgeWaypointPreview) {
        this.edgeWaypointPreview = this.repairOrthogonalWaypointPreview(this.pathVertexPreview.id, this.pathVertexPreview.index, this.pathVertexPreview.point)
      }
      return
    }
    if (this.tool === "drag-edge-segment" && this.edgeSegmentDrag) {
      this.updateEdgeSegmentPreview(this.latestPoint)
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
          strictGrid: this.isStrictGridEnabled(),
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
        if (configuredAngle !== null && !this.isStrictGridEnabled()) {
          const constrainedPoint = projectToAngle(this.startPoint, { x: this.startPoint.x + snapped.point.x, y: this.startPoint.y + snapped.point.y }, configuredAngle)
          const constrainedSnap = { x: constrainedPoint.x - this.startPoint.x, y: constrainedPoint.y - this.startPoint.y }
          if (constrainedSnap.x !== snapped.point.x || constrainedSnap.y !== snapped.point.y) this.snapGuides = Object.freeze([])
          this.previewDelta = constrainedSnap
        }
        this.previewDeltasById.clear()
        const strictSize = this.strictGridSize()
        if (strictSize) for (const id of this.expandedDragSelectionIds()) {
          if (this.engine.getScene().entities.groupsById.has(id) || !this.engine.canMove([id])) continue
          const geometry = this.engine.getGeometrySnapshot(id)
          const bounds = geometry?.unrotatedBounds ?? geometry?.bounds
          if (!bounds) continue
          this.previewDeltasById.set(id, {
            x: Math.round((bounds.x + this.previewDelta.x) / strictSize) * strictSize - bounds.x,
            y: Math.round((bounds.y + this.previewDelta.y) / strictSize) * strictSize - bounds.y,
          })
        }
        const preservesCandidate = configuredAngle === null || this.isStrictGridEnabled() || (this.previewDelta.x === snapped.point.x && this.previewDelta.y === snapped.point.y)
        this.snapResult = { point: this.previewDelta, snapped: snapped.snapped, source: snapped.source, ...(preservesCandidate && snapped.candidate ? { candidate: snapped.candidate, targetId: snapped.targetId } : {}) }
      } else {
        this.previewDelta = constrainedDelta
        this.previewDeltasById.clear()
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
      if (this.snapOptions.endpointMode === "reattach" && this.edgeEndpointKind) {
        const attached = this.snapEndpoint(this.latestPoint, this.edgeEndpointOppositeStart ?? origin, true, this.edgeEndpointKind)
        const point = this.endpointPoint(attached) ?? (attached.kind === "point" ? attached.point : null)
        if (point) {
          this.edgeEndpointPreview = point
          this.edgeEndpointConnection = attached.kind === "point" ? null : attached
          this.edgeWaypointPreview = this.createOrthogonalWaypointPreview(point)
          return
        }
      }
      const angle = this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.edgeEndpointOppositeStart
        ? this.snapOptions.ortho ? nearestCardinalAngle(this.latestPoint, this.edgeEndpointOppositeStart) : this.configuredAngle(this.latestPoint, this.edgeEndpointOppositeStart)
        : null
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
          strictGrid: this.isStrictGridEnabled(),
          axisConstraint,
          snapToPorts: this.snapOptions.snapToPorts,
          snapToAlignment: this.snapOptions.snapToAlignment,
          excludeIds: new Set(this.edgeEndpointId ? [this.edgeEndpointId] : []),
          kinds: this.snapOptions.kinds,
          tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
          origin: this.edgeEndpointOppositeStart ?? undefined,
          angleIncrement: this.snapOptions.angleIncrement,
          additionalAngles: this.snapOptions.additionalAngles,
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

  private updatePortCreationPreview(): void {
    const id = this.portCreationId
    const point = this.latestPoint
    if (!id || !point) { this.portCreationPreview = null; return }
    const viewport = this.engine.getScene().viewport
    const zoom = viewport.zoom > 0 ? viewport.zoom : 1
    const tolerancePx = this.portCreationOptions.vertexTolerancePx ?? this.snapOptions.tolerancePx ?? 6
    const kinds = ["node", "shape", "text", "table", "group", "edge"] as const
    const hostId = this.portCreationOptions.hostId
      ?? this.engine.hitTest(point, { kinds, radius: tolerancePx / zoom })?.id
    if (!hostId) { this.portCreationPreview = null; return }
    const host = this.engine.getGeometrySnapshot(hostId)
    if (!host || !kinds.includes(host.kind as typeof kinds[number])) { this.portCreationPreview = null; return }
    if (host.kind === "edge") {
      const edgeIds = [...this.engine.getScene().entities.edgesById.keys()]
      const exclude = new Set(edgeIds.filter((edgeId) => edgeId !== hostId))
      const attachment = this.engine.nearestConnectorAttachment(point, tolerancePx / zoom, exclude)
      if (!attachment || attachment.edgeId !== hostId) { this.portCreationPreview = null; return }
      const anchor: DiagramPortAnchor = { kind: "route", fraction: attachment.fraction }
      const candidate = { kind: "connector" as const, point: attachment.point, targetId: hostId, distancePx: attachment.distance * zoom }
      const snapResult: DiagramSnapResult = { point: attachment.point, snapped: attachment.distance > 1e-9, source: "connector", targetId: hostId, candidate, candidates: [candidate] }
      this.portCreationPreview = Object.freeze({ id, hostId, anchor: Object.freeze(anchor), point: Object.freeze(attachment.point), snapResult: Object.freeze(snapResult) })
      this.snapResult = snapResult
      return
    }
    const localBounds = this.portHostLocalBounds(hostId, host)
    if (!localBounds) { this.portCreationPreview = null; return }

    const shape = this.engine.getScene().entities.shapesById.get(hostId)
    const path = shape?.shape === "line"
      ? host.path ?? [worldPointAtLocalAnchor({ kind: "local", x: 0, y: 0 }, host, localBounds), worldPointAtLocalAnchor({ kind: "local", x: shape.width, y: shape.height }, host, localBounds)]
      : undefined
    const canAnchorToVertex = Boolean(shape?.shape === "line" && !shape.pathContours?.length)
    let anchor: DiagramPortAnchor
    let resolvedPoint: DiagramPoint
    let snapResult: DiagramSnapResult | undefined
    if (path && path.length >= 2) {
      const nearestVertex = canAnchorToVertex ? path.reduce<{ index: number; point: DiagramPoint; distance: number } | null>((best, vertex, index) => {
        const candidateDistance = Math.hypot(vertex.x - point.x, vertex.y - point.y)
        return candidateDistance * zoom <= tolerancePx && (!best || candidateDistance < best.distance || (candidateDistance === best.distance && index < best.index))
          ? { index, point: vertex, distance: candidateDistance }
          : best
      }, null) : null
      if (nearestVertex) {
        anchor = { kind: "vertex", index: nearestVertex.index }
        resolvedPoint = nearestVertex.point
        const candidate = { kind: "endpoint" as const, point: resolvedPoint, targetId: hostId, distancePx: nearestVertex.distance * zoom }
        snapResult = { point: resolvedPoint, snapped: nearestVertex.distance > 0, source: "endpoint", targetId: hostId, candidate, candidates: [candidate] }
      } else {
        const nearest = nearestPointOnPolyline(point, path)
        if (!nearest) { this.portCreationPreview = null; return }
        resolvedPoint = nearest.point
        anchor = localAnchorAtWorldPoint(resolvedPoint, host, localBounds)
        const candidate = { kind: "nearest" as const, point: resolvedPoint, targetId: hostId, distancePx: nearest.distance * zoom }
        snapResult = { point: resolvedPoint, snapped: nearest.distance > 1e-9, source: "nearest", targetId: hostId, candidate, candidates: [candidate] }
      }
    } else {
      anchor = localAnchorAtWorldPoint(point, host, localBounds)
      resolvedPoint = worldPointAtLocalAnchor(anchor, host, localBounds)
    }
    const gridPoint = this.applyStrictGrid(resolvedPoint, snapResult)
    if (!samePoint(gridPoint, resolvedPoint)) {
      resolvedPoint = gridPoint
      anchor = localAnchorAtWorldPoint(resolvedPoint, host, localBounds)
      snapResult = this.snapResult ?? { point: resolvedPoint, snapped: true, source: "grid" }
    } else if (this.isStrictGridEnabled() && !snapResult) {
      snapResult = { point: resolvedPoint, snapped: true, source: "grid" }
    }
    this.portCreationPreview = Object.freeze({ id, hostId, anchor: Object.freeze({ ...anchor }), point: Object.freeze({ ...resolvedPoint }), ...(snapResult ? { snapResult: Object.freeze(snapResult) } : {}) })
    this.snapResult = snapResult ?? null
  }

  private updateEdgeSegmentPreview(pointer: DiagramPoint): void {
    const drag = this.edgeSegmentDrag
    const pointerOrigin = this.startPoint
    if (!drag || !pointerOrigin) return
    if (!this.isPastAxisActivation(pointer, pointerOrigin)) {
      this.edgeSegmentPreview = null
      this.edgeWaypointPreview = [...(this.engine.getScene().entities.edgesById.get(drag.id)?.points ?? [])]
      this.snapResult = null
      this.snapGuides = Object.freeze([])
      return
    }
    const start = drag.path[drag.segmentIndex]!
    const end = drag.path[drag.segmentIndex + 1]!
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const moveAxis = drag.axis === "horizontal" ? "y" : "x"
    const rawDelta = drag.axis === "horizontal" ? pointer.y - pointerOrigin.y : pointer.x - pointerOrigin.x
    let resolvedMidpoint = drag.axis === "horizontal" ? { x: midpoint.x, y: midpoint.y + rawDelta } : { x: midpoint.x + rawDelta, y: midpoint.y }
    this.snapResult = null
    this.snapGuides = Object.freeze([])
    if (this.snapOptions.enabled !== false) {
      const kinds = [...(this.snapOptions.kinds ?? ["port", "endpoint", "midpoint", "center", "intersection", "perpendicular", "nearest", "alignment", "equal-spacing", ...(this.snapOptions.gridSize ? ["grid" as const] : [])])]
        .filter((kind) => kind !== "port" || this.snapOptions.snapToPorts !== false)
        .filter((kind) => kind !== "alignment" || this.snapOptions.snapToAlignment !== false)
        .filter((kind) => kind !== "equal-spacing" || this.snapOptions.snapToEqualSpacing !== false)
        .filter((kind) => kind !== "grid" || Boolean(this.snapOptions.gridSize))
      const viewport = this.engine.getScene().viewport
      const snap = this.engine.snapPoint(resolvedMidpoint, {
        radius: (this.snapOptions.tolerancePx ?? 6) / (viewport.zoom > 0 ? viewport.zoom : 1),
        tolerancePx: this.snapOptions.tolerancePx ?? 6,
        gridSize: this.snapOptions.gridSize,
        strictGrid: this.isStrictGridEnabled(),
        kinds,
        axisConstraint: moveAxis,
        snapToPorts: this.snapOptions.snapToPorts,
        snapToAlignment: this.snapOptions.snapToAlignment,
        snapToEqualSpacing: this.snapOptions.snapToEqualSpacing ?? true,
        excludeIds: new Set([drag.id]),
      })
      resolvedMidpoint = snap.point
      this.snapResult = snap
    }
    const delta = drag.axis === "horizontal" ? { x: 0, y: resolvedMidpoint.y - midpoint.y } : { x: resolvedMidpoint.x - midpoint.x, y: 0 }
    const move = (point: DiagramPoint): DiagramPoint => ({ x: point.x + delta.x, y: point.y + delta.y })
    const path = drag.path
    const lastPathIndex = path.length - 1
    const sourceMoves = drag.firstSegment === 0 && drag.source.kind === "point"
    const targetMoves = drag.lastSegment === lastPathIndex - 1 && drag.target.kind === "point"
    const nextSource = sourceMoves ? { kind: "point" as const, point: move(path[0]!) } : drag.source
    const nextTarget = targetMoves ? { kind: "point" as const, point: move(path[lastPathIndex]!) } : drag.target
    const nextPath: DiagramPoint[] = [nextSource.kind === "point" ? nextSource.point : path[0]!]
    const movedFirstVertex = drag.firstSegment + 1 <= lastPathIndex - 1 ? move(path[drag.firstSegment + 1]!) : null
    if (drag.firstSegment === 0 && !sourceMoves && movedFirstVertex) nextPath.push(orthogonalConnectorElbow(nextPath[0]!, movedFirstVertex, drag.axis, true))
    for (let index = 1; index < lastPathIndex; index += 1) {
      const isInMovedRun = index >= drag.firstSegment && index <= drag.lastSegment + 1
      nextPath.push(isInMovedRun ? move(path[index]!) : path[index]!)
    }
    const movedLastVertex = drag.lastSegment + 1 >= 1 ? move(path[drag.lastSegment]!) : null
    if (drag.lastSegment === lastPathIndex - 1 && !targetMoves && movedLastVertex) nextPath.push(orthogonalConnectorElbow(movedLastVertex, nextTarget.kind === "point" ? nextTarget.point : path[lastPathIndex]!, drag.axis, false))
    nextPath.push(nextTarget.kind === "point" ? nextTarget.point : path[lastPathIndex]!)
    const cleanPath = simplifyOrthogonalEditPath(nextPath)
    const points = cleanPath.slice(1, -1)
    this.edgeWaypointPreview = points
    this.edgeSegmentPreview = Object.freeze({
      id: drag.id,
      segmentIndex: drag.segmentIndex,
      axis: drag.axis,
      path: Object.freeze(cleanPath.map((point) => Object.freeze({ ...point }))),
      points: Object.freeze(points.map((point) => Object.freeze({ ...point }))),
      source: nextSource,
      target: nextTarget,
    })
  }

  private portHostLocalBounds(hostId: DiagramId, geometry: DiagramGeometry): DiagramRect | null {
    const scene = this.engine.getScene()
    const node = scene.entities.nodesById.get(hostId)
    if (node) return { x: node.x, y: node.y, width: node.width, height: node.height }
    const shape = scene.entities.shapesById.get(hostId)
    if (shape) return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
    const text = scene.entities.textsById.get(hostId)
    if (text) return geometry.unrotatedBounds ?? geometry.bounds
    const table = scene.entities.tablesById.get(hostId)
    if (table) return { x: table.x, y: table.y, width: table.width, height: table.height }
    if (scene.entities.groupsById.has(hostId)) return geometry.bounds
    return null
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
      strictGrid: this.isStrictGridEnabled(),
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      kinds: this.snapOptions.kinds,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
      origin,
      angleIncrement: this.snapOptions.angleIncrement,
      additionalAngles: this.snapOptions.additionalAngles,
      // Ortho is reserved for drawing; dragging an existing path vertex stays free unless Shift is held.
    })
    this.snapResult = snap
    return snap.point
  }

  private updateVertexShiftConstraint(shiftKey: boolean, point: DiagramPoint): void {
    if ((this.vertexDragKind !== "path" && this.vertexDragKind !== "edge") || !this.vertexConstraintOrigin) return
    if (!shiftKey) {
      this.vertexCardinalAngle = null
      this.latestShiftKey = false
      return
    }
    if ((!this.latestShiftKey || this.vertexCardinalAngle === null) && this.isPastAxisActivation(point, this.vertexConstraintOrigin)) {
      this.vertexCardinalAngle = nearestCardinalAngle(point, this.vertexConstraintOrigin)
    }
    this.latestShiftKey = true
  }

  private resolvePathVertexPoint(point: DiagramPoint): DiagramPoint {
    const origin = this.vertexConstraintOrigin
    const orthoEndpoint = this.vertexDragKind === "path" && this.snapOptions.ortho === true && origin !== null
    if ((this.vertexDragKind !== "path" && this.vertexDragKind !== "edge") || !origin || (!this.latestShiftKey && !orthoEndpoint) || (this.latestShiftKey && this.vertexCardinalAngle === null)) {
      return this.resolveFreeSnap(point, this.vertexDragStart ?? point)
    }
    const angle = this.latestShiftKey ? this.vertexCardinalAngle! : nearestCardinalAngle(point, origin)
    const axisConstraint = angle === 0 || angle === 180 ? "x" : "y"
    const desired = projectToAngle(origin, point, angle)
    if (this.snapOptions.enabled === false) {
      this.snapResult = null
      return desired
    }
    const zoom = this.engine.getScene().viewport.zoom || 1
    const snap = this.engine.snapPoint(desired, {
      radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
      gridSize: this.snapOptions.gridSize,
      strictGrid: this.isStrictGridEnabled(),
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      axisConstraint,
      excludeIds: this.pathVertexPreview ? new Set([this.pathVertexPreview.id]) : undefined,
      kinds: this.snapOptions.kinds,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
    })
    this.snapResult = snap
    const projected = this.vertexDragKind === "edge" ? projectToAngle(origin, snap.point, angle) : snap.point
    return this.applyStrictGrid(projected, snap)
  }

  private resolvePathPoint(point: DiagramPoint): DiagramPoint {
    const origin = this.pathVertices[this.pathVertices.length - 1] ?? this.startPoint ?? point
    const snapped = this.endpointPoint(this.snapEndpoint(point, origin)) ?? point
    if (this.snapOptions.ortho && !this.latestShiftKey) {
      const horizontal = Math.abs(point.x - origin.x) >= Math.abs(point.y - origin.y)
      return this.applyStrictGrid(horizontal ? { x: snapped.x, y: origin.y } : { x: origin.x, y: snapped.y }, this.snapResult ?? undefined)
    }
    return snapped
  }

  private closeToleranceWorld(options: DiagramPathCreationOptions | DiagramBezierCreationOptions): number {
    return (options.closeTolerancePx ?? this.snapOptions.tolerancePx ?? 8) / (this.engine.getScene().viewport.zoom || 1)
  }

  private updatePathClosePending(point: DiagramPoint): void {
    const first = this.pathVertices[0]
    this.pathClosePending = !this.clickToPlaceLine && this.pathVertices.length >= 3 && Boolean(first)
      && distance(first!, point) <= this.closeToleranceWorld(this.pathCreationOptions)
    if (this.pathClosePending) this.pathCurrentPoint = first!
  }

  private updateBezierClosePending(point: DiagramPoint): void {
    const first = this.bezierAnchors[0]?.point
    const resolved = this.resolveBezierPoint(point)
    this.bezierClosePending = Boolean(first && this.bezierAnchors.length > 1
      && distance(first, resolved) <= this.closeToleranceWorld(this.bezierCreationOptions))
    if (this.bezierClosePending) this.pathCurrentPoint = first!
  }

  private resolveBezierPoint(point: DiagramPoint): DiagramPoint {
    const origin = this.bezierAnchors[this.bezierAnchors.length - 1]?.point ?? this.startPoint ?? point
    return this.endpointPoint(this.snapEndpoint(point, origin)) ?? point
  }

  private snapBezierAnchor(point: DiagramPoint, id: DiagramId): DiagramPoint {
    if (this.snapOptions.enabled === false) return point
    const zoom = this.engine.getScene().viewport.zoom || 1
    const result = this.engine.snapPoint(point, {
      radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
      gridSize: this.snapOptions.gridSize,
      strictGrid: this.isStrictGridEnabled(),
      kinds: this.snapOptions.kinds,
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      snapToEqualSpacing: this.snapOptions.snapToEqualSpacing,
      excludeIds: new Set([id]),
    })
    this.snapResult = result
    return result.point
  }

  private resolveBezierTangent(anchor: DiagramPoint, point: DiagramPoint, shift: boolean): DiagramPoint {
    if (!shift) return point
    return this.edgeEndpointCardinalAngle === null ? constrainTangent(anchor, point) : projectToAngle(anchor, point, this.edgeEndpointCardinalAngle)
  }

  private endpointPoint(endpoint: DiagramEdgeEndpoint): DiagramPoint | null {
    if (endpoint.kind === "point") return endpoint.point
    if (endpoint.kind === "port") return this.engine.getGeometrySnapshot(endpoint.portId)?.point ?? null
    if (endpoint.kind === "junction") {
      const junction = this.edgeCreationJunctions.get(endpoint.junctionId) ?? this.engine.getScene().entities.junctionsById.get(endpoint.junctionId)
      const path = junction ? this.engine.getGeometrySnapshot(junction.hostEdgeId)?.path : undefined
      return junction && path ? pointAtRouteFraction(path, junction.anchor.fraction) : null
    }
    const bounds = this.engine.getGeometrySnapshot(endpoint.nodeId)?.bounds
    return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : null
  }

  private resolvePreviewPortPoint(port: DiagramPort, host: DiagramGeometry, committedHost: DiagramGeometry): DiagramPoint {
    if ("anchor" in port && port.anchor?.kind === "vertex") return host.path?.[port.anchor.index] ?? host.point ?? { x: host.bounds.x, y: host.bounds.y }
    if ("anchor" in port && port.anchor?.kind === "route") return host.path ? pointAtRouteFraction(host.path, port.anchor.fraction) : host.point ?? { x: host.bounds.x, y: host.bounds.y }
    const bounds = host.unrotatedBounds ?? host.bounds
    const originalBounds = committedHost.unrotatedBounds ?? committedHost.bounds
    const scaleX = originalBounds.width === 0 ? 1 : bounds.width / originalBounds.width
    const scaleY = originalBounds.height === 0 ? 1 : bounds.height / originalBounds.height
    const x = ("nodeId" in port && port.nodeId ? port.x : "anchor" in port && port.anchor?.kind === "local" ? port.anchor.x : 0) * scaleX
    const y = ("nodeId" in port && port.nodeId ? port.y : "anchor" in port && port.anchor?.kind === "local" ? port.anchor.y : 0) * scaleY
    const localPoint = { x: bounds.x + (host.flipX ? bounds.width - x : x), y: bounds.y + (host.flipY ? bounds.height - y : y) }
    return host.kind === "group" ? localPoint : rotatePoint(localPoint, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, host.rotation ?? 0)
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
    const rawSize = Math.max(1, start.size + (start.axis === "row" ? localY : localX))
    const gridSize = this.strictGridSize()
    const size = gridSize ? Math.max(gridSize, Math.round(rawSize / gridSize) * gridSize) : rawSize
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

  private snapEndpoint(point: DiagramPoint, origin: DiagramPoint, connectorEndpoint = false, junctionRole: "source" | "target" = "target"): DiagramEdgeEndpoint {
    const drawing = isCreationTool(this.tool)
    const angle = this.latestShiftKey ? this.edgeEndpointCardinalAngle : this.configuredAngle(point, origin, drawing)
    const desiredPoint = angle === null ? point : projectToAngle(origin, point, angle)
    if (this.snapOptions.enabled === false) {
      this.snapResult = null
      return { kind: "point", point: desiredPoint }
    }
    const zoom = this.engine.getScene().viewport.zoom || 1
    if (connectorEndpoint) {
      const ownerId = this.edgeCreationId ?? this.edgeEndpointId
      const oldPendingId = ownerId ? this.pendingJunctionId(ownerId, junctionRole) : null
      if (oldPendingId) this.edgeCreationJunctions.delete(oldPendingId)
      const portAllowed = this.snapOptions.snapToPorts !== false && (!this.snapOptions.kinds || this.snapOptions.kinds.includes("port"))
      const portTolerance = this.snapOptions.portTolerancePx ?? this.snapOptions.tolerancePx ?? 6
      const port = portAllowed && Number.isFinite(portTolerance) && portTolerance >= 0
        ? this.engine.nearestPort(point, portTolerance / zoom)
        : null
      if (port) {
        const portPoint = this.engine.getGeometrySnapshot(port.id)?.point
        if (portPoint) {
          const candidate: DiagramSnapCandidate = { kind: "port", point: portPoint, targetId: port.id, distancePx: port.distance * zoom }
          this.snapResult = { point: portPoint, snapped: true, source: "port", targetId: port.id, candidate, candidates: [candidate] }
          return { kind: "port", portId: port.id }
        }
      }
      const connectorAllowed = this.snapOptions.snapToConnectors !== false && (!this.snapOptions.kinds || this.snapOptions.kinds.includes("connector"))
      const connectorTolerance = this.snapOptions.connectorTolerancePx ?? this.snapOptions.tolerancePx ?? 6
      const attachment = connectorAllowed && Number.isFinite(connectorTolerance) && connectorTolerance >= 0
        ? this.engine.nearestConnectorAttachment(point, connectorTolerance / zoom, new Set(ownerId ? [ownerId] : []))
        : null
      if (attachment && ownerId) {
        const junctionId = this.pendingJunctionId(ownerId, junctionRole)
        const junction: DiagramJunction = { id: junctionId, kind: "junction", hostEdgeId: attachment.edgeId, anchor: { kind: "route", fraction: attachment.fraction } }
        this.edgeCreationJunctions.set(junctionId, junction)
        const candidate: DiagramSnapCandidate = { kind: "connector", point: attachment.point, targetId: attachment.edgeId, distancePx: attachment.distance * zoom }
        this.snapResult = { point: attachment.point, snapped: true, source: "connector", targetId: attachment.edgeId, candidate, candidates: [candidate] }
        return { kind: "junction", junctionId }
      }
      const kinds = this.snapOptions.kinds?.filter((kind) => kind !== "port" && kind !== "connector")
        ?? ["grid", "endpoint", "midpoint", "center", "intersection", "perpendicular", "nearest", "alignment", "equal-spacing"] as const
      const snap = this.engine.snapPoint(desiredPoint, {
        radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
        gridSize: this.snapOptions.gridSize,
        strictGrid: this.isStrictGridEnabled(),
        snapToPorts: false,
        snapToAlignment: this.snapOptions.snapToAlignment,
        snapToEqualSpacing: this.snapOptions.snapToEqualSpacing,
        kinds,
        tolerancePx: this.snapOptions.tolerancePx,
        origin: angle === null ? origin : undefined,
        angleIncrement: angle === null ? this.snapOptions.angleIncrement : undefined,
        additionalAngles: this.snapOptions.additionalAngles,
        ortho: drawing && angle === null ? this.snapOptions.ortho : undefined,
      })
      const projectedPoint = angle === null ? snap.point : projectToAngle(origin, snap.point, angle)
      const resolvedPoint = this.applyStrictGrid(projectedPoint, snap)
      const compatible = resolvedPoint.x === snap.point.x && resolvedPoint.y === snap.point.y
      this.snapResult = compatible ? snap : this.isStrictGridEnabled() && this.snapResult?.source === "grid"
        ? this.snapResult : { point: resolvedPoint, snapped: true, source: "angle", candidates: snap.candidates }
      return { kind: "point", point: resolvedPoint }
    }
    const snap = this.engine.snapPoint(desiredPoint, {
      radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
      gridSize: this.snapOptions.gridSize,
      strictGrid: this.isStrictGridEnabled(),
      snapToPorts: this.snapOptions.snapToPorts,
      snapToAlignment: this.snapOptions.snapToAlignment,
      kinds: this.snapOptions.kinds,
      tolerancePx: this.snapOptions.kinds ? this.snapOptions.tolerancePx : undefined,
      origin: angle === null ? origin : undefined,
      angleIncrement: angle === null ? this.snapOptions.angleIncrement : undefined,
      additionalAngles: this.snapOptions.additionalAngles,
      ortho: drawing && angle === null ? this.snapOptions.ortho : undefined,
    })
    const projectedPoint = angle === null ? snap.point : projectToAngle(origin, snap.point, angle)
    const resolvedPoint = this.applyStrictGrid(projectedPoint, snap)
    const compatibleSnap = resolvedPoint.x === snap.point.x && resolvedPoint.y === snap.point.y
    this.snapResult = compatibleSnap
      ? snap
      : this.isStrictGridEnabled() && this.snapResult?.source === "grid"
        ? this.snapResult
        : { point: resolvedPoint, snapped: true, source: "angle", candidates: snap.candidates }
    return compatibleSnap && snap.source === "port" && snap.targetId
      ? { kind: "port", portId: snap.targetId }
      : { kind: "point", point: resolvedPoint }
  }

  private getAutomaticRoutePreviewGeometry(id: DiagramId, geometry: DiagramGeometry, edge: DiagramEdge): DiagramGeometry | null {
    const scene = this.engine.getScene()
    const entities = scene.entities
    const next = {
      ...entities,
      nodesById: new Map(entities.nodesById),
      edgesById: new Map(entities.edgesById),
      textsById: new Map(entities.textsById),
      shapesById: new Map(entities.shapesById),
      tablesById: new Map(entities.tablesById),
    }
    let changed = false
    const changedIds = new Set<DiagramId>()
    if (this.edgeEndpointId === id && this.edgeEndpointKind && this.edgeEndpointPreview) {
      const connection = this.edgeEndpointConnection ?? { kind: "point" as const, point: this.edgeEndpointPreview }
      next.edgesById.set(id, { ...edge, [this.edgeEndpointKind]: connection })
      changedIds.add(id)
      changed = true
    } else if (this.pathVertexPreview?.id === id && this.vertexDragKind === "edge" && this.edgeWaypointPreview) {
      next.edgesById.set(id, { ...edge, routing: { ...edge.routing!, waypoints: [...this.edgeWaypointPreview] } })
      changedIds.add(id)
      changed = true
    } else if (this.tool === "drag-selection" && this.previewDelta) {
      const moved = new Set(this.expandedDragSelectionIds())
      for (const movedId of moved) {
        const delta = this.previewDeltasById.get(movedId) ?? this.previewDelta
        const translate = (point: DiagramPoint): DiagramPoint => ({ x: point.x + delta.x, y: point.y + delta.y })
        const node = next.nodesById.get(movedId)
        if (node) { next.nodesById.set(movedId, { ...node, x: node.x + delta.x, y: node.y + delta.y }); changedIds.add(movedId); changed = true; continue }
        const text = next.textsById.get(movedId)
        if (text) { next.textsById.set(movedId, { ...text, x: text.x + delta.x, y: text.y + delta.y }); changedIds.add(movedId); changed = true; continue }
        const shape = next.shapesById.get(movedId)
        if (shape) { next.shapesById.set(movedId, { ...shape, x: shape.x + delta.x, y: shape.y + delta.y }); changedIds.add(movedId); changed = true; continue }
        const table = next.tablesById.get(movedId)
        if (table) { next.tablesById.set(movedId, { ...table, x: table.x + delta.x, y: table.y + delta.y }); changedIds.add(movedId); changed = true; continue }
        const movedEdge = next.edgesById.get(movedId)
        if (movedEdge) {
          next.edgesById.set(movedId, {
            ...movedEdge,
            source: movedEdge.source.kind === "point" ? { kind: "point", point: translate(movedEdge.source.point) } : movedEdge.source,
            target: movedEdge.target.kind === "point" ? { kind: "point", point: translate(movedEdge.target.point) } : movedEdge.target,
            points: movedEdge.points?.map(translate),
            ...(movedEdge.routing?.mode === "auto" && movedEdge.routing.waypoints ? { routing: { ...movedEdge.routing, waypoints: movedEdge.routing.waypoints.map(translate) } } : {}),
          })
          changedIds.add(movedId); changed = true
        }
      }
    } else if (this.tool === "resize-selection" && this.resizePreviewEntries.length) {
      for (const entry of this.resizePreviewEntries) {
        const node = next.nodesById.get(entry.id)
        if (node) { next.nodesById.set(entry.id, { ...node, x: entry.x ?? node.x, y: entry.y ?? node.y, width: entry.width ?? node.width, height: entry.height ?? node.height }); changedIds.add(entry.id); changed = true; continue }
        const shape = next.shapesById.get(entry.id)
        if (shape) { next.shapesById.set(entry.id, { ...shape, x: entry.x ?? shape.x, y: entry.y ?? shape.y, width: entry.width ?? shape.width, height: entry.height ?? shape.height }); changedIds.add(entry.id); changed = true; continue }
        const text = next.textsById.get(entry.id)
        if (text) { next.textsById.set(entry.id, { ...text, x: entry.x ?? text.x, y: entry.y ?? text.y, width: entry.width ?? text.width, height: entry.height ?? text.height }); changedIds.add(entry.id); changed = true }
      }
    }
    if (!changed) return null
    const sourceHost = edge.source.kind === "node" ? edge.source.nodeId : edge.source.kind === "port" ? diagramPortHostId(entities.portsById.get(edge.source.portId)!) : null
    const targetHost = edge.target.kind === "node" ? edge.target.nodeId : edge.target.kind === "port" ? diagramPortHostId(entities.portsById.get(edge.target.portId)!) : null
    const endpointHostMoved = Boolean(sourceHost && changedIds.has(sourceHost) || targetHost && changedIds.has(targetHost))
    const routeBounds = inflateRect(geometry.bounds, edge.routing?.clearance ?? 0)
    const relevant = changedIds.has(id) || endpointHostMoved || [...changedIds].some((changedId) => {
      const before = this.engine.getGeometrySnapshot(changedId)
      const after = createEntityGeometry(changedId, next)
      return Boolean(before && rectIntersects(routeBounds, before.bounds) || after && rectIntersects(routeBounds, after.bounds))
    })
    if (!relevant) return null
    return createEntityGeometry(id, next)
  }

  private updateEdgeCreationPreview(): void {
    if (!this.edgeCreationId || !this.edgeCreationSource || !this.startPoint || !this.latestPoint) return
    const target = this.snapEndpoint(this.latestPoint, this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.startPoint, true, "target")
    const entities = this.engine.getScene().entities
    const sourcePoint = this.endpointPoint(this.edgeCreationSource) ?? resolveEndpoint(this.edgeCreationSource, entities)
    const targetPoint = this.endpointPoint(target) ?? resolveEndpoint(target, entities)
    const excluded = new Set<DiagramId>()
    for (const endpoint of [this.edgeCreationSource, target]) {
      if (endpoint.kind === "node") excluded.add(endpoint.nodeId)
      else if (endpoint.kind === "port") {
        const port = entities.portsById.get(endpoint.portId)
        if (port) excluded.add(diagramPortHostId(port))
      }
    }
    const routeBounds = boundsFromPoints([sourcePoint, targetPoint, ...(this.edgeRouteOptions.waypoints ?? []), ...this.edgeCreationWaypoints])
    const routeMargin = Math.max(routeBounds.width, routeBounds.height, this.edgeRouteOptions.terminalLead ?? 12, this.edgeRouteOptions.clearance ?? 0, 1) * 2
    const searchBounds = inflateRect(routeBounds, routeMargin)
    const obstacleIds = this.engine.queryEntities({ bounds: searchBounds, kinds: ["node", "shape", "text", "table"] })
    const obstacles = obstacleIds.filter((id) => !excluded.has(id)).flatMap((id) => {
      const geometry = createEntityGeometry(id, entities)
      return geometry ? [{ id, bounds: geometry.bounds }] : []
    })
    const existingRoutes = this.engine.queryEntities({ bounds: searchBounds, kinds: ["edge"] })
      .flatMap((id) => { const edge = entities.edgesById.get(id); return edge && edge.routing?.mode !== "auto" ? [{ id, points: resolveEdgePath(edge, entities) }] : [] })
    const route = routeOrthogonalConnector(sourcePoint, targetPoint, { ...this.edgeRouteOptions, ...(this.isStrictGridEnabled() ? { strictGrid: true, gridSize: this.strictGridSize() } : {}), waypoints: [...(this.edgeRouteOptions.waypoints ?? []), ...this.edgeCreationWaypoints], obstacles, existingRoutes })
    const path = route.diagnostics.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap") ? route.path : simplifyOrthogonalEditPath(route.path)
    this.edgeCreationPreview = Object.freeze({
      id: this.edgeCreationId,
      source: this.edgeCreationSource,
      target,
      points: Object.freeze(path.slice(1, -1).map((point) => Object.freeze(point))),
      path: Object.freeze(path.map((point) => Object.freeze(point))),
      diagnostics: route.diagnostics,
      prospectiveJunctions: Object.freeze([...this.edgeCreationJunctions.values()].map((junction) => ({
        id: junction.id,
        hostEdgeId: junction.hostEdgeId,
        point: this.endpointPoint({ kind: "junction", junctionId: junction.id }) ?? sourcePoint,
        appearance: "filled-dot" as const,
        radius: 3,
      }))),
    })
  }

  private commitEdgeCreation(preview: DiagramEdgeCreationPreview): number {
    const strictGrid = this.isStrictGridEnabled()
    const routing = this.edgeRouteOptions.mode === "auto"
      ? { mode: "auto" as const, strictGrid, ...(strictGrid ? { gridSize: this.strictGridSize() } : {}), terminalLead: this.edgeRouteOptions.terminalLead, clearance: this.edgeRouteOptions.clearance, firstAxis: this.edgeRouteOptions.firstAxis, sourceDirection: this.edgeRouteOptions.sourceDirection, targetDirection: this.edgeRouteOptions.targetDirection, maxBends: this.edgeRouteOptions.maxBends, maxRouteBends: this.edgeRouteOptions.maxRouteBends, tieBreak: this.edgeRouteOptions.tieBreak, waypoints: [...(this.edgeRouteOptions.waypoints ?? []), ...this.edgeCreationWaypoints] }
      : undefined
    const commands: DiagramCommand[] = [...this.edgeCreationJunctions.values()].map((junction) => ({ type: "createJunction", junction }))
    commands.push({ type: "createEdge", edge: { id: preview.id, kind: "edge", source: preview.source, target: preview.target, points: preview.points, ...(routing ? { routing } : {}) } })
    return this.engine.dispatchBatch(commands).changed ? 1 : 0
  }

  private pendingJunctionId(ownerId: DiagramId, role: "source" | "target"): DiagramId {
    const cached = this.edgeCreationJunctionIds.get(role)
    if (cached) return cached
    const base = `${ownerId}:junction:${role}`
    const exists = (id: DiagramId) => this.engine.getScene().entities.junctionsById.has(id)
      || this.engine.getScene().entities.edgesById.has(id)
      || this.engine.getScene().entities.nodesById.has(id)
      || this.engine.getScene().entities.portsById.has(id)
      || this.engine.getScene().entities.shapesById.has(id)
      || this.engine.getScene().entities.textsById.has(id)
      || this.engine.getScene().entities.tablesById.has(id)
      || this.engine.getScene().entities.groupsById.has(id)
    if (!exists(base)) { this.edgeCreationJunctionIds.set(role, base); return base }
    let index = 2
    while (exists(`${base}-${index}`) || this.edgeCreationJunctions.has(`${base}-${index}`)) index += 1
    const id = `${base}-${index}`
    this.edgeCreationJunctionIds.set(role, id)
    return id
  }

  private prospectiveJunction(id: DiagramId): DiagramJunctionRenderGeometry | null {
    const junction = this.edgeCreationJunctions.get(id)
    const path = junction ? this.engine.getGeometrySnapshot(junction.hostEdgeId)?.path : undefined
    if (!junction || !path) return null
    return { id, hostEdgeId: junction.hostEdgeId, point: pointAtRouteFraction(path, junction.anchor.fraction), appearance: "filled-dot", radius: 3 }
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
    const nextBounds = resizeBoundsByHandle(this.resizeStartBounds, this.resizeHandle, delta, this.minimumResizeSize(this.resizeSelectionIds, this.resizeStartBounds), this.latestShiftKey && isCornerResizeHandle(this.resizeHandle), this.resizeGridSize(), this.isStrictGridEnabled(), this.latestAltKey)
    const scaleX = this.resizeStartBounds.width ? nextBounds.width / this.resizeStartBounds.width : 1
    const scaleY = this.resizeStartBounds.height ? nextBounds.height / this.resizeStartBounds.height : 1
    const entries: DiagramResizeEntry[] = []
    for (const id of this.resizeSelectionIds) {
      const geometry = this.engine.getGeometrySnapshot(id)
      const bounds = geometry?.unrotatedBounds ?? geometry?.bounds
      if (!bounds) continue
      entries.push(this.snapResizeEntry({
        id,
        x: nextBounds.x + (bounds.x - this.resizeStartBounds.x) * scaleX,
        y: nextBounds.y + (bounds.y - this.resizeStartBounds.y) * scaleY,
        width: Math.max(8, bounds.width * scaleX),
        height: Math.max(8, bounds.height * scaleY),
      }, this.latestAltKey))
    }
    return Object.freeze(entries)
  }

  private createResizePreview(delta: DiagramPoint): DiagramResizeEntry | null {
    if (!this.resizeOwnerId || !this.resizeHandle || !this.resizeStartBounds) return null
    const bounds = this.resizeStartBounds
    const geometry = this.engine.getGeometrySnapshot(this.resizeOwnerId)
    let localDelta = rotateDelta(delta, -this.resizeStartRotation)
    if (geometry?.flipX) localDelta = { ...localDelta, x: -localDelta.x }
    if (geometry?.flipY) localDelta = { ...localDelta, y: -localDelta.y }
    const minSize = this.minimumResizeSize([this.resizeOwnerId], bounds)
    const nextBounds = resizeBoundsByHandle(bounds, this.resizeHandle, localDelta, minSize, this.latestShiftKey && isCornerResizeHandle(this.resizeHandle), this.resizeGridSize(), this.isStrictGridEnabled(), this.latestAltKey)
    const { x, y, width, height } = nextBounds

    const entry: { id: DiagramId; x?: number; y?: number; width?: number; height?: number } = { id: this.resizeOwnerId, width, height }
    if (this.resizeStartRotation || geometry?.flipX || geometry?.flipY) {
      const anchored = anchorRotatedResize(bounds, this.resizeHandle, width, height, this.resizeStartRotation, geometry?.flipX, geometry?.flipY, this.latestAltKey)
      entry.x = anchored.x
      entry.y = anchored.y
    } else {
      if (x !== bounds.x) entry.x = x
      if (y !== bounds.y) entry.y = y
    }
    return this.snapResizeEntry(entry, this.latestAltKey)
  }

  private resizeGridSize(): number | undefined {
    return this.snapOptions.enabled === false ? undefined : this.snapOptions.gridSize
  }

  private strictGridSize(): number | undefined {
    const size = this.snapOptions.gridSize
    return this.snapOptions.enabled !== false && this.snapOptions.strictGrid === true && Number.isFinite(size) && size! > 0 ? size : undefined
  }

  private isStrictGridEnabled(): boolean {
    return this.strictGridSize() !== undefined
  }

  private applyStrictGrid(point: DiagramPoint, fallback?: DiagramSnapResult): DiagramPoint {
    const size = this.strictGridSize()
    if (!size) return point
    const snapped = { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size }
    if (snapped.x !== point.x || snapped.y !== point.y) {
      this.snapResult = { point: snapped, snapped: true, source: "grid", ...(fallback?.candidates ? { candidates: fallback.candidates } : {}) }
    }
    return snapped
  }

  private isStrictGridPoint(point: DiagramPoint): boolean {
    const size = this.strictGridSize()
    return !size || (Math.abs(point.x / size - Math.round(point.x / size)) < 1e-9 && Math.abs(point.y / size - Math.round(point.y / size)) < 1e-9)
  }

  private snapResizeEntry<T extends DiagramResizeEntry>(entry: T, preserveCenter = false): T {
    const size = this.strictGridSize()
    if (!size) return entry
    const minimum = Math.max(size, Math.ceil(8 / size) * size)
    return {
      ...entry,
      ...(!preserveCenter && entry.x !== undefined ? { x: Math.round(entry.x / size) * size } : {}),
      ...(!preserveCenter && entry.y !== undefined ? { y: Math.round(entry.y / size) * size } : {}),
      ...(entry.width === undefined ? {} : { width: Math.max(minimum, Math.round(entry.width / size) * size) }),
      ...(entry.height === undefined ? {} : { height: Math.max(minimum, Math.round(entry.height / size) * size) }),
    }
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
    if (this.tool === "drag-edge-endpoint" || this.tool === "connect-edge" || this.tool === "draw-line" || this.tool === "draw-path" || this.tool === "draw-bezier") {
      const angleOrigin = this.edgeEndpointOppositeStart ?? (this.tool === "draw-bezier"
        ? this.bezierPendingAnchor ?? this.bezierAnchors[this.bezierAnchors.length - 1]?.point ?? this.startPoint
        : this.tool === "draw-path"
        ? this.pathVertices[this.pathVertices.length - 1] ?? this.startPoint
        : this.tool === "connect-edge"
          ? this.edgeCreationWaypoints[this.edgeCreationWaypoints.length - 1] ?? this.endpointPoint(this.edgeCreationSource!) ?? this.startPoint
          : this.tool === "draw-line" ? this.startPoint : null)
      if (this.edgeEndpointCardinalAngle === null && angleOrigin && this.isPastAxisActivation(point, angleOrigin)) {
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

  private configuredAngle(point: DiagramPoint, origin: DiagramPoint, includeOrtho = false): number | null {
    const increment = includeOrtho && this.snapOptions.ortho ? 90 : this.snapOptions.angleIncrement
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

  private repairOrthogonalWaypointPreview(id: DiagramId, waypointIndex: number, point: DiagramPoint): ReadonlyArray<DiagramPoint> {
    const edge = this.engine.getScene().entities.edgesById.get(id)
    const path = this.engine.getGeometrySnapshot(id)?.path
    if (edge?.routing?.mode === "auto") {
      const constraints = [...(edge.routing.waypoints ?? [])]
      if (waypointIndex < 0 || waypointIndex >= constraints.length) return constraints
      constraints[waypointIndex] = point
      return constraints
    }
    if (!edge || !path || waypointIndex < 0 || waypointIndex >= path.length - 2) return edge?.points ?? []
    const index = waypointIndex + 1
    const previous = path[index - 1]!, next = path[index + 1]!
    const repaired = [...path.slice(0, index), { x: point.x, y: previous.y }, { x: point.x, y: point.y }, { x: next.x, y: point.y }, ...path.slice(index + 1)]
    const canonical: DiagramPoint[] = []
    for (const candidate of repaired) {
      if (canonical.length && samePoint(canonical[canonical.length - 1]!, candidate)) continue
      while (canonical.length >= 2) {
        const a = canonical[canonical.length - 2]!, b = canonical[canonical.length - 1]!
        const collinear = (a.x === b.x && b.x === candidate.x) || (a.y === b.y && b.y === candidate.y)
        const forward = (b.x - a.x) * (candidate.x - b.x) + (b.y - a.y) * (candidate.y - b.y) >= 0
        if (!collinear || !forward) break
        canonical.pop()
      }
      canonical.push(candidate)
    }
    return canonical.slice(1, -1)
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

  private getBezierCreationPreview(): DiagramBezierCreationPreview | null {
    const id = this.bezierCreationId
    if (!id || !this.bezierAnchors.length) return null
    const anchors = [...this.bezierAnchors]
    let activeAnchor: DiagramBezierAnchor | null = null
    const current = this.bezierClosePending && this.bezierAnchors.length ? this.bezierAnchors[0]!.point
      : this.bezierPendingAnchor ?? (this.latestPoint ? this.resolveBezierPoint(this.latestPoint) : null)
    if (this.activePointer && this.bezierPendingAnchor && !this.bezierClosePending) {
      const point = this.bezierPendingAnchor
      const outgoing = this.bezierPendingHandle ?? point
      const delta = { x: outgoing.x - point.x, y: outgoing.y - point.y }
      activeAnchor = { point, incoming: { x: point.x - delta.x, y: point.y - delta.y }, outgoing }
    }
    const segments: DiagramPathSegment[] = []
    for (let index = 0; index < anchors.length - 1; index += 1) segments.push(bezierSegment(anchors[index]!, anchors[index + 1]!))
    if (activeAnchor && !samePoint(anchors[anchors.length - 1]!.point, activeAnchor.point)) segments.push(bezierSegment(anchors[anchors.length - 1]!, activeAnchor))
    else if (!activeAnchor && !this.bezierClosePending && current && !samePoint(anchors[anchors.length - 1]!.point, current)) segments.push(bezierSegment(anchors[anchors.length - 1]!, bezierAnchor(current)))
    if (this.bezierClosePending && !samePoint(anchors[anchors.length - 1]!.point, anchors[0]!.point)) segments.push(bezierSegment(anchors[anchors.length - 1]!, anchors[0]!))
    const closeTarget = this.bezierClosePending ? anchors[0]!.point : null
    return { id, contour: { segments: Object.freeze(segments), closed: this.bezierClosed || this.bezierClosePending }, anchors: Object.freeze(anchors), activeAnchor, closed: this.bezierClosed, closing: this.bezierClosePending, closeTarget }
  }

  private updateBezierHandlePreview(point: DiagramPoint): void {
    const start = this.bezierHandleStart
    if (!start) return
    const shape = this.engine.getScene().entities.shapesById.get(start.id)
    if (!shape) return
    const contour = start.contours[start.contourIndex]
    const segment = contour?.segments[start.segmentIndex]
    if (!contour || !segment || segment.kind !== "cubic") return
    const anchorPoint = shapePathPointToWorld(shape, start.handle === "outgoing" || (start.handle === "anchor" && start.anchorSide === "start") ? segment.start : segment.end)
    let nextWorld = start.handle === "anchor" ? this.snapBezierAnchor(point, start.id) : point
    if (this.latestShiftKey && start.handle !== "anchor") nextWorld = constrainTangent(anchorPoint, nextWorld)
    const nextLocalGlobal = worldToShapePathPoint(shape, nextWorld)
    const next = { x: nextLocalGlobal.x - shape.x, y: nextLocalGlobal.y - shape.y }
    const segments = contour.segments.map((entry) => ({ ...entry })) as DiagramPathSegment[]
    const selected = segments[start.segmentIndex]
    if (!selected || selected.kind !== "cubic") return
    if (start.handle === "incoming") segments[start.segmentIndex] = { ...selected, control2: next }
    else if (start.handle === "outgoing") segments[start.segmentIndex] = { ...selected, control1: next }
    else if (start.anchorSide === "start") {
      const old = selected.start
      const delta = { x: next.x - old.x, y: next.y - old.y }
      segments[start.segmentIndex] = { ...selected, start: next, control1: { x: selected.control1.x + delta.x, y: selected.control1.y + delta.y } }
      if (start.segmentIndex > 0) {
        const previous = segments[start.segmentIndex - 1]!
        if (previous.kind === "cubic") segments[start.segmentIndex - 1] = { ...previous, end: next, control2: { x: previous.control2.x + delta.x, y: previous.control2.y + delta.y } }
      }
    } else {
      const old = selected.end
      const delta = { x: next.x - old.x, y: next.y - old.y }
      segments[start.segmentIndex] = { ...selected, end: next, control2: { x: selected.control2.x + delta.x, y: selected.control2.y + delta.y } }
      if (start.segmentIndex + 1 < segments.length) {
        const following = segments[start.segmentIndex + 1]!
        if (following.kind === "cubic") segments[start.segmentIndex + 1] = { ...following, start: next, control1: { x: following.control1.x + delta.x, y: following.control1.y + delta.y } }
      }
    }
    const updated = [...start.contours]
    updated[start.contourIndex] = { ...contour, segments }
    const inputContours = updated.map((item) => translatePathContour(item, shape.x, shape.y))
    const allPoints = inputContours.flatMap(pathContourBoundsPoints)
    const minX = Math.min(...allPoints.map((value) => value.x)), minY = Math.min(...allPoints.map((value) => value.y))
    const maxX = Math.max(...allPoints.map((value) => value.x)), maxY = Math.max(...allPoints.map((value) => value.y))
    const previewShape = { ...shape, x: minX, y: minY, width: maxX - minX, height: maxY - minY, pathContours: inputContours.map((item) => translatePathContour(item, -minX, -minY)) }
    const previewContours = previewShape.pathContours!.map((item) => transformPathContour(translatePathContour(item, previewShape.x, previewShape.y), { x: previewShape.x + previewShape.width / 2, y: previewShape.y + previewShape.height / 2 }, previewShape.rotation ?? 0, previewShape.flipX, previewShape.flipY))
    this.bezierHandleCommitContours = Object.freeze(inputContours)
    this.bezierHandlePreview = { ...start, point: nextWorld, contours: Object.freeze(previewContours) }
  }

  private clearGesture(): void {
    this.gestureGeneration += 1
    this.activePointer = null
    this.startPoint = null
    this.latestPoint = null
    this.latestShiftKey = false
    this.latestAltKey = false
    this.shiftAxis = null
    this.previewDelta = null
    this.dragActivated = false
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
    this.pathCreationOptions = {}
    this.pathClosePending = false
    this.bezierCreationId = null
    this.bezierAnchors = []
    this.bezierPendingAnchor = null
    this.bezierPendingHandle = null
    this.bezierClosed = false
    this.bezierCreationOptions = {}
    this.bezierClosePending = false
    this.bezierHandlePreview = null
    this.bezierHandleCommitContours = null
    this.bezierHandleStart = null
    this.clickToPlaceLine = false
    this.pathVertexPreview = null
    this.portCreationId = null
    this.portCreationOptions = {}
    this.portCreationPreview = null
    this.vertexDragKind = null
    this.vertexDragStart = null
    this.vertexConstraintOrigin = null
    this.vertexCardinalAngle = null
    this.edgeRouteOptions = {}
    this.edgeClickPlacement = false
    this.edgeCreationWaypoints = []
    this.edgeCreationJunctions.clear()
    this.edgeCreationJunctionIds.clear()
    this.edgeEndpointId = null
    this.edgeEndpointKind = null
    this.edgeEndpointStart = null
    this.edgeEndpointOppositeStart = null
    this.edgeEndpointCardinalAngle = null
    this.edgeEndpointPreview = null
    this.edgeEndpointConnection = null
    this.edgeWaypointPreview = null
    this.edgeSegmentDrag = null
    this.edgeSegmentPreview = null
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
  const corners = geometry.rotation || geometry.flipX || geometry.flipY ? [
    { x: unrotatedBounds.x, y: unrotatedBounds.y },
    { x: unrotatedBounds.x + unrotatedBounds.width, y: unrotatedBounds.y },
    { x: unrotatedBounds.x + unrotatedBounds.width, y: unrotatedBounds.y + unrotatedBounds.height },
    { x: unrotatedBounds.x, y: unrotatedBounds.y + unrotatedBounds.height },
  ].map((point) => {
    const flipped = {
      x: unrotatedBounds.x + (geometry.flipX ? unrotatedBounds.width - (point.x - unrotatedBounds.x) : point.x - unrotatedBounds.x),
      y: unrotatedBounds.y + (geometry.flipY ? unrotatedBounds.height - (point.y - unrotatedBounds.y) : point.y - unrotatedBounds.y),
    }
    return rotatePoint(flipped, rectCenter(unrotatedBounds), geometry.rotation ?? 0)
  }) : undefined
  const bounds = corners ? boundsFromPoints(corners) : unrotatedBounds
  return Object.freeze({ ...geometry, bounds, unrotatedBounds, corners, hitBounds: inflateRect(bounds, geometry.kind === "node" ? 4 : 3) })
}

function resizeShapePathPreview(shape: DiagramShape, entry: DiagramResizeEntry, gridSize?: number): DiagramShape {
  const width = entry.width ?? shape.width, height = entry.height ?? shape.height
  const resized: DiagramShape = { ...shape, x: entry.x ?? shape.x, y: entry.y ?? shape.y, width, height,
    ...(shape.points ? { points: shape.points.map((point) => ({ x: point.x * width / (shape.width || 1), y: point.y * height / (shape.height || 1) })) } : {}),
    ...(shape.pathContours ? { pathContours: shape.pathContours.map((contour) => ({ ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
      ? { ...segment, start: { x: segment.start.x * width / (shape.width || 1), y: segment.start.y * height / (shape.height || 1) }, end: { x: segment.end.x * width / (shape.width || 1), y: segment.end.y * height / (shape.height || 1) } }
      : segment.kind === "cubic"
        ? { ...segment, start: { x: segment.start.x * width / (shape.width || 1), y: segment.start.y * height / (shape.height || 1) }, control1: { x: segment.control1.x * width / (shape.width || 1), y: segment.control1.y * height / (shape.height || 1) }, control2: { x: segment.control2.x * width / (shape.width || 1), y: segment.control2.y * height / (shape.height || 1) }, end: { x: segment.end.x * width / (shape.width || 1), y: segment.end.y * height / (shape.height || 1) } }
        : { ...segment, center: { x: segment.center.x * width / (shape.width || 1), y: segment.center.y * height / (shape.height || 1) }, radius: segment.radius * width / (shape.width || 1) }) })) } : {}) }
  if (!gridSize || gridSize <= 0) return resized
  const snap = (point: DiagramPoint) => ({ x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize })
  const center = { x: resized.x + width / 2, y: resized.y + height / 2 }
  const toWorld = (point: DiagramPoint) => rotatePoint({ x: resized.x + (resized.flipX ? width - point.x : point.x), y: resized.y + (resized.flipY ? height - point.y : point.y) }, center, resized.rotation ?? 0)
  const toLocal = (point: DiagramPoint) => {
    const unrotated = rotatePoint(point, center, -(resized.rotation ?? 0))
    return { x: resized.flipX ? width - (unrotated.x - resized.x) : unrotated.x - resized.x, y: resized.flipY ? height - (unrotated.y - resized.y) : unrotated.y - resized.y }
  }
  const map = (point: DiagramPoint) => toLocal(snap(toWorld(point)))
  return { ...resized, ...(resized.points ? { points: resized.points.map(map) } : {}), ...(resized.pathContours ? { pathContours: resized.pathContours.map((contour) => ({ ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
    ? { ...segment, start: map(segment.start), end: map(segment.end) }
    : segment.kind === "cubic"
      ? { ...segment, start: map(segment.start), control1: map(segment.control1), control2: map(segment.control2), end: map(segment.end) }
      : { ...segment, center: map(segment.center) }) })) } : {}) }
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

function nearestPointOnPolyline(point: DiagramPoint, path: ReadonlyArray<DiagramPoint>): Readonly<{ point: DiagramPoint; distance: number }> | null {
  let best: { point: DiagramPoint; distance: number; segment: number } | null = null
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index]!
    const end = path[index + 1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) continue
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    const projected = { x: start.x + dx * t, y: start.y + dy * t }
    const candidate = { point: projected, distance: Math.hypot(projected.x - point.x, projected.y - point.y), segment: index }
    if (!best || candidate.distance < best.distance || (candidate.distance === best.distance && candidate.segment < best.segment)) best = candidate
  }
  return best
}

function localAnchorAtWorldPoint(point: DiagramPoint, geometry: DiagramGeometry, bounds: DiagramRect): DiagramPortAnchor {
  const unrotated = geometry.rotation ? rotatePoint(point, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, -geometry.rotation) : point
  const localX = geometry.flipX ? bounds.width - (unrotated.x - bounds.x) : unrotated.x - bounds.x
  const localY = geometry.flipY ? bounds.height - (unrotated.y - bounds.y) : unrotated.y - bounds.y
  return { kind: "local", x: Math.max(0, Math.min(bounds.width, localX)), y: Math.max(0, Math.min(bounds.height, localY)) }
}

function worldPointAtLocalAnchor(anchor: DiagramPortAnchor, geometry: DiagramGeometry, bounds: DiagramRect): DiagramPoint {
  if (anchor.kind !== "local") return { x: bounds.x, y: bounds.y }
  const local = {
    x: bounds.x + (geometry.flipX ? bounds.width - anchor.x : anchor.x),
    y: bounds.y + (geometry.flipY ? bounds.height - anchor.y : anchor.y),
  }
  return geometry.rotation ? rotatePoint(local, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, geometry.rotation) : local
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

function pointOnOrthogonalSegment(point: DiagramPoint, start: DiagramPoint, end: DiagramPoint, axis: "horizontal" | "vertical"): boolean {
  return axis === "horizontal"
    ? point.y === start.y && point.y === end.y && point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x)
    : point.x === start.x && point.x === end.x && point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y)
}

function orthogonalConnectorElbow(from: DiagramPoint, to: DiagramPoint, axis: "horizontal" | "vertical", fromEndpoint: boolean): DiagramPoint {
  if (axis === "horizontal") return fromEndpoint ? { x: from.x, y: to.y } : { x: to.x, y: from.y }
  return fromEndpoint ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
}

function simplifyOrthogonalEditPath(points: ReadonlyArray<DiagramPoint>): DiagramPoint[] {
  const result: DiagramPoint[] = []
  for (const point of points) {
    if (result.length && samePoint(result[result.length - 1]!, point)) continue
    while (result.length >= 2) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!
      if (!((a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y))) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

function samePoint(a: DiagramPoint, b: DiagramPoint): boolean {
  return a.x === b.x && a.y === b.y
}

function finitePoint(point: DiagramPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function distance(a: DiagramPoint, b: DiagramPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function bezierAnchor(point: DiagramPoint): DiagramBezierAnchor {
  return { point, incoming: point, outgoing: point }
}

function cubicSegment(start: DiagramBezierAnchor, end: DiagramBezierAnchor): DiagramPathSegment {
  return { kind: "cubic", start: start.point, control1: start.outgoing, control2: end.incoming, end: end.point }
}

function bezierSegment(start: DiagramBezierAnchor, end: DiagramBezierAnchor): DiagramPathSegment {
  return samePoint(start.point, start.outgoing) && samePoint(end.point, end.incoming)
    ? { kind: "line", start: start.point, end: end.point }
    : cubicSegment(start, end)
}

function constrainTangent(anchor: DiagramPoint, point: DiagramPoint): DiagramPoint {
  const dx = point.x - anchor.x, dy = point.y - anchor.y
  return Math.abs(dx) >= Math.abs(dy) ? { x: point.x, y: anchor.y } : { x: anchor.x, y: point.y }
}

function shapePathPointToWorld(shape: DiagramShape, point: DiagramPoint): DiagramPoint {
  const translated = { x: point.x + shape.x, y: point.y + shape.y }
  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  const reflected = { x: shape.flipX ? 2 * center.x - translated.x : translated.x, y: shape.flipY ? 2 * center.y - translated.y : translated.y }
  return rotateAround(reflected, center, shape.rotation ?? 0)
}

function worldToShapePathPoint(shape: DiagramShape, point: DiagramPoint): DiagramPoint {
  const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  const rotated = rotateAround(point, center, -(shape.rotation ?? 0))
  const reflected = { x: shape.flipX ? 2 * center.x - rotated.x : rotated.x, y: shape.flipY ? 2 * center.y - rotated.y : rotated.y }
  return reflected
}

function rotateAround(point: DiagramPoint, center: DiagramPoint, degrees: number): DiagramPoint {
  const radians = degrees * Math.PI / 180, dx = point.x - center.x, dy = point.y - center.y
  return { x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians), y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians) }
}

function inverseTransformContour(contour: DiagramPathContour, shape: DiagramShape): DiagramPathContour {
  const map = (point: DiagramPoint) => {
    return worldToShapePathPoint(shape, point)
  }
  return { ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
    ? { ...segment, start: map(segment.start), end: map(segment.end) }
    : segment.kind === "cubic"
      ? { ...segment, start: map(segment.start), control1: map(segment.control1), control2: map(segment.control2), end: map(segment.end) }
      : (() => {
        const startWorld = { x: segment.center.x + Math.cos(segment.startAngle) * segment.radius, y: segment.center.y + Math.sin(segment.startAngle) * segment.radius }
        const center = map(segment.center), start = map(startWorld)
        return { ...segment, center, startAngle: Math.atan2(start.y - center.y, start.x - center.x), sweepAngle: shape.flipX !== shape.flipY ? -segment.sweepAngle : segment.sweepAngle }
      })()) }
}

function samePoints(a: ReadonlyArray<DiagramPoint>, b: ReadonlyArray<DiagramPoint>): boolean {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]!))
}

function sameEndpoint(a: DiagramEdgeEndpoint, b: DiagramEdgeEndpoint): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "point" && b.kind === "point") return samePoint(a.point, b.point)
  if (a.kind === "node" && b.kind === "node") return a.nodeId === b.nodeId
  return a.kind === "port" && b.kind === "port" && a.portId === b.portId
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

function resizeBoundsByHandle(bounds: DiagramRect, handle: DiagramResizeHandle, delta: DiagramPoint, minSize: number, preserveAspectRatio = false, gridSize?: number, strictGrid = false, centerBased = false): DiagramRect {
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
  if (centerBased) {
    x = bounds.x + (bounds.width - width) / 2
    y = bounds.y + (bounds.height - height) / 2
  }
  if (strictGrid && gridSize && gridSize > 0 && !centerBased) {
    let left = Math.round(x / gridSize) * gridSize
    let top = Math.round(y / gridSize) * gridSize
    let right = Math.round((x + width) / gridSize) * gridSize
    let bottom = Math.round((y + height) / gridSize) * gridSize
    const minimum = Math.max(gridSize, Math.ceil(minSize / gridSize) * gridSize)
    if (right - left < minimum) {
      if (handle.includes("w")) left = right - minimum
      else right = left + minimum
    }
    if (bottom - top < minimum) {
      if (handle.includes("n")) top = bottom - minimum
      else bottom = top + minimum
    }
    return { x: left, y: top, width: right - left, height: bottom - top }
  }
  return { x, y, width, height }
}

function isCornerResizeHandle(handle: DiagramResizeHandle): boolean {
  return handle.length === 2
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

function anchorRotatedResize(bounds: DiagramRect, handle: DiagramResizeHandle, width: number, height: number, rotation: number, flipX = false, flipY = false, centerBased = false): DiagramPoint {
  const oldAnchor = centerBased
    ? rotatePoint(rectCenter(bounds), rectCenter(bounds), rotation)
    : transformResizeAnchor(anchorPointForHandle(bounds, handle), bounds, rotation, flipX, flipY)
  if (centerBased) return { x: oldAnchor.x - width / 2, y: oldAnchor.y - height / 2 }
  const newAnchorOffset = oppositeAnchorOffset(handle, width, height)
  const newCenterOffset = { x: width / 2, y: height / 2 }
  const flippedAnchorOffset = { x: flipX ? width - newAnchorOffset.x : newAnchorOffset.x, y: flipY ? height - newAnchorOffset.y : newAnchorOffset.y }
  const rotatedAnchorOffset = rotateDelta({ x: flippedAnchorOffset.x - newCenterOffset.x, y: flippedAnchorOffset.y - newCenterOffset.y }, rotation)
  return {
    x: oldAnchor.x - newCenterOffset.x - rotatedAnchorOffset.x,
    y: oldAnchor.y - newCenterOffset.y - rotatedAnchorOffset.y,
  }
}

function anchorPointForHandle(bounds: DiagramRect, handle: DiagramResizeHandle): DiagramPoint {
  const offset = oppositeAnchorOffset(handle, bounds.width, bounds.height)
  return { x: bounds.x + offset.x, y: bounds.y + offset.y }
}

function oppositeAnchorOffset(handle: DiagramResizeHandle, width: number, height: number): DiagramPoint {
  switch (handle) {
    case "n": return { x: width / 2, y: height }
    case "e": return { x: 0, y: height / 2 }
    case "s": return { x: width / 2, y: 0 }
    case "w": return { x: width, y: height / 2 }
    case "nw": return { x: width, y: height }
    case "ne": return { x: 0, y: height }
    case "se": return { x: 0, y: 0 }
    case "sw": return { x: width, y: 0 }
  }
}

function transformResizeAnchor(point: DiagramPoint, bounds: DiagramRect, rotation: number, flipX: boolean, flipY: boolean): DiagramPoint {
  const flipped = {
    x: bounds.x + (flipX ? bounds.width - (point.x - bounds.x) : point.x - bounds.x),
    y: bounds.y + (flipY ? bounds.height - (point.y - bounds.y) : point.y - bounds.y),
  }
  return rotatePoint(flipped, rectCenter(bounds), rotation)
}

function isCreationTool(tool: DiagramInteractionTool): boolean {
  return tool === "draw-line" || tool === "draw-path" || tool === "draw-bezier" || tool === "connect-edge"
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
