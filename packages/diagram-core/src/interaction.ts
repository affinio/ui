import { createEntityGeometry, inflateRect, rectFromPoints as boundsFromPoints } from "./geometry.js"
import type { DiagramEngine } from "./DiagramEngine.js"
import type { DiagramId, DiagramGeometry, DiagramInteractionSnapOptions, DiagramInteractionSnapshot, DiagramInteractionTool, DiagramMarqueeMode, DiagramPointerEvent, DiagramPoint, DiagramRect, DiagramResizeEntry, DiagramResizeHandle, DiagramSnapGuide } from "./types.js"

type ScheduleFrame = (callback: () => void) => void

export type DiagramInteractionOptions = Readonly<{
  scheduleFrame?: ScheduleFrame
  marqueeMode?: DiagramMarqueeMode
  snap?: DiagramInteractionSnapOptions
}>

export class DiagramInteractionController {
  private tool: DiagramInteractionTool = "select"
  private activePointer: DiagramPointerEvent | null = null
  private startPoint: DiagramPoint | null = null
  private latestPoint: DiagramPoint | null = null
  private latestShiftKey = false
  private previewDelta: DiagramPoint | null = null
  private marquee: DiagramRect | null = null
  private resizeOwnerId: DiagramId | null = null
  private resizeSelectionIds: ReadonlyArray<DiagramId> = []
  private resizeHandle: DiagramResizeHandle | null = null
  private resizeStartBounds: DiagramRect | null = null
  private resizeStartRotation = 0
  private resizePreview: DiagramResizeEntry | null = null
  private resizePreviewEntries: ReadonlyArray<DiagramResizeEntry> = Object.freeze([])
  private edgeEndpointId: DiagramId | null = null
  private edgeEndpointKind: "source" | "target" | null = null
  private edgeEndpointStart: DiagramPoint | null = null
  private edgeEndpointPreview: DiagramPoint | null = null
  private dragSelectionIds: ReadonlyArray<DiagramId> = Object.freeze([])
  private snapGuides: ReadonlyArray<DiagramSnapGuide> = Object.freeze([])
  private framePending = false
  private pendingMoveCount = 0
  private commitCount = 0
  private gestureGeneration = 0
  private gestureHistoryId = 0
  private readonly scheduleFrame: ScheduleFrame
  private readonly marqueeMode: DiagramMarqueeMode
  private readonly snapOptions: DiagramInteractionSnapOptions

  constructor(private readonly engine: DiagramEngine, options: DiagramInteractionOptions = {}) {
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame
    this.marqueeMode = options.marqueeMode ?? "contain"
    this.snapOptions = options.snap ?? {}
  }

  setTool(tool: DiagramInteractionTool): void {
    this.cancel()
    this.tool = tool
  }

  pointerDown(event: DiagramPointerEvent): void {
    this.gestureGeneration += 1
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
    this.previewDelta = null
    this.marquee = null
    this.snapGuides = Object.freeze([])
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
    this.resizeOwnerId = ownerId
    this.resizeHandle = handle
    this.resizeStartBounds = geometry.unrotatedBounds ?? geometry.bounds
    this.resizeStartRotation = geometry.rotation ?? 0
    return true
  }

  beginEdgeEndpointHandle(ownerId: DiagramId, endpoint: "source" | "target", event: DiagramPointerEvent): boolean {
    const geometry = this.engine.getGeometrySnapshot(ownerId)
    if (!geometry || geometry.kind !== "edge" || !geometry.path?.length) return false
    const point = endpoint === "source" ? geometry.path[0]! : geometry.path[geometry.path.length - 1]!
    this.cancel()
    this.tool = "drag-edge-endpoint"
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.edgeEndpointId = ownerId
    this.edgeEndpointKind = endpoint
    this.edgeEndpointStart = point
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
    this.resizeSelectionIds = ids
    this.resizeHandle = handle
    this.resizeStartBounds = bounds
    this.resizeStartRotation = 0
    return true
  }

