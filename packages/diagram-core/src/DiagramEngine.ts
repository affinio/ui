import { createEntityGeometry, distance, rectContainsPoint, rectIntersects } from "./geometry.js"
import { DiagramClipboardService } from "./internal/DiagramClipboardService.js"
import { DiagramGeometryService } from "./internal/DiagramGeometryService.js"
import { DiagramHistory } from "./internal/DiagramHistory.js"
import { DiagramSceneStore, createInternalState } from "./internal/DiagramSceneStore.js"
import { DiagramSpatialIndex } from "./internal/DiagramSpatialIndex.js"
import { DiagramViewportService } from "./internal/DiagramViewportService.js"
import { EMPTY_SELECTION } from "./internal/model.js"
import type { InternalState, MutableEntities, MutableOrder, Patch, TransactionResult } from "./internal/model.js"
import type {
  DiagramChange,
  DiagramClipboard,
  DiagramCommand,
  DiagramCommandResult,
  DiagramDiagnostics,
  DiagramEdge,
  DiagramEdgeEndpoint,
  DiagramEntityKind,
  DiagramGeometry,
  DiagramHit,
  DiagramHitTestOptions,
  DiagramId,
  DiagramPoint,
  DiagramQueryOptions,
  DiagramRect,
  DiagramRenderOrderOptions,
  DiagramResizeEntry,
  DiagramRotateEntry,
  DiagramAlignEdge,
  DiagramScene,
  DiagramSceneInput,
  DiagramEngineOptions,
  DiagramSelection,
  DiagramKeyboardCommand,
  DiagramKeyboardOptions,
  DiagramSnapContext,
  DiagramSnapResult,
  DiagramSubscriber,
  DiagramViewport,
  SerializedDiagramScene,
} from "./types.js"

export class DiagramEngine {
  private store: DiagramSceneStore
  private state: InternalState
  private geometryService = new DiagramGeometryService()
  private spatialIndex = new DiagramSpatialIndex()
  private history: DiagramHistory
  private viewportService = new DiagramViewportService()
  private clipboardService = new DiagramClipboardService()
  private visibleQueryCount = 0
  private entityQueryCount = 0
  private hitTestCount = 0
  private lastCommandMs = 0
  private orderIndexRevision = -1
  private orderIndexCache = new Map<DiagramId, number>()
  private orderedIdsRevision = -1
  private orderedIdsCache: DiagramId[] = []
  private dependencyIndexReady = false
  private dependencyEntityIds = new Set<DiagramId>()
  private portIdsByNode = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByNode = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByPort = new Map<DiagramId, Set<DiagramId>>()

  constructor(initialScene: DiagramSceneInput = {}, options: DiagramEngineOptions = {}) {
    this.history = new DiagramHistory(options.history)
    this.store = new DiagramSceneStore(initialScene)
    this.state = this.store.state
    this.ensureIndexes()
  }

  getScene(): DiagramScene {
    return this.store.getSnapshot()
  }

  getLastChange(): DiagramChange {
    return this.store.getLastChange()
  }

  getEntityVersion(id: DiagramId): number {
    return this.state.versions.get(id) ?? 0
  }

  getGeometryReadCount(): number {
    return this.geometryService.getReadCount()
  }

  getGeometrySnapshot(id: DiagramId): DiagramGeometry | null {
    return this.getGeometry(id)
  }

  dispatch(command: DiagramCommand): DiagramCommandResult {
    const startedAt = now()
    let result: DiagramCommandResult
    if (command.type === "undo") {
      result = this.undo()
      this.lastCommandMs = now() - startedAt
      return result
    }
    if (command.type === "redo") {
      result = this.redo()
      this.lastCommandMs = now() - startedAt
      return result
    }
    const patch = this.createPatch(command)
    if (!patch) {
      this.lastCommandMs = now() - startedAt
      return { changed: false, revision: this.state.revision }
    }
    const transaction = this.commitPatch(patch, true, "historyKey" in command ? command.historyKey ?? null : null)
    result = { changed: transaction.changedIds.size > 0, revision: this.state.revision }
    this.lastCommandMs = now() - startedAt
    return result
  }

