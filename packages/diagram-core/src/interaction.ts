import { createEntityGeometry } from "./geometry.js"
import type { DiagramEngine } from "./DiagramEngine.js"
import type { DiagramId, DiagramInteractionSnapshot, DiagramInteractionTool, DiagramMarqueeMode, DiagramPointerEvent, DiagramPoint, DiagramRect, DiagramResizeEntry, DiagramResizeHandle } from "./types.js"

type ScheduleFrame = (callback: () => void) => void

export type DiagramInteractionOptions = Readonly<{
  scheduleFrame?: ScheduleFrame
  marqueeMode?: DiagramMarqueeMode
}>

export class DiagramInteractionController {
  private tool: DiagramInteractionTool = "select"
  private activePointer: DiagramPointerEvent | null = null
  private startPoint: DiagramPoint | null = null
  private latestPoint: DiagramPoint | null = null
  private previewDelta: DiagramPoint | null = null
  private marquee: DiagramRect | null = null
  private resizeOwnerId: DiagramId | null = null
  private resizeSelectionIds: ReadonlyArray<DiagramId> = []
  private resizeHandle: DiagramResizeHandle | null = null
  private resizeStartBounds: DiagramRect | null = null
  private resizeStartRotation = 0
  private resizePreview: DiagramResizeEntry | null = null
  private resizePreviewEntries: ReadonlyArray<DiagramResizeEntry> = Object.freeze([])
  private framePending = false
  private pendingMoveCount = 0
  private commitCount = 0
  private readonly scheduleFrame: ScheduleFrame
  private readonly marqueeMode: DiagramMarqueeMode

  constructor(private readonly engine: DiagramEngine, options: DiagramInteractionOptions = {}) {
    this.scheduleFrame = options.scheduleFrame ?? defaultScheduleFrame
    this.marqueeMode = options.marqueeMode ?? "contain"
  }

  setTool(tool: DiagramInteractionTool): void {
    this.cancel()
    this.tool = tool
  }

  pointerDown(event: DiagramPointerEvent): void {
    this.activePointer = event
    this.startPoint = event.point
    this.latestPoint = event.point
    this.previewDelta = null
    this.marquee = null
    if (this.tool === "select") {
      const hit = this.engine.hitTest(event.point, { radius: 2 })
      if (hit) {
        const selection = this.engine.getScene().selection
        if (event.shiftKey) {
          this.engine.dispatch({ type: "setSelection", selection: { ids: [hit.id], primaryId: hit.id }, mode: "toggle" })
        } else if (!selection.ids.includes(hit.id)) {
          this.engine.dispatch({ type: "setSelection", selection: { ids: [hit.id], primaryId: hit.id } })
        }
        this.tool = "drag-selection"
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
    this.pendingMoveCount += 1
    if (!this.framePending) {
      this.framePending = true
      this.scheduleFrame(() => this.flushPointerMove())
    }
  }

  pointerUp(event: DiagramPointerEvent): void {
    if (!this.activePointer || this.activePointer.id !== event.id) {
      return
    }
    this.latestPoint = event.point
    this.flushPointerMove()
    if (this.tool === "drag-selection" && this.previewDelta) {
      const selection = this.engine.getScene().selection
      this.engine.dispatch({ type: "moveEntities", ids: selection.ids, delta: this.previewDelta, historyKey: `drag:${selection.primaryId ?? "selection"}` })
      this.commitCount += 1
    }
    if (this.tool === "pan" && this.previewDelta) {
      const viewport = this.engine.getScene().viewport
      this.engine.dispatch({ type: "setViewport", viewport: { x: viewport.x - this.previewDelta.x, y: viewport.y - this.previewDelta.y }, historyKey: "pan" })
      this.commitCount += 1
    }
    if (this.tool === "resize-selection" && this.resizePreviewEntries.length) {
      this.engine.dispatch({ type: "resizeEntities", entries: this.resizePreviewEntries, historyKey: `resize:${this.resizePreview?.id ?? "selection"}` })
      this.commitCount += 1
    }
    if (this.tool === "marquee" && this.marquee) {
      const ids = this.getMarqueeSelectionIds(this.marquee)
      this.engine.dispatch({ type: "setSelection", selection: { ids, primaryId: ids[0] ?? null }, mode: this.activePointer.shiftKey ? "add" : "replace" })
      this.commitCount += 1
    }
    this.clearGesture()
    if (this.tool === "drag-selection" || this.tool === "marquee" || this.tool === "resize-selection") {
      this.tool = "select"
    }
  }

  cancel(): void {
    this.clearGesture()
  }

  getSnapshot(): DiagramInteractionSnapshot {
    return {
      tool: this.tool,
      active: this.activePointer !== null,
      previewDelta: this.previewDelta,
      resizePreview: this.resizePreview,
      resizePreviewEntries: this.resizePreviewEntries,
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
      this.previewDelta = delta
      return
    }
    if (this.tool === "resize-selection") {
      this.resizePreviewEntries = this.createResizePreviewEntries(delta)
      this.resizePreview = this.resizePreviewEntries[0] ?? null
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
    this.activePointer = null
    this.startPoint = null
    this.latestPoint = null
    this.previewDelta = null
    this.marquee = null
    this.resizeOwnerId = null
    this.resizeSelectionIds = []
    this.resizeHandle = null
    this.resizeStartBounds = null
    this.resizeStartRotation = 0
    this.resizePreview = null
    this.resizePreviewEntries = Object.freeze([])
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