  pointerMove(event: DiagramPointerEvent): void {
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
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

  pointerUp(event: DiagramPointerEvent): void {
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    this.latestShiftKey = event.shiftKey === true
    this.flushPointerMove()
    if (this.tool === "drag-selection" && this.previewDelta) {
      const selection = this.engine.getScene().selection
      this.engine.dispatch({ type: "moveEntities", ids: this.dragSelectionIds, delta: this.previewDelta, historyKey: `drag:${selection.primaryId ?? "selection"}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "pan" && this.previewDelta) {
      const viewport = this.engine.getScene().viewport
      this.engine.dispatch({ type: "setViewport", viewport: { x: viewport.x - this.previewDelta.x, y: viewport.y - this.previewDelta.y }, historyKey: `pan:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "resize-selection" && this.resizePreviewEntries.length) {
      this.engine.dispatch({ type: "resizeEntities", entries: this.resizePreviewEntries, historyKey: `resize:${this.resizePreview?.id ?? "selection"}:${++this.gestureHistoryId}` })
      this.commitCount += 1
    }
    if (this.tool === "drag-edge-endpoint" && this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
      && (this.edgeEndpointPreview.x !== this.edgeEndpointStart?.x || this.edgeEndpointPreview.y !== this.edgeEndpointStart?.y)) {
      this.engine.dispatch({ type: "moveEdgeEndpoint", id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview })
      this.commitCount += 1
    }
    if (this.tool === "marquee" && this.marquee) {
      const ids = this.getMarqueeSelectionIds(this.marquee)
      this.engine.dispatch({ type: "setSelection", selection: { ids, primaryId: ids[0] ?? null }, mode: this.activePointer.shiftKey ? "add" : "replace" })
      this.commitCount += 1
    }
    this.clearGesture()
    if (this.tool === "drag-selection" || this.tool === "marquee" || this.tool === "resize-selection" || this.tool === "drag-edge-endpoint") {
      this.tool = "select"
    }
  }

  cancel(): void {
    this.clearGesture()
    this.tool = "select"
  }

  /** Returns the renderer-ready geometry for the active move preview. */
  getPreviewGeometry(id: DiagramId): DiagramGeometry | null {
    const geometry = this.engine.getGeometrySnapshot(id)
    if (geometry?.kind === "edge" && geometry.path?.length && this.edgeEndpointId === id && this.edgeEndpointKind && this.edgeEndpointPreview) {
      const path = geometry.path.map((point, index) => {
        const isEndpoint = this.edgeEndpointKind === "source" ? index === 0 : index === geometry.path!.length - 1
        return isEndpoint ? this.edgeEndpointPreview! : point
      })
      const bounds = boundsFromPoints(path)
      return Object.freeze({ ...geometry, path: Object.freeze(path), bounds, hitBounds: inflateRect(bounds, 6) })
    }
    if (!geometry || this.tool !== "drag-selection" || !this.previewDelta) return geometry
    const scene = this.engine.getScene()
    const edge = scene.entities.edgesById.get(id)
    if (geometry.kind === "edge" && edge) {
      const delta = this.previewDelta
      const moved = new Set(this.dragSelectionIds)
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
    if (!this.dragSelectionIds.includes(id)) return geometry
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
    return {
      tool: this.tool,
      active: this.activePointer !== null,
      previewDelta: this.previewDelta,
      resizePreview: this.resizePreview,
      resizePreviewEntries: this.resizePreviewEntries,
      edgeEndpointPreview: this.edgeEndpointId && this.edgeEndpointKind && this.edgeEndpointPreview
        ? { id: this.edgeEndpointId, endpoint: this.edgeEndpointKind, point: this.edgeEndpointPreview }
        : null,
      snapGuides: this.snapGuides,
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
    const delta = { x: this.latestPoint.x - this.startPoint.x, y: this.latestPoint.y - this.startPoint.y }
    if (this.tool === "drag-selection" || this.tool === "pan") {
      const axisConstraint = this.tool === "drag-selection" && this.latestShiftKey
        ? Math.abs(delta.x) >= Math.abs(delta.y) ? "x" : "y"
        : undefined
      const constrainedDelta = axisConstraint === "x"
        ? { x: delta.x, y: 0 }
        : axisConstraint === "y"
          ? { x: 0, y: delta.y }
          : delta
      if (this.tool === "drag-selection" && this.snapOptions.enabled !== false) {
        const viewport = this.engine.getScene().viewport
        const zoom = viewport.zoom > 0 ? viewport.zoom : 1
        const selection = this.engine.getScene().selection
        const snapped = this.engine.snapTranslation({ ...selection, ids: this.dragSelectionIds, primaryId: this.dragSelectionIds.includes(selection.primaryId ?? "") ? selection.primaryId : this.dragSelectionIds[0] ?? null }, constrainedDelta, {
          radius: (this.snapOptions.tolerancePx ?? 6) / zoom,
          gridSize: this.snapOptions.gridSize,
          axisConstraint,
          snapToPorts: this.snapOptions.snapToPorts,
          snapToAlignment: this.snapOptions.snapToAlignment,
          snapToEqualSpacing: this.snapOptions.snapToEqualSpacing ?? true,
        })
        this.previewDelta = snapped.point
        this.snapGuides = snapped.guides
      } else {
        this.previewDelta = constrainedDelta
        this.snapGuides = Object.freeze([])
      }
      return
    }
    if (this.tool === "resize-selection") {
      this.resizePreviewEntries = this.createResizePreviewEntries(delta)
      this.resizePreview = this.resizePreviewEntries[0] ?? null
      return
    }
    if (this.tool === "drag-edge-endpoint") {
      this.edgeEndpointPreview = this.latestPoint
      return
    }
    if (this.tool === "marquee") {
      this.marquee = rectFromPoints(this.startPoint, this.latestPoint)
    }
  }

  private createResizePreviewEntries(delta: DiagramPoint): ReadonlyArray<DiagramResizeEntry> {
    if (this.resizeSelectionIds.length) {
      return this.createSelectionResizePreviewEntries(delta)
    }
    const entry = this.createResizePreview(delta)
    return entry ? Object.freeze([entry]) : Object.freeze([])
  }

  private createSelectionResizePreviewEntries(delta: DiagramPoint): ReadonlyArray<DiagramResizeEntry> {
    if (!this.resizeHandle || !this.resizeStartBounds) return Object.freeze([])
    const nextBounds = resizeBoundsByHandle(this.resizeStartBounds, this.resizeHandle, delta, 8)
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
    const minSize = 8
    let x = bounds.x
    let y = bounds.y
    let width = bounds.width
    let height = bounds.height

    if (this.resizeHandle.includes("e")) width = Math.max(minSize, bounds.width + localDelta.x)
    if (this.resizeHandle.includes("s")) height = Math.max(minSize, bounds.height + localDelta.y)
    if (this.resizeHandle.includes("w")) {
      width = Math.max(minSize, bounds.width - localDelta.x)
      x = bounds.x + (bounds.width - width)
    }
    if (this.resizeHandle.includes("n")) {
      height = Math.max(minSize, bounds.height - localDelta.y)
      y = bounds.y + (bounds.height - height)
    }

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

  private getMarqueeSelectionIds(rect: DiagramRect): DiagramId[] {
    const visible = new Set(this.engine.queryVisible(rect))
    const scene = this.engine.getScene()
    return [
      ...scene.order.nodeIds,
      ...scene.order.shapeIds,
      ...scene.order.textIds,
      ...scene.order.edgeIds,
    ].filter((id) => {
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
    this.previewDelta = null
    this.marquee = null
    this.resizeOwnerId = null
    this.resizeSelectionIds = []
    this.resizeHandle = null
    this.resizeStartBounds = null
    this.resizeStartRotation = 0
    this.resizePreview = null
    this.resizePreviewEntries = Object.freeze([])
    this.dragSelectionIds = Object.freeze([])
    this.snapGuides = Object.freeze([])
    this.edgeEndpointId = null
    this.edgeEndpointKind = null
    this.edgeEndpointStart = null
    this.edgeEndpointPreview = null
    this.framePending = false
    this.pendingMoveCount = 0
  }
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

function resizeBoundsByHandle(bounds: DiagramRect, handle: DiagramResizeHandle, delta: DiagramPoint, minSize: number): DiagramRect {
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