  transact(mutator: (draft: DiagramScene) => DiagramSceneInput): DiagramCommandResult {
    const next = mutator(this.store.getSnapshot())
    const patch = createReplaceScenePatch(next, serializeScene(this.store.getSnapshot()))
    this.history.clear()
    const result = this.commitPatch(patch, false, null)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  queryVisible(bounds: DiagramRect): DiagramId[] {
    this.visibleQueryCount += 1
    this.ensureIndexes()
    const ids = this.spatialIndex.queryVisible(bounds)
    const order = this.createOrderIndex()
    return ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  }

  queryVisibleBruteForce(bounds: DiagramRect): DiagramId[] {
    const order = this.createOrderedIds()
    return order.filter((id) => {
      const geometry = this.getGeometry(id)
      return geometry ? rectIntersects(geometry.bounds, bounds) : false
    })
  }

  queryEntities(options: DiagramQueryOptions = {}): DiagramId[] {
    this.entityQueryCount += 1
    if (options.limit !== undefined && options.limit <= 0) {
      return []
    }
    this.ensureIndexes()
    const kinds = options.kinds ? new Set<DiagramEntityKind>(options.kinds) : null
    const includePorts = options.includePorts === true || kinds?.has("port") === true
    const normalizedText = normalizeSearchText(options.text)
    const metadata = options.metadata ?? null
    const order = this.createOrderIndex()
    const sourceIds = options.bounds ? this.spatialIndex.queryVisible(options.bounds) : this.createOrderedIds()
    const orderedSourceIds = options.bounds
      ? sourceIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      : sourceIds
    const result: DiagramId[] = []
    const seen = new Set<DiagramId>()

    for (const id of orderedSourceIds) {
      if (seen.has(id)) {
        continue
      }
      seen.add(id)
      const kind = this.getEntityKind(id)
      if (!kind || (!includePorts && kind === "port") || (kinds && !kinds.has(kind))) {
        continue
      }
      const geometry = this.getGeometry(id)
      if (!geometry) {
        continue
      }
      if (options.bounds && !geometryMatchesBounds(geometry.bounds, options.bounds, options.boundsMode ?? "intersects")) {
        continue
      }
      if (normalizedText && !entityMatchesText(id, this.state, normalizedText)) {
        continue
      }
      if (metadata && !entityMatchesMetadata(this.getEntityMetadata(id), metadata)) {
        continue
      }
      result.push(id)
      if (options.limit !== undefined && result.length >= options.limit) {
        break
      }
    }
    return result
  }

  hitTest(point: DiagramPoint, options: DiagramHitTestOptions = {}): DiagramHit | null {
    this.hitTestCount += 1
    this.ensureIndexes()
    const radius = options.radius ?? 0
    const kinds = options.kinds ? new Set<DiagramEntityKind>(options.kinds) : null
    const rect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    const renderOrder = this.createOrderIndex()
    const candidates = this.spatialIndex.queryHit(rect).sort((a, b) => (renderOrder.get(b) ?? 0) - (renderOrder.get(a) ?? 0))
    let best: DiagramHit | null = null
    let bestOrder = -1
    for (const id of candidates) {
      const geometry = this.getGeometry(id)
      if (!geometry || (kinds && !kinds.has(geometry.kind))) {
        continue
      }
      const hitDistance = hitDistanceForGeometry(geometry, point, radius)
      if (hitDistance === null) {
        continue
      }
      const order = renderOrder.get(id) ?? 0
      if (!best || hitDistance < best.distance || (hitDistance === best.distance && order > bestOrder)) {
        best = { id, kind: geometry.kind, distance: hitDistance }
        bestOrder = order
      }
    }
    return best
  }

  nearestPort(point: DiagramPoint, radius: number, exclude: ReadonlySet<DiagramId> = new Set()): DiagramHit | null {
    this.ensureIndexes()
    const rect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    let best: DiagramHit | null = null
    for (const id of this.spatialIndex.queryPorts(rect)) {
      if (exclude.has(id)) {
        continue
      }
      const geometry = this.getGeometry(id)
      if (!geometry?.point) {
        continue
      }
      const portDistance = distance(point, geometry.point)
      if (portDistance <= radius && (!best || portDistance < best.distance)) {
        best = { id, kind: "port", distance: portDistance }
      }
    }
    return best
  }

  nearestPortBruteForce(point: DiagramPoint, radius: number, exclude: ReadonlySet<DiagramId> = new Set()): DiagramHit | null {
    let best: DiagramHit | null = null
    for (const id of this.state.entities.portsById.keys()) {
      if (exclude.has(id)) {
        continue
      }
      const geometry = this.getGeometry(id)
      if (!geometry?.point) {
        continue
      }
      const portDistance = distance(point, geometry.point)
      if (portDistance <= radius && (!best || portDistance < best.distance)) {
        best = { id, kind: "port", distance: portDistance }
      }
    }
    return best
  }

  snapPoint(point: DiagramPoint, context: DiagramSnapContext = {}): DiagramSnapResult {
    const custom = context.custom?.(point)
    if (custom) {
      return { point: custom, snapped: true, source: "custom" }
    }
    const port = this.nearestPort(point, context.radius ?? 12, context.excludeIds ?? new Set())
    if (port) {
      const geometry = this.getGeometry(port.id)
      if (geometry?.point) {
        return { point: geometry.point, snapped: true, source: "port" }
      }
    }
    const aligned = this.snapToAlignment(point, context.radius ?? 6, context.excludeIds)
    if (aligned) {
      return { point: aligned, snapped: true, source: "alignment" }
    }
    if (context.angleConstraint && context.angleConstraint > 0) {
      return { point: constrainAngle(point, context.angleConstraint), snapped: true, source: "angle" }
    }
    if (context.gridSize && context.gridSize > 0) {
      return {
        point: {
          x: Math.round(point.x / context.gridSize) * context.gridSize,
          y: Math.round(point.y / context.gridSize) * context.gridSize,
        },
        snapped: true,
        source: "grid",
      }
    }
    return { point, snapped: false, source: null }
  }

  snapTranslation(selection: DiagramSelection, delta: DiagramPoint, context: DiagramSnapContext = {}): DiagramSnapResult {
    const primaryId = selection.primaryId ?? selection.ids[0]
    const geometry = primaryId ? this.getGeometry(primaryId) : null
    const origin = geometry ? { x: geometry.bounds.x, y: geometry.bounds.y } : { x: 0, y: 0 }
    const snapped = this.snapPoint({ x: origin.x + delta.x, y: origin.y + delta.y }, context)
    return {
      point: { x: snapped.point.x - origin.x, y: snapped.point.y - origin.y },
      snapped: snapped.snapped,
      source: snapped.source,
    }
  }

  canUndo(): boolean {
    return this.history.canUndo()
  }

  canRedo(): boolean {
    return this.history.canRedo()
  }

  canDelete(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => this.hasEntity(id) && !this.isEntityNonDeletable(id) && !this.isEntityLockedOrReadOnly(id))
  }

  canMove(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => this.hasEntity(id) && !this.isEntityLockedOrReadOnly(id))
  }

  canResize(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => !this.isEntityLockedOrReadOnly(id) && (this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id)))
  }

  canRotate(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return this.canResize(ids)
  }

  canAlign(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.filter((id) => !this.isEntityLockedOrReadOnly(id) && (this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id))).length >= 2
  }

  canEditText(id: DiagramId | null = this.state.selection.primaryId): boolean {
    return Boolean(id && this.state.entities.textsById.has(id) && !this.isEntityLockedOrReadOnly(id))
  }

  canPaste(clipboard: DiagramClipboard | null | undefined): boolean {
    return Boolean(clipboard && (clipboard.nodes.length || clipboard.edges.length || clipboard.texts.length || clipboard.shapes.length || clipboard.ports.length))
  }

  getDiagnostics(): DiagramDiagnostics {
    return {
      revision: this.state.revision,
      visibleQueryCount: this.visibleQueryCount,
      entityQueryCount: this.entityQueryCount,
      hitTestCount: this.hitTestCount,
      geometryRecomputeCount: this.geometryService.getReadCount(),
      lastCommandMs: this.lastCommandMs,
      undoDepth: this.history.undoDepth(),
      redoDepth: this.history.redoDepth(),
    }
  }

  getRenderOrder(options: DiagramRenderOrderOptions = {}): DiagramId[] {
    const ids = this.createOrderedIds().filter((id) => options.includePorts || !this.state.entities.portsById.has(id))
    return ids.sort((a, b) => layerRank(this.getEntityMetadata(a)) - layerRank(this.getEntityMetadata(b)))
  }

  exportSelection(): DiagramClipboard {
    return this.clipboardService.exportSubgraph(this.state, this.state.selection.ids, normalizeSelection)
  }

  importClipboard(clipboard: DiagramClipboard, offset: DiagramPoint = { x: 24, y: 24 }): DiagramCommandResult {
    return this.dispatch({ type: "pasteClipboard", clipboard, offset })
  }

  duplicateSelection(offset: DiagramPoint = { x: 24, y: 24 }): DiagramCommandResult {
    return this.dispatch({ type: "duplicateSelection", offset })
  }

  dispatchKeyboardCommand(command: DiagramKeyboardCommand, options: DiagramKeyboardOptions = {}): DiagramCommandResult {
    return this.dispatch({ type: "keyboard", command, options })
  }

  fitBounds(bounds: DiagramRect, padding = 24): DiagramCommandResult {
    return this.dispatch({ type: "setViewport", viewport: this.viewportService.fitBounds(this.state.viewport, bounds, padding) })
  }

  fitSelection(padding = 24): DiagramCommandResult {
    const bounds = boundsForIds(this, this.state.selection.ids)
    return bounds ? this.fitBounds(bounds, padding) : { changed: false, revision: this.state.revision }
  }

  fitScene(padding = 24): DiagramCommandResult {
    const bounds = boundsForIds(this, this.createOrderedIds())
    return bounds ? this.fitBounds(bounds, padding) : { changed: false, revision: this.state.revision }
  }

  subscribe(listener: DiagramSubscriber): { unsubscribe: () => void } {
    return this.store.subscribe(listener)
  }

  serialize(): SerializedDiagramScene {
    return serializeScene(this.store.getSnapshot())
  }

  private undo(): DiagramCommandResult {
    const entry = this.history.popUndo()
    if (!entry) {
      return { changed: false, revision: this.state.revision }
    }
    this.history.pushRedo(entry)
    const result = this.commitPatch(entry.inverse, false, null)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  private redo(): DiagramCommandResult {
    const entry = this.history.popRedo()
    if (!entry) {
      return { changed: false, revision: this.state.revision }
    }
    this.history.pushUndo(entry)
    const result = this.commitPatch(entry.patch, false, null)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  private commitPatch(patch: Patch, recordHistory: boolean, historyKey: string | null): TransactionResult {
    const changedIds = patch.apply(this.state)
    if (!changedIds.size) {
      return { changedIds, invalidatedIds: new Set() }
    }
    this.ensureDependencyIndex(changedIds)
    const invalidatedIds = this.collectInvalidatedIds(changedIds)
    for (const id of invalidatedIds) {
      this.state.versions.set(id, (this.state.versions.get(id) ?? 0) + 1)
    }
    this.state.revision += 1
    this.geometryService.invalidate(invalidatedIds)
    const invalidatedGeometryIds = [...invalidatedIds]
    this.spatialIndex.update(
      invalidatedGeometryIds
        .map((id) => this.geometryService.get(id, this.state.entities, this.state.versions.get(id) ?? 0))
        .filter((geometry): geometry is DiagramGeometry => geometry !== null),
      invalidatedGeometryIds.filter((id) => !this.hasEntity(id)),
    )
    if (recordHistory) {
      this.history.record(patch, historyKey, composePatches)
    }
    this.store.publish(changedIds, invalidatedIds)
    return { changedIds, invalidatedIds }
  }

  private collectInvalidatedIds(changedIds: ReadonlySet<DiagramId>): Set<DiagramId> {
    const invalidated = new Set(changedIds)
    for (const id of changedIds) {
      for (const portId of this.portIdsByNode.get(id) ?? []) {
        invalidated.add(portId)
      }
      for (const edgeId of this.edgeIdsByNode.get(id) ?? []) {
        invalidated.add(edgeId)
      }
      for (const edgeId of this.edgeIdsByPort.get(id) ?? []) {
        invalidated.add(edgeId)
      }
    }
    return invalidated
  }

  private ensureDependencyIndex(changedIds: ReadonlySet<DiagramId>): void {
    let rebuild = !this.dependencyIndexReady
    for (const id of changedIds) {
      const exists = this.hasEntity(id)
      if (this.dependencyEntityIds.has(id) !== exists || this.state.entities.edgesById.has(id) || this.state.entities.portsById.has(id)) {
        rebuild = true
        break
      }
    }
    if (!rebuild) {
      return
    }
    this.dependencyEntityIds = new Set([
      ...this.state.entities.nodesById.keys(),
      ...this.state.entities.edgesById.keys(),
      ...this.state.entities.textsById.keys(),
      ...this.state.entities.shapesById.keys(),
      ...this.state.entities.portsById.keys(),
    ])
    this.portIdsByNode = new Map()
    this.edgeIdsByNode = new Map()
    this.edgeIdsByPort = new Map()
    for (const port of this.state.entities.portsById.values()) {
      addDependency(this.portIdsByNode, port.nodeId, port.id)
    }
    for (const edge of this.state.entities.edgesById.values()) {
      for (const endpoint of [edge.source, edge.target]) {
        if (endpoint.kind === "node") {
          addDependency(this.edgeIdsByNode, endpoint.nodeId, edge.id)
        } else if (endpoint.kind === "port") {
          addDependency(this.edgeIdsByPort, endpoint.portId, edge.id)
          const port = this.state.entities.portsById.get(endpoint.portId)
          if (port) {
            addDependency(this.edgeIdsByNode, port.nodeId, edge.id)
          }
        }
      }
    }
    this.dependencyIndexReady = true
  }

  private getGeometry(id: DiagramId): DiagramGeometry | null {
    return this.geometryService.get(id, this.store.getSnapshot().entities, this.state.versions.get(id) ?? 0)
  }

  private rebuildIndexGeometries(): ReadonlyArray<DiagramGeometry> {
    return this.createOrderedIds()
      .map((id) => this.getGeometry(id))
      .filter((geometry): geometry is DiagramGeometry => geometry !== null)
  }

  private ensureIndexes(): void {
    this.spatialIndex.ensure(() => this.rebuildIndexGeometries())
  }

  private createPatch(command: Exclude<DiagramCommand, { type: "undo" } | { type: "redo" }>): Patch | null {
    switch (command.type) {
      case "moveEntities":
        return createMovePatch(this.state, command.ids, command.delta)
      case "moveNode":
        return createMovePatch(this.state, [command.id], command.delta)
      case "moveEdgeEndpoint":
        return createMoveEdgeEndpointPatch(this.state, command.id, command.endpoint, command.point)
      case "insertEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, command.point, "insert")
      case "moveEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, command.point, "move")
      case "removeEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, null, "remove")
      case "createEdge":
        return createCreateEdgePatch(this.state, command.edge)
      case "deleteSelection":
        return createDeleteSelectionPatch(this.state)
      case "duplicateSelection":
        return this.clipboardService.createPastePatch(this.state, this.clipboardService.exportSubgraph(this.state, this.state.selection.ids, normalizeSelection), command.offset ?? { x: 24, y: 24 }, createDeleteEntitiesPatch, normalizeSelection)
      case "pasteClipboard":
        return this.clipboardService.createPastePatch(this.state, command.clipboard, command.offset ?? { x: 24, y: 24 }, createDeleteEntitiesPatch, normalizeSelection)
      case "resizeEntities":
        return createResizePatch(this.state, command.entries)
      case "rotateEntities":
        return createRotatePatch(this.state, command.entries)
      case "alignEntities":
        return createAlignPatch(this.state, command.ids, command.edge)
      case "bringForward":
        return createOrderPatch(this.state, command.ids, "forward")
      case "sendBackward":
        return createOrderPatch(this.state, command.ids, "backward")
      case "bringToFront":
        return createOrderPatch(this.state, command.ids, "front")
      case "sendToBack":
        return createOrderPatch(this.state, command.ids, "back")
      case "setLayer":
        return createLayerPatch(this.state, command.ids, command.layer, command.layerRole)
      case "keyboard":
        return createKeyboardPatch(this.state, command.command, command.options ?? {})
      case "setSelection":
        return createSelectionPatch(this.state.selection, command.selection, command.mode ?? "replace")
      case "editText":
        return this.canEditText(command.id) ? createEditTextPatch(this.state, command.id, command.text) : null
      case "setViewport":
        return createViewportPatch(this.state.viewport, command.viewport)
    }
  }

  private snapToAlignment(point: DiagramPoint, radius: number, excludeIds?: ReadonlySet<DiagramId>): DiagramPoint | null {
    for (const id of this.state.order.nodeIds) {
      if (excludeIds?.has(id)) {
        continue
      }
      const geometry = this.getGeometry(id)
      if (!geometry) {
        continue
      }
      const center = { x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }
      if (Math.abs(center.x - point.x) <= radius) {
        return { x: center.x, y: point.y }
      }
      if (Math.abs(center.y - point.y) <= radius) {
        return { x: point.x, y: center.y }
      }
    }
    return null
  }

  private createOrderedIds(): DiagramId[] {
    if (this.orderedIdsRevision === this.state.revision) {
      return this.orderedIdsCache
    }
    const ids = [
      ...this.state.order.edgeIds,
      ...this.state.order.shapeIds,
      ...this.state.order.nodeIds,
      ...this.state.order.textIds,
      ...this.state.entities.portsById.keys(),
    ]
    const baseOrder = new Map(ids.map((id, index) => [id, index]))
    this.orderedIdsCache = ids.sort((a, b) => {
      const layerDelta = layerRank(this.getEntityMetadata(a)) - layerRank(this.getEntityMetadata(b))
      if (layerDelta) {
        return layerDelta
      }
      const zDelta = zIndex(this.getEntityMetadata(a)) - zIndex(this.getEntityMetadata(b))
      return zDelta || ((baseOrder.get(a) ?? 0) - (baseOrder.get(b) ?? 0))
    })
    this.orderedIdsRevision = this.state.revision
    return this.orderedIdsCache
  }

  private createOrderIndex(): Map<DiagramId, number> {
    if (this.orderIndexRevision !== this.state.revision) {
      this.orderIndexCache = new Map(this.createOrderedIds().map((id, index) => [id, index]))
      this.orderIndexRevision = this.state.revision
    }
    return this.orderIndexCache
  }

  private hasEntity(id: DiagramId): boolean {
    return hasEntity(this.state, id)
  }

  private getEntityKind(id: DiagramId): DiagramEntityKind | null {
    if (this.state.entities.nodesById.has(id)) return "node"
    if (this.state.entities.edgesById.has(id)) return "edge"
    if (this.state.entities.textsById.has(id)) return "text"
    if (this.state.entities.shapesById.has(id)) return "shape"
    if (this.state.entities.portsById.has(id)) return "port"
    return null
  }

  private getEntityMetadata(id: DiagramId): Readonly<Record<string, unknown>> | undefined {
    return this.state.entities.nodesById.get(id)?.metadata
      ?? this.state.entities.edgesById.get(id)?.metadata
      ?? this.state.entities.textsById.get(id)?.metadata
      ?? this.state.entities.shapesById.get(id)?.metadata
      ?? this.state.entities.portsById.get(id)?.metadata
  }

  private isEntityLockedOrReadOnly(id: DiagramId): boolean {
    const metadata = this.getEntityMetadata(id)
    return metadata?.locked === true || metadata?.readOnly === true
  }

  private isEntityNonDeletable(id: DiagramId): boolean {
    return this.getEntityMetadata(id)?.nonDeletable === true
  }
}

function geometryMatchesBounds(candidate: DiagramRect, bounds: DiagramRect, mode: "intersects" | "contains"): boolean {
  return mode === "contains" ? rectContainsRect(bounds, candidate) : rectIntersects(candidate, bounds)
}

function rectContainsRect(container: DiagramRect, candidate: DiagramRect): boolean {
  return candidate.x >= container.x
    && candidate.y >= container.y
    && candidate.x + candidate.width <= container.x + container.width
    && candidate.y + candidate.height <= container.y + container.height
}

function normalizeSearchText(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? ""
}

function entityMatchesText(id: DiagramId, state: InternalState, normalizedText: string): boolean {
  if (id.toLocaleLowerCase().includes(normalizedText)) {
    return true
  }
  const text = state.entities.textsById.get(id)?.text
  if (text?.toLocaleLowerCase().includes(normalizedText)) {
    return true
  }
  return searchableMetadataValues(getEntityMetadata(state, id)).some((value) => value.toLocaleLowerCase().includes(normalizedText))
}

function searchableMetadataValues(metadata: Readonly<Record<string, unknown>> | undefined): string[] {
  if (!metadata) {
    return []
  }
  const values: string[] = []
  for (const value of Object.values(metadata)) {
    collectSearchableValue(value, values)
  }
  return values
}

function collectSearchableValue(value: unknown, values: string[]): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    values.push(String(value))
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSearchableValue(entry, values)
    }
  }
}

function entityMatchesMetadata(entityMetadata: Readonly<Record<string, unknown>> | undefined, query: Readonly<Record<string, unknown>>): boolean {
  if (!entityMetadata) {
    return false
  }
  for (const [key, expected] of Object.entries(query)) {
    if (!metadataValueMatches(entityMetadata[key], expected)) {
      return false
    }
  }
  return true
}

function metadataValueMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((value) => Object.is(value, expected))
  }
  return Object.is(actual, expected)
}

export function createDiagramEngine(initialScene: DiagramSceneInput = {}, options: DiagramEngineOptions = {}): DiagramEngine {
  return new DiagramEngine(initialScene, options)
}

export function serializeScene(scene: DiagramScene): SerializedDiagramScene {
  return {
    nodes: scene.order.nodeIds.map((id) => scene.entities.nodesById.get(id)).filter(isDefined),
    edges: scene.order.edgeIds.map((id) => scene.entities.edgesById.get(id)).filter(isDefined),
    texts: scene.order.textIds.map((id) => scene.entities.textsById.get(id)).filter(isDefined),
    shapes: scene.order.shapeIds.map((id) => scene.entities.shapesById.get(id)).filter(isDefined),
    ports: [...scene.entities.portsById.values()],
    selection: scene.selection,
    viewport: scene.viewport,
  }
}

export function deserializeScene(scene: SerializedDiagramScene): DiagramSceneInput {
  return scene
}

function createMovePatch(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch | null {
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  const movableIds = ids.filter((id) => !isEntityLockedOrReadOnly(state, id) && (state.entities.nodesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id)))
  if (!movableIds.length) {
    return null
  }
  return {
    apply: (next) => {
      const changed = new Set<DiagramId>()
      for (const id of movableIds) {
        const node = next.entities.nodesById.get(id)
        if (node) {
          next.entities.nodesById.set(id, { ...node, x: node.x + delta.x, y: node.y + delta.y })
          changed.add(id)
          continue
        }
        const text = next.entities.textsById.get(id)
        if (text) {
          next.entities.textsById.set(id, { ...text, x: text.x + delta.x, y: text.y + delta.y })
          changed.add(id)
          continue
        }
        const shape = next.entities.shapesById.get(id)
        if (shape) {
          next.entities.shapesById.set(id, { ...shape, x: shape.x + delta.x, y: shape.y + delta.y })
          changed.add(id)
        }
      }
      return changed
    },
    inverse: createMovePatchUnchecked(movableIds, { x: -delta.x, y: -delta.y }),
  }
}

function createMovePatchUnchecked(ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch {
  return {
    apply: (next) => {
      const changed = new Set<DiagramId>()
      for (const id of ids) {
        const node = next.entities.nodesById.get(id)
        if (node) {
          next.entities.nodesById.set(id, { ...node, x: node.x + delta.x, y: node.y + delta.y })
          changed.add(id)
        }
        const text = next.entities.textsById.get(id)
        if (text) {
          next.entities.textsById.set(id, { ...text, x: text.x + delta.x, y: text.y + delta.y })
          changed.add(id)
        }
        const shape = next.entities.shapesById.get(id)
        if (shape) {
          next.entities.shapesById.set(id, { ...shape, x: shape.x + delta.x, y: shape.y + delta.y })
          changed.add(id)
        }
      }
      return changed
    },
    inverse: undefined as unknown as Patch,
  }
}

function createMoveEdgeEndpointPatch(state: InternalState, id: DiagramId, endpoint: "source" | "target", point: DiagramPoint): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge) {
    return null
  }
  const previous = edge[endpoint]
  const nextEndpoint = { kind: "point" as const, point }
  return {
    apply: (next) => {
      const nextEdge = next.entities.edgesById.get(id)
      if (!nextEdge) {
        return new Set()
      }
      next.entities.edgesById.set(id, { ...nextEdge, [endpoint]: nextEndpoint })
      return new Set([id])
    },
    inverse: {
      apply: (next) => {
        const nextEdge = next.entities.edgesById.get(id)
        if (!nextEdge) {
          return new Set()
        }
        next.entities.edgesById.set(id, { ...nextEdge, [endpoint]: previous })
        return new Set([id])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createEdgeWaypointPatch(state: InternalState, id: DiagramId, index: number, point: DiagramPoint | null, mode: "insert" | "move" | "remove"): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id)) {
    return null
  }
  const previousPoints = [...(edge.points ?? [])]
  const nextPoints = [...previousPoints]
  const safeIndex = Math.max(0, Math.min(index, mode === "insert" ? nextPoints.length : nextPoints.length - 1))
  if (mode === "insert" && point) {
    nextPoints.splice(safeIndex, 0, point)
  } else if (mode === "move" && point && nextPoints[safeIndex]) {
    nextPoints[safeIndex] = point
  } else if (mode === "remove" && nextPoints[safeIndex]) {
    nextPoints.splice(safeIndex, 1)
  } else {
    return null
  }
  return createEdgePointsPatch(id, previousPoints, nextPoints)
}

function createEdgePointsPatch(id: DiagramId, previousPoints: ReadonlyArray<DiagramPoint>, nextPoints: ReadonlyArray<DiagramPoint>): Patch {
  return {
    apply: (next) => {
      const edge = next.entities.edgesById.get(id)
      if (!edge) return new Set()
      next.entities.edgesById.set(id, { ...edge, points: [...nextPoints] })
      return new Set([id])
    },
    inverse: {
      apply: (next) => {
        const edge = next.entities.edgesById.get(id)
        if (!edge) return new Set()
        next.entities.edgesById.set(id, { ...edge, points: [...previousPoints] })
        return new Set([id])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createResizePatch(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>): Patch | null {
  const previous = new Map<DiagramId, DiagramResizeEntry>()
  const nextEntries: DiagramResizeEntry[] = []
  for (const entry of entries) {
    if (isEntityLockedOrReadOnly(state, entry.id)) continue
    const node = state.entities.nodesById.get(entry.id)
    const shape = state.entities.shapesById.get(entry.id)
    const text = state.entities.textsById.get(entry.id)
    const entity = node ?? shape ?? text
    if (!entity) continue
    previous.set(entry.id, { id: entry.id, x: entity.x, y: entity.y, width: entity.width, height: entity.height })
    nextEntries.push(entry)
    if (node) {
      for (const port of state.entities.portsById.values()) {
        if (port.nodeId !== node.id || isEntityLockedOrReadOnly(state, port.id)) continue
        const nextWidth = entry.width ?? node.width
        const nextHeight = entry.height ?? node.height
        const nextPort = {
          id: port.id,
          x: node.width === 0 ? port.x : port.x * (nextWidth / node.width),
          y: node.height === 0 ? port.y : port.y * (nextHeight / node.height),
        }
        previous.set(port.id, { id: port.id, x: port.x, y: port.y })
        nextEntries.push(nextPort)
      }
    }
  }
  if (!nextEntries.length) return null
  return createResizePatchUnchecked(nextEntries, [...previous.values()])
}

function createResizePatchUnchecked(entries: ReadonlyArray<DiagramResizeEntry>, inverseEntries: ReadonlyArray<DiagramResizeEntry>): Patch {
  return {
    apply: (next) => applyResizeEntries(next, entries),
    inverse: {
      apply: (next) => applyResizeEntries(next, inverseEntries),
      inverse: undefined as unknown as Patch,
    },
  }
}

function applyResizeEntries(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const entry of entries) {
    const node = state.entities.nodesById.get(entry.id)
    if (node) {
      state.entities.nodesById.set(entry.id, { ...node, ...definedRectPatch(entry) })
      changed.add(entry.id)
      continue
    }
    const shape = state.entities.shapesById.get(entry.id)
    if (shape) {
      state.entities.shapesById.set(entry.id, { ...shape, ...definedRectPatch(entry) })
      changed.add(entry.id)
      continue
    }
    const text = state.entities.textsById.get(entry.id)
    if (text) {
      state.entities.textsById.set(entry.id, { ...text, ...definedRectPatch(entry) })
      changed.add(entry.id)
      continue
    }
    const port = state.entities.portsById.get(entry.id)
    if (port) {
      const patch = Object.fromEntries(Object.entries(entry).filter(([key, value]) => (key === "x" || key === "y") && value !== undefined)) as Partial<DiagramResizeEntry>
      state.entities.portsById.set(entry.id, { ...port, ...patch })
      changed.add(entry.id)
    }
  }
  return changed
}

function definedRectPatch(entry: DiagramResizeEntry): Partial<DiagramResizeEntry> {
  return Object.fromEntries(Object.entries(entry).filter(([key, value]) => key !== "id" && value !== undefined)) as Partial<DiagramResizeEntry>
}


function createRotatePatch(state: InternalState, entries: ReadonlyArray<DiagramRotateEntry>): Patch | null {
  const previous: DiagramRotateEntry[] = []
  const nextEntries: DiagramRotateEntry[] = []
  for (const entry of entries) {
    if (isEntityLockedOrReadOnly(state, entry.id)) continue
    const entity = state.entities.nodesById.get(entry.id) ?? state.entities.shapesById.get(entry.id) ?? state.entities.textsById.get(entry.id)
    if (!entity) continue
    previous.push({ id: entry.id, rotation: entity.rotation ?? 0 })
    nextEntries.push({ id: entry.id, rotation: normalizeRotation(entry.rotation) })
  }
  if (!nextEntries.length) return null
  return createRotatePatchUnchecked(nextEntries, previous)
}

function createRotatePatchUnchecked(entries: ReadonlyArray<DiagramRotateEntry>, inverseEntries: ReadonlyArray<DiagramRotateEntry>): Patch {
  return {
    apply: (state) => applyRotateEntries(state, entries),
    inverse: {
      apply: (state) => applyRotateEntries(state, inverseEntries),
      inverse: undefined as unknown as Patch,
    },
  }
}

function applyRotateEntries(state: InternalState, entries: ReadonlyArray<DiagramRotateEntry>): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const entry of entries) {
    const node = state.entities.nodesById.get(entry.id)
    if (node) { state.entities.nodesById.set(entry.id, { ...node, rotation: entry.rotation }); changed.add(entry.id); continue }
    const shape = state.entities.shapesById.get(entry.id)
    if (shape) { state.entities.shapesById.set(entry.id, { ...shape, rotation: entry.rotation }); changed.add(entry.id); continue }
    const text = state.entities.textsById.get(entry.id)
    if (text) { state.entities.textsById.set(entry.id, { ...text, rotation: entry.rotation }); changed.add(entry.id) }
  }
  return changed
}

function createAlignPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, edge: DiagramAlignEdge): Patch | null {
  const geometries = ids
    .filter((id) => !isEntityLockedOrReadOnly(state, id))
    .map((id) => createEntityGeometry(id, snapshotEntities(state)))
    .filter((geometry): geometry is DiagramGeometry => geometry !== null && geometry.kind !== "edge" && geometry.kind !== "port")
  if (geometries.length < 2) return null
  const target = alignTarget(geometries, edge)
  const entries = geometries.map((geometry) => {
    const bounds = geometry.bounds
    if (edge === "left") return { id: geometry.id, x: target }
    if (edge === "centerX") return { id: geometry.id, x: target - bounds.width / 2 }
    if (edge === "right") return { id: geometry.id, x: target - bounds.width }
    if (edge === "top") return { id: geometry.id, y: target }
    if (edge === "centerY") return { id: geometry.id, y: target - bounds.height / 2 }
    return { id: geometry.id, y: target - bounds.height }
  })
  return createResizePatch(state, entries)
}

function alignTarget(geometries: ReadonlyArray<DiagramGeometry>, edge: DiagramAlignEdge): number {
  if (edge === "left") return Math.min(...geometries.map((geometry) => geometry.bounds.x))
  if (edge === "centerX") return geometries[0]!.bounds.x + geometries[0]!.bounds.width / 2
  if (edge === "right") return Math.max(...geometries.map((geometry) => geometry.bounds.x + geometry.bounds.width))
  if (edge === "top") return Math.min(...geometries.map((geometry) => geometry.bounds.y))
  if (edge === "centerY") return geometries[0]!.bounds.y + geometries[0]!.bounds.height / 2
  return Math.max(...geometries.map((geometry) => geometry.bounds.y + geometry.bounds.height))
}

function snapshotEntities(state: InternalState) {
  return {
    nodesById: state.entities.nodesById,
    edgesById: state.entities.edgesById,
    textsById: state.entities.textsById,
    shapesById: state.entities.shapesById,
    portsById: state.entities.portsById,
  }
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function createOrderPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, mode: "forward" | "backward" | "front" | "back"): Patch | null {
  const existingIds = ids.filter((id) => hasEntity(state, id))
  if (!existingIds.length) return null
  if (mode === "front" || mode === "back") {
    return createZIndexPatch(state, existingIds, mode)
  }
  const previous = cloneOrder(state.order)
  const next = cloneOrder(state.order)
  reorderIds(next.nodeIds, ids, mode)
  reorderIds(next.edgeIds, ids, mode)
  reorderIds(next.textIds, ids, mode)
  reorderIds(next.shapeIds, ids, mode)
  if (ordersEqual(previous, next)) return null
  return createOrderPatchUnchecked(previous, next)
}

function createZIndexPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, mode: "front" | "back"): Patch | null {
  const orderedIds = allEntityIds(state)
  const values = orderedIds.map((id) => zIndex(getEntityMetadata(state, id)))
  const base = mode === "front" ? Math.max(0, ...values) : Math.min(0, ...values)
  const nextMetadata = new Map<DiagramId, Readonly<Record<string, unknown>> | undefined>()
  const previousMetadata = new Map<DiagramId, Readonly<Record<string, unknown>> | undefined>()
  ids.forEach((id, index) => {
    const previous = getEntityMetadata(state, id)
    previousMetadata.set(id, previous)
    nextMetadata.set(id, { ...(previous ?? {}), zIndex: mode === "front" ? base + index + 1 : base - ids.length + index })
  })
  return createMetadataSnapshotPatch(ids, previousMetadata, nextMetadata)
}

function createMetadataSnapshotPatch(ids: ReadonlyArray<DiagramId>, previous: ReadonlyMap<DiagramId, Readonly<Record<string, unknown>> | undefined>, nextMetadata: ReadonlyMap<DiagramId, Readonly<Record<string, unknown>> | undefined>): Patch {
  return {
    apply: (state) => {
      for (const id of ids) setEntityMetadata(state, id, nextMetadata.get(id))
      return new Set(ids)
    },
    inverse: {
      apply: (state) => {
        for (const id of ids) setEntityMetadata(state, id, previous.get(id))
        return new Set(ids)
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createOrderPatchUnchecked(previous: MutableOrder, nextOrder: MutableOrder): Patch {
  return {
    apply: (state) => {
      state.order = cloneOrder(nextOrder)
      return new Set([...nextOrder.nodeIds, ...nextOrder.edgeIds, ...nextOrder.textIds, ...nextOrder.shapeIds])
    },
    inverse: {
      apply: (state) => {
        state.order = cloneOrder(previous)
        return new Set([...previous.nodeIds, ...previous.edgeIds, ...previous.textIds, ...previous.shapeIds])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createLayerPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, layer: string | undefined, layerRole: "background" | "normal" | "foreground" | undefined): Patch | null {
  const entries = ids.filter((id) => !isEntityLockedOrReadOnly(state, id) && hasEntity(state, id))
  if (!entries.length) return null
  const previous = new Map(entries.map((id) => [id, getEntityMetadata(state, id)]))
  return {
    apply: (next) => applyMetadataPatch(next, entries, { layer, layerRole }),
    inverse: {
      apply: (next) => {
        const changed = new Set<DiagramId>()
        for (const [id, metadata] of previous) {
          setEntityMetadata(next, id, metadata)
          changed.add(id)
        }
        return changed
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createKeyboardPatch(state: InternalState, command: DiagramKeyboardCommand, options: DiagramKeyboardOptions): Patch | null {
  const step = options.shiftKey ? options.largeStep ?? 10 : options.step ?? 1
  if (command === "delete") return createDeleteSelectionPatch(state)
  if (command === "escape") return createSelectionPatch(state.selection, { ids: [], primaryId: null })
  if (command === "undo" || command === "redo") return null
  const deltaByCommand: Record<string, DiagramPoint> = {
    "nudge-left": { x: -step, y: 0 },
    "nudge-right": { x: step, y: 0 },
    "nudge-up": { x: 0, y: -step },
    "nudge-down": { x: 0, y: step },
  }
  return createMovePatch(state, state.selection.ids, deltaByCommand[command] ?? { x: 0, y: 0 })
}

function createCreateEdgePatch(state: InternalState, edge: DiagramEdge): Patch | null {
  if (state.entities.edgesById.has(edge.id)) {
    return null
  }
  return {
    apply: (next) => {
      next.entities.edgesById.set(edge.id, edge)
      next.order.edgeIds.push(edge.id)
      next.versions.set(edge.id, 0)
      return new Set([edge.id])
    },
    inverse: createDeleteEntitiesPatch([edge.id]),
  }
}

function createDeleteSelectionPatch(state: InternalState): Patch | null {
  return createDeleteEntitiesPatch(expandDeletedIds(state, state.selection.ids))
}

function createDeleteEntitiesPatch(ids: ReadonlyArray<DiagramId>): Patch {
  let deleted: SerializedDiagramScene | null = null
  const patch: Patch = {
    apply: (next) => {
      const changed = new Set<DiagramId>()
      deleted = serializeScene({
        entities: {
          nodesById: pick(next.entities.nodesById, ids),
          edgesById: pick(next.entities.edgesById, ids),
          textsById: pick(next.entities.textsById, ids),
          shapesById: pick(next.entities.shapesById, ids),
          portsById: pick(next.entities.portsById, ids),
        },
        order: {
          nodeIds: next.order.nodeIds.filter((id) => ids.includes(id)),
          edgeIds: next.order.edgeIds.filter((id) => ids.includes(id)),
          textIds: next.order.textIds.filter((id) => ids.includes(id)),
          shapeIds: next.order.shapeIds.filter((id) => ids.includes(id)),
        },
        selection: next.selection,
        viewport: next.viewport,
        revision: next.revision,
      })
      for (const id of ids) {
        if (deleteEntity(next, id)) {
          changed.add(id)
        }
      }
      next.selection = EMPTY_SELECTION
      return changed
    },
    inverse: {
      apply: (next) => {
        if (!deleted) {
          return new Set()
        }
        return restoreSerialized(next, deleted)
      },
      inverse: undefined as unknown as Patch,
    },
  }
  return patch
}

function createSelectionPatch(previous: DiagramSelection, selection: DiagramSelection, mode: "replace" | "add" | "toggle" = "replace"): Patch | null {
  const nextSelection = normalizeSelectionByMode(previous, selection, mode)
  if (sameIds(previous.ids, nextSelection.ids) && previous.primaryId === nextSelection.primaryId) {
    return null
  }
  return {
    apply: (next) => {
      next.selection = nextSelection
      return new Set([...previous.ids, ...nextSelection.ids, "selection"])
    },
    inverse: {
      apply: (next) => {
        next.selection = previous
        return new Set([...previous.ids, ...nextSelection.ids, "selection"])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createEditTextPatch(state: InternalState, id: DiagramId, text: string): Patch | null {
  const previous = state.entities.textsById.get(id)
  if (!previous || previous.text === text) {
    return null
  }
  return {
    apply: (next) => {
      const entity = next.entities.textsById.get(id)
      if (!entity) {
        return new Set()
      }
      next.entities.textsById.set(id, { ...entity, text })
      return new Set([id])
    },
    inverse: createEditTextPatchUnchecked(id, previous.text),
  }
}

function createEditTextPatchUnchecked(id: DiagramId, text: string): Patch {
  const patch: Patch = {
    apply: (next) => {
      const entity = next.entities.textsById.get(id)
      if (!entity) {
        return new Set()
      }
      next.entities.textsById.set(id, { ...entity, text })
      return new Set([id])
    },
    inverse: undefined as unknown as Patch,
  }
  patch.inverse = patch
  return patch
}

function createViewportPatch(previous: DiagramViewport, viewport: Partial<DiagramViewport>): Patch | null {
  const nextViewport = { ...previous, ...viewport }
  if (sameViewport(previous, nextViewport)) {
    return null
  }
  return {
    apply: (next) => {
      next.viewport = nextViewport
      return new Set(["viewport"])
    },
    inverse: {
      apply: (next) => {
        next.viewport = previous
        return new Set(["viewport"])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createReplaceScenePatch(next: DiagramSceneInput, previous: SerializedDiagramScene): Patch {
  return {
    apply: (state) => {
      const previousIds = allEntityIds(state)
      const replacement = createInternalState(next)
      state.entities = replacement.entities
      state.order = replacement.order
      state.selection = replacement.selection
      state.viewport = replacement.viewport
      state.versions = replacement.versions
      return new Set([
        ...previousIds,
        ...replacement.order.nodeIds,
        ...replacement.order.edgeIds,
        ...replacement.order.textIds,
        ...replacement.order.shapeIds,
        ...replacement.entities.portsById.keys(),
      ])
    },
    inverse: {
      apply: (state) => {
        const previousIds = allEntityIds(state)
        const replacement = createInternalState(previous)
        state.entities = replacement.entities
        state.order = replacement.order
        state.selection = replacement.selection
        state.viewport = replacement.viewport
        state.versions = replacement.versions
        return new Set([
          ...previousIds,
          ...replacement.order.nodeIds,
          ...replacement.order.edgeIds,
          ...replacement.order.textIds,
          ...replacement.order.shapeIds,
          ...replacement.entities.portsById.keys(),
        ])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function expandDeletedIds(state: InternalState, ids: ReadonlyArray<DiagramId>): DiagramId[] {
  const deleted = new Set(ids.filter((id) => !isEntityNonDeletable(state, id) && !isEntityLockedOrReadOnly(state, id)))
  for (const id of [...deleted]) {
    if (state.entities.nodesById.has(id)) {
      for (const port of state.entities.portsById.values()) {
        if (port.nodeId === id) {
          deleted.add(port.id)
        }
      }
    }
  }
  for (const edge of state.entities.edgesById.values()) {
    if (deleted.has(edge.id)) {
      continue
    }
    if (endpointDeleted(edge.source, deleted) || endpointDeleted(edge.target, deleted)) {
      deleted.add(edge.id)
    }
  }
  return [...deleted]
}

function endpointDeleted(endpoint: DiagramEdgeEndpoint, deleted: ReadonlySet<DiagramId>): boolean {
  if (endpoint.kind === "point") {
    return false
  }
  if (endpoint.kind === "node") {
    return deleted.has(endpoint.nodeId)
  }
  return deleted.has(endpoint.portId)
}

function composePatches(first: Patch, second: Patch): Patch {
  const steps = [
    ...(first.steps ?? [first]),
    ...(second.steps ?? [second]),
  ]
  return {
    apply: (state) => {
      const changed = new Set<DiagramId>()
      for (const step of steps) {
        for (const id of step.apply(state)) {
          changed.add(id)
        }
      }
      return changed
    },
    inverse: undefined as unknown as Patch,
    steps,
  }
}

function cloneOrder(order: MutableOrder): MutableOrder {
  return { nodeIds: [...order.nodeIds], edgeIds: [...order.edgeIds], textIds: [...order.textIds], shapeIds: [...order.shapeIds] }
}

function ordersEqual(a: MutableOrder, b: MutableOrder): boolean {
  return sameIds(a.nodeIds, b.nodeIds) && sameIds(a.edgeIds, b.edgeIds) && sameIds(a.textIds, b.textIds) && sameIds(a.shapeIds, b.shapeIds)
}

function reorderIds(order: DiagramId[], ids: ReadonlyArray<DiagramId>, mode: "forward" | "backward" | "front" | "back"): void {
  if (order.length < 2 || !ids.length) {
    return
  }
  const selected = new Set(ids)
  if (mode === "front") {
    const moved = order.filter((id) => selected.has(id))
    order.splice(0, order.length, ...order.filter((id) => !selected.has(id)), ...moved)
    return
  }
  if (mode === "back") {
    const moved = order.filter((id) => selected.has(id))
    order.splice(0, order.length, ...moved, ...order.filter((id) => !selected.has(id)))
    return
  }
  const movingForward = mode === "forward"
  const start = movingForward ? order.length - 2 : 1
  const end = movingForward ? -1 : order.length
  const step = movingForward ? -1 : 1
  for (let index = start; index !== end; index += step) {
    const nextIndex = movingForward ? index + 1 : index - 1
    const current = order[index]
    const next = order[nextIndex]
    if (current !== undefined && next !== undefined && selected.has(current) && !selected.has(next)) {
      order[index] = next
      order[nextIndex] = current
    }
  }
}

function applyMetadataPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, patch: { layer?: string; layerRole?: "background" | "normal" | "foreground" }): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const id of ids) {
    const previous = getEntityMetadata(state, id) ?? {}
    setEntityMetadata(state, id, { ...previous, ...patch })
    changed.add(id)
  }
  return changed
}

function setEntityMetadata(state: InternalState, id: DiagramId, metadata: Readonly<Record<string, unknown>> | undefined): void {
  const node = state.entities.nodesById.get(id)
  if (node) { state.entities.nodesById.set(id, { ...node, metadata }); return }
  const edge = state.entities.edgesById.get(id)
  if (edge) { state.entities.edgesById.set(id, { ...edge, metadata }); return }
  const text = state.entities.textsById.get(id)
  if (text) { state.entities.textsById.set(id, { ...text, metadata }); return }
  const shape = state.entities.shapesById.get(id)
  if (shape) { state.entities.shapesById.set(id, { ...shape, metadata }); return }
  const port = state.entities.portsById.get(id)
  if (port) state.entities.portsById.set(id, { ...port, metadata })
}

function getEntityMetadata(state: InternalState, id: DiagramId): Readonly<Record<string, unknown>> | undefined {
  return state.entities.nodesById.get(id)?.metadata
    ?? state.entities.edgesById.get(id)?.metadata
    ?? state.entities.textsById.get(id)?.metadata
    ?? state.entities.shapesById.get(id)?.metadata
    ?? state.entities.portsById.get(id)?.metadata
}

function zIndex(metadata: Readonly<Record<string, unknown>> | undefined): number {
  return typeof metadata?.zIndex === "number" && Number.isFinite(metadata.zIndex) ? metadata.zIndex : 0
}

function allEntityIds(state: InternalState): DiagramId[] {
  return [
    ...state.order.edgeIds,
    ...state.order.shapeIds,
    ...state.order.nodeIds,
    ...state.order.textIds,
    ...state.entities.portsById.keys(),
  ]
}

function hasEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.edgesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id) || state.entities.portsById.has(id)
}

function isEntityLockedOrReadOnly(state: InternalState, id: DiagramId): boolean {
  const metadata = getEntityMetadata(state, id)
  return metadata?.locked === true || metadata?.readOnly === true
}

function isEntityNonDeletable(state: InternalState, id: DiagramId): boolean {
  return getEntityMetadata(state, id)?.nonDeletable === true
}

function layerRank(metadata: Readonly<Record<string, unknown>> | undefined): number {
  if (metadata?.layerRole === "background") return -1
  if (metadata?.layerRole === "foreground") return 1
  return 0
}

function boundsForIds(engine: DiagramEngine, ids: ReadonlyArray<DiagramId>): DiagramRect | null {
  const scene = engine.getScene()
  const rects = ids.map((id) => createEntityGeometry(id, scene.entities)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect))
  if (!rects.length) return null
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now()
}

function restoreSerialized(state: InternalState, scene: SerializedDiagramScene): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const node of scene.nodes) {
    state.entities.nodesById.set(node.id, node)
    pushUnique(state.order.nodeIds, node.id)
    state.versions.set(node.id, 0)
    changed.add(node.id)
  }
  for (const edge of scene.edges) {
    state.entities.edgesById.set(edge.id, edge)
    pushUnique(state.order.edgeIds, edge.id)
    state.versions.set(edge.id, 0)
    changed.add(edge.id)
  }
  for (const text of scene.texts) {
    state.entities.textsById.set(text.id, text)
    pushUnique(state.order.textIds, text.id)
    state.versions.set(text.id, 0)
    changed.add(text.id)
  }
  for (const shape of scene.shapes) {
    state.entities.shapesById.set(shape.id, shape)
    pushUnique(state.order.shapeIds, shape.id)
    state.versions.set(shape.id, 0)
    changed.add(shape.id)
  }
  for (const port of scene.ports) {
    state.entities.portsById.set(port.id, port)
    state.versions.set(port.id, 0)
    changed.add(port.id)
  }
  state.selection = scene.selection
  return changed
}

function deleteEntity(state: InternalState, id: DiagramId): boolean {
  let deleted = state.entities.nodesById.delete(id)
  deleted = state.entities.edgesById.delete(id) || deleted
  deleted = state.entities.textsById.delete(id) || deleted
  deleted = state.entities.shapesById.delete(id) || deleted
  deleted = state.entities.portsById.delete(id) || deleted
  state.order.nodeIds = state.order.nodeIds.filter((value) => value !== id)
  state.order.edgeIds = state.order.edgeIds.filter((value) => value !== id)
  state.order.textIds = state.order.textIds.filter((value) => value !== id)
  state.order.shapeIds = state.order.shapeIds.filter((value) => value !== id)
  state.versions.delete(id)
  return deleted
}

function addDependency(index: Map<DiagramId, Set<DiagramId>>, ownerId: DiagramId, dependentId: DiagramId): void {
  let dependents = index.get(ownerId)
  if (!dependents) {
    dependents = new Set<DiagramId>()
    index.set(ownerId, dependents)
  }
  dependents.add(dependentId)
}

function hitDistanceForGeometry(geometry: DiagramGeometry, point: DiagramPoint, radius: number): number | null {
  if (geometry.kind === "edge") {
    const edgeDistance = distanceToPath(point, geometry.path ?? [])
    const tolerance = Math.max(radius, 6)
    return edgeDistance <= tolerance ? edgeDistance : null
  }
  if (geometry.corners?.length) {
    if (pointInPolygon(point, geometry.corners)) return 0
    const edgeDistance = distanceToPath(point, [...geometry.corners, geometry.corners[0]!])
    return edgeDistance <= radius ? edgeDistance : null
  }
  if (!rectContainsPoint(geometry.hitBounds, point, radius)) {
    return null
  }
  return distance(point, rectPoint(geometry.hitBounds, point))
}

function pointInPolygon(point: DiagramPoint, polygon: ReadonlyArray<DiagramPoint>): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]!
    const b = polygon[previous]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function distanceToPath(point: DiagramPoint, path: ReadonlyArray<DiagramPoint>): number {
  if (path.length === 0) {
    return Number.POSITIVE_INFINITY
  }
  if (path.length === 1) {
    return distance(point, path[0]!)
  }
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < path.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, path[index]!, path[index + 1]!))
  }
  return best
}

function distanceToSegment(point: DiagramPoint, start: DiagramPoint, end: DiagramPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return distance(point, start)
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function rectPoint(rect: DiagramRect, point: DiagramPoint): DiagramPoint {
  return {
    x: Math.max(rect.x, Math.min(point.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(point.y, rect.y + rect.height)),
  }
}

function constrainAngle(point: DiagramPoint, angleDegrees: number): DiagramPoint {
  const length = Math.hypot(point.x, point.y)
  if (length === 0) {
    return point
  }
  const angle = Math.atan2(point.y, point.x)
  const step = angleDegrees * (Math.PI / 180)
  const constrained = Math.round(angle / step) * step
  return { x: Math.cos(constrained) * length, y: Math.sin(constrained) * length }
}

function normalizeSelectionByMode(previous: DiagramSelection, selection: DiagramSelection, mode: "replace" | "add" | "toggle"): DiagramSelection {
  if (mode === "replace") {
    return normalizeSelection(selection)
  }
  const ids = new Set(previous.ids)
  for (const id of selection.ids) {
    if (mode === "toggle" && ids.has(id)) {
      ids.delete(id)
    } else {
      ids.add(id)
    }
  }
  const nextIds = [...ids]
  return normalizeSelection({ ids: nextIds, primaryId: selection.primaryId ?? previous.primaryId ?? nextIds[0] ?? null })
}

function normalizeSelection(selection: Partial<DiagramSelection> | undefined): DiagramSelection {
  const ids = [...new Set(selection?.ids ?? [])]
  return {
    ids,
    primaryId: selection?.primaryId && ids.includes(selection.primaryId) ? selection.primaryId : ids[0] ?? null,
  }
}

function pick<Entity>(map: ReadonlyMap<DiagramId, Entity>, ids: ReadonlyArray<DiagramId>): Map<DiagramId, Entity> {
  const picked = new Map<DiagramId, Entity>()
  for (const id of ids) {
    const entity = map.get(id)
    if (entity) {
      picked.set(id, entity)
    }
  }
  return picked
}

function pushUnique(ids: DiagramId[], id: DiagramId): void {
  if (!ids.includes(id)) {
    ids.push(id)
  }
}

function sameIds(a: ReadonlyArray<DiagramId>, b: ReadonlyArray<DiagramId>): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function sameViewport(a: DiagramViewport, b: DiagramViewport): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.zoom === b.zoom
}

function isDefined<Value>(value: Value | undefined): value is Value {
  return value !== undefined
}
