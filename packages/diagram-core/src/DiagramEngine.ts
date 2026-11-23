import { createEntityGeometry, distance, inflateRect, rectContainsPoint, rectIntersects } from "./geometry.js"
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
  DiagramBatchOptions,
  DiagramBatchResult,
  DiagramDiagnostics,
  DiagramEdge,
  DiagramEdgeEndpoint,
  DiagramEntityKind,
  DiagramMetadata,
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
  DiagramTranslationSnapResult,
  DiagramSnapGuide,
  DiagramSubscriber,
  DiagramViewport,
  SerializedDiagramScene,
  DiagramDocument,
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
  private dependencyIndexRebuildCount = 0
  private dependencyEntityIds = new Set<DiagramId>()
  private portIdsByNode = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByNode = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByPort = new Map<DiagramId, Set<DiagramId>>()
  private dependencyEdgeEndpoints = new Map<DiagramId, readonly [DiagramEdgeEndpoint, DiagramEdgeEndpoint]>()
  private dependencyPortOwners = new Map<DiagramId, DiagramId>()

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

  getDocumentRevision(): number {
    return this.state.documentRevision
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

  dispatchBatch(commands: ReadonlyArray<DiagramCommand>, options: DiagramBatchOptions = {}): DiagramBatchResult {
    const failure = (reason: "revision-mismatch" | "invalid-command" | "unsupported-command", index: number | null, ids: DiagramId[] = []): DiagramBatchResult => ({
      ok: false, changed: false, revision: this.state.revision, documentRevision: this.state.documentRevision,
      failedCommandIndex: index, reason, affectedIds: [...new Set(ids)],
    })
    if (options.expectedRevision !== undefined && options.expectedRevision !== this.state.documentRevision) {
      return failure("revision-mismatch", null)
    }
    const draft = new DiagramEngine(serializeScene(this.store.getSnapshot()))
    draft.state.revision = this.state.revision
    draft.state.documentRevision = this.state.documentRevision
    draft.state.orderRevision = this.state.orderRevision
    const patches: Patch[] = []
    const affected = new Set<DiagramId>()
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!
      if (command.type === "undo" || command.type === "redo") return failure("unsupported-command", index)
      const patch = draft.createPatch(command)
      if (!patch) {
        if (isBatchNoOp(draft.state, command)) continue
        const ids = commandIds(command)
        const missing = ids.filter((id) => !draft.hasEntity(id))
        return failure("invalid-command", index, missing.length ? missing : ids)
      }
      const changed = draft.commitPatch(patch, false, null).changedIds
      if (changed.size) {
        patches.push(patch)
        for (const id of changed) affected.add(id)
      }
    }
    if (!patches.length) return { ok: true, changed: false, revision: this.state.revision, documentRevision: this.state.documentRevision, failedCommandIndex: null, reason: null, affectedIds: [] }
    let combined = patches[0]!
    for (let index = 1; index < patches.length; index += 1) combined = composePatches(combined, patches[index]!)
    let inverse = patches[patches.length - 1]!.inverse
    for (let index = patches.length - 2; index >= 0; index -= 1) inverse = composePatches(inverse, patches[index]!.inverse)
    combined.inverse = inverse
    const changed = this.commitPatch(combined, true, null).changedIds
    return { ok: true, changed: changed.size > 0, revision: this.state.revision, documentRevision: this.state.documentRevision, failedCommandIndex: null, reason: null, affectedIds: [...affected] }
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
    const port = context.snapToPorts === false ? null : this.nearestPort(point, context.radius ?? 12, context.excludeIds ?? new Set())
    if (port) {
      const geometry = this.getGeometry(port.id)
      if (geometry?.point) {
        return { point: geometry.point, snapped: true, source: "port" }
      }
    }
    const aligned = context.snapToAlignment === false ? null : this.snapToAlignment(point, context.radius ?? 6, context.excludeIds)
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

  snapTranslation(selection: DiagramSelection, delta: DiagramPoint, context: DiagramSnapContext = {}): DiagramTranslationSnapResult {
    const primaryId = selection.primaryId ?? selection.ids[0]
    const geometry = primaryId ? this.getGeometry(primaryId) : null
    const origin = geometry ? { x: geometry.bounds.x, y: geometry.bounds.y } : { x: 0, y: 0 }
    const radius = context.radius ?? 6
    const excludeIds = new Set([...(context.excludeIds ?? []), ...selection.ids])
    const proposed = { x: origin.x + delta.x, y: origin.y + delta.y }
    const guides: DiagramSnapGuide[] = []
    let point = proposed
    let source: DiagramSnapResult["source"] = null
    let prioritySnap = false
    const portSnap = context.snapToPorts === false && !context.custom
      ? { point, snapped: false, source: null as DiagramSnapResult["source"] }
      : this.snapPoint(point, { ...context, gridSize: undefined, radius, excludeIds, snapToAlignment: false })
    if (portSnap.source === "port" || portSnap.source === "custom") {
      point = portSnap.point
      source = portSnap.source
      prioritySnap = true
    }
    if (!prioritySnap && context.snapToAlignment !== false && geometry) {
      const aligned = this.findTranslationAlignment(geometry.bounds, point, radius, excludeIds)
      if (aligned) {
        point = { x: point.x + aligned.dx, y: point.y + aligned.dy }
        guides.push(...aligned.guides)
        source ??= "alignment"
      }
    }
    if (!prioritySnap && context.snapToEqualSpacing && geometry) {
      const alignedAxes = new Set(guides.filter((guide) => guide.kind === "alignment").map((guide) => guide.axis))
      const spaced = this.findEqualSpacing(geometry.bounds, point, radius, excludeIds, alignedAxes)
      if (spaced) {
        point = { x: point.x + spaced.dx, y: point.y + spaced.dy }
        guides.push(...spaced.guides)
        source ??= "equal-spacing"
      }
    }
    if (!prioritySnap && context.gridSize && context.gridSize > 0) {
      const snappedAxes = new Set(guides.map((guide) => guide.axis))
      let gridChanged = false
      if (!snappedAxes.has("x")) {
        const x = Math.round(point.x / context.gridSize) * context.gridSize
        gridChanged ||= x !== point.x
        point = { ...point, x }
      }
      if (!snappedAxes.has("y")) {
        const y = Math.round(point.y / context.gridSize) * context.gridSize
        gridChanged ||= y !== point.y
        point = { ...point, y }
      }
      if (gridChanged) source ??= "grid"
    }
    return {
      point: { x: point.x - origin.x, y: point.y - origin.y },
      snapped: source !== null,
      source,
      guides: Object.freeze(guides.map((guide) => Object.freeze({
        ...guide,
        start: Object.freeze({ ...guide.start }),
        end: Object.freeze({ ...guide.end }),
      }))),
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
    return ids.some((id) => this.isEntityTranslatable(id) && !this.isEntityLockedOrReadOnly(id))
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
      spatialIndexRebuildCount: this.spatialIndex.getRebuildCount(),
      spatialIndexUpdateCount: this.spatialIndex.getUpdateCount(),
      dependencyIndexRebuildCount: this.dependencyIndexRebuildCount,
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

  serializeDocument(options: { includeView?: boolean } = {}): DiagramDocument {
    const scene = this.serialize()
    return {
      format: "affino-diagram",
      version: 1,
      content: { nodes: scene.nodes, edges: scene.edges, texts: scene.texts, shapes: scene.shapes, ports: scene.ports },
      ...(options.includeView === false ? {} : { view: { viewport: scene.viewport, selection: scene.selection } }),
    }
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
    if (patch.documentChanged !== false) this.state.documentRevision += 1
    if (patch.orderChanged === true) this.state.orderRevision += 1
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
    if (this.dependencyIndexReady) {
      const structuralChange = [...changedIds].some((id) => this.dependencyEntityIds.has(id) !== this.hasEntity(id))
      if (structuralChange) {
        this.dependencyIndexReady = false
      } else {
      for (const id of changedIds) {
        const oldEdge = this.dependencyEdgeEndpoints.get(id)
        const edge = this.state.entities.edgesById.get(id)
        if (oldEdge && (!edge || oldEdge[0] !== edge.source && JSON.stringify(oldEdge[0]) !== JSON.stringify(edge.source) || oldEdge[1] !== edge.target && JSON.stringify(oldEdge[1]) !== JSON.stringify(edge.target))) {
          this.removeEdgeDependencies(id, oldEdge)
          this.dependencyEdgeEndpoints.delete(id)
        }
        if (edge && !this.dependencyEdgeEndpoints.has(id)) {
          const endpoints = [edge.source, edge.target] as const
          this.addEdgeDependencies(id, endpoints)
          this.dependencyEdgeEndpoints.set(id, endpoints)
        }
        const oldOwner = this.dependencyPortOwners.get(id)
        const port = this.state.entities.portsById.get(id)
        if (oldOwner !== port?.nodeId) {
          const attachedEdges = [...(this.edgeIdsByPort.get(id) ?? [])]
          for (const edgeId of attachedEdges) {
            const endpoints = this.dependencyEdgeEndpoints.get(edgeId)
            if (endpoints) this.removeEdgeDependencies(edgeId, endpoints)
          }
          if (oldOwner) removeDependency(this.portIdsByNode, oldOwner, id)
          if (!port) this.dependencyPortOwners.delete(id)
          else {
            this.dependencyPortOwners.set(id, port.nodeId)
            addDependency(this.portIdsByNode, port.nodeId, id)
          }
          for (const edgeId of attachedEdges) {
            const endpoints = this.dependencyEdgeEndpoints.get(edgeId)
            if (endpoints) this.addEdgeDependencies(edgeId, endpoints)
          }
        }
        const exists = this.hasEntity(id)
        if (exists) this.dependencyEntityIds.add(id)
        else this.dependencyEntityIds.delete(id)
      }
      return
      }
    }
    this.dependencyIndexRebuildCount += 1
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
    this.dependencyEdgeEndpoints.clear()
    this.dependencyPortOwners.clear()
    for (const port of this.state.entities.portsById.values()) {
      this.dependencyPortOwners.set(port.id, port.nodeId)
      addDependency(this.portIdsByNode, port.nodeId, port.id)
    }
    for (const edge of this.state.entities.edgesById.values()) {
      const endpoints = [edge.source, edge.target] as const
      this.dependencyEdgeEndpoints.set(edge.id, endpoints)
      this.addEdgeDependencies(edge.id, endpoints)
    }
    this.dependencyIndexReady = true
  }

  private addEdgeDependencies(id: DiagramId, endpoints: readonly [DiagramEdgeEndpoint, DiagramEdgeEndpoint]): void {
    for (const endpoint of endpoints) {
      if (endpoint.kind === "node") addDependency(this.edgeIdsByNode, endpoint.nodeId, id)
      else if (endpoint.kind === "port") {
        addDependency(this.edgeIdsByPort, endpoint.portId, id)
        const owner = this.dependencyPortOwners.get(endpoint.portId)
        if (owner) addDependency(this.edgeIdsByNode, owner, id)
      }
    }
  }

  private removeEdgeDependencies(id: DiagramId, endpoints: readonly [DiagramEdgeEndpoint, DiagramEdgeEndpoint]): void {
    for (const endpoint of endpoints) {
      if (endpoint.kind === "node") removeDependency(this.edgeIdsByNode, endpoint.nodeId, id)
      else if (endpoint.kind === "port") {
        removeDependency(this.edgeIdsByPort, endpoint.portId, id)
        const owner = this.dependencyPortOwners.get(endpoint.portId)
        if (owner) removeDependency(this.edgeIdsByNode, owner, id)
      }
    }
  }

  private getGeometry(id: DiagramId): DiagramGeometry | null {
    return this.geometryService.get(id, this.state.entities, this.state.versions.get(id) ?? 0)
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
      case "createNode":
        return createCreateEntityPatch(this.state, command.node)
      case "createPort":
        return createCreatePortPatch(this.state, command.port)
      case "deleteEntities":
        return createDeleteEntitiesCommandPatch(this.state, command.ids)
      case "reconnectEdgeEndpoint":
        return createReconnectEdgeEndpointPatch(this.state, command.id, command.endpoint, command.connection)
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
        try { validateSceneInput(command.clipboard) } catch { return null }
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
      case "setEntityMetadata":
        return createEntityMetadataPatch(this.state, command.id, command.metadata)
      case "updateEntities":
        return createEntityUpdatesPatch(this.state, command.updates)
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

  private findTranslationAlignment(
    sourceBounds: DiagramRect,
    targetOrigin: DiagramPoint,
    radius: number,
    excludeIds: ReadonlySet<DiagramId>,
  ): { dx: number; dy: number; guides: DiagramSnapGuide[] } | null {
    const moving = { ...sourceBounds, x: targetOrigin.x, y: targetOrigin.y }
    let bestX: { delta: number; coordinate: number; start: number; end: number; startIsMoving: boolean; endIsMoving: boolean } | null = null
    let bestY: { delta: number; coordinate: number; start: number; end: number; startIsMoving: boolean; endIsMoving: boolean } | null = null
    const searchBounds = inflateRect(moving, radius)
    for (const fixedId of this.queryEntities({ bounds: searchBounds, kinds: ["node", "shape", "text"] })) {
      if (excludeIds.has(fixedId)) continue
      const fixed = this.getGeometry(fixedId)?.bounds
      if (!fixed) continue
      const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
      const fixedX = [fixed.x, fixed.x + fixed.width / 2, fixed.x + fixed.width]
      for (const [index, value] of movingX.entries()) {
        for (const coordinate of fixedX) {
          const delta = coordinate - value
          if (Math.abs(delta) <= radius && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
            bestX = { delta, coordinate, start: Math.min(moving.y, fixed.y), end: Math.max(moving.y + moving.height, fixed.y + fixed.height), startIsMoving: moving.y <= fixed.y, endIsMoving: moving.y + moving.height >= fixed.y + fixed.height }
          }
        }
      }
      const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]
      const fixedY = [fixed.y, fixed.y + fixed.height / 2, fixed.y + fixed.height]
      for (const value of movingY) {
        for (const coordinate of fixedY) {
          const delta = coordinate - value
          if (Math.abs(delta) <= radius && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
            bestY = { delta, coordinate, start: Math.min(moving.x, fixed.x), end: Math.max(moving.x + moving.width, fixed.x + fixed.width), startIsMoving: moving.x <= fixed.x, endIsMoving: moving.x + moving.width >= fixed.x + fixed.width }
          }
        }
      }
    }
    if (!bestX && !bestY) return null
    const dx = bestX?.delta ?? 0
    const dy = bestY?.delta ?? 0
    const guides: DiagramSnapGuide[] = []
    if (bestX) guides.push({ kind: "alignment", axis: "x", start: { x: bestX.coordinate, y: bestX.start + (bestX.startIsMoving ? dy : 0) }, end: { x: bestX.coordinate, y: bestX.end + (bestX.endIsMoving ? dy : 0) } })
    if (bestY) guides.push({ kind: "alignment", axis: "y", start: { x: bestY.start + (bestY.startIsMoving ? dx : 0), y: bestY.coordinate }, end: { x: bestY.end + (bestY.endIsMoving ? dx : 0), y: bestY.coordinate } })
    return { dx, dy, guides }
  }

  private findEqualSpacing(
    sourceBounds: DiagramRect,
    targetOrigin: DiagramPoint,
    radius: number,
    excludeIds: ReadonlySet<DiagramId>,
    excludeAxes: ReadonlySet<"x" | "y">,
  ): { dx: number; dy: number; guides: DiagramSnapGuide[] } | null {
    const moving = { ...sourceBounds, x: targetOrigin.x, y: targetOrigin.y }
    const reach = Math.max(128, radius * 16, sourceBounds.width * 8, sourceBounds.height * 8)
    const fixed = this.queryEntities({
      bounds: { x: moving.x - reach, y: moving.y - reach, width: moving.width + reach * 2, height: moving.height + reach * 2 },
      kinds: ["node", "shape", "text"],
    })
      .filter((id) => !excludeIds.has(id))
      .map((id) => this.getGeometry(id)?.bounds)
      .filter((bounds): bounds is DiagramRect => Boolean(bounds))
    let best: { axis: "x" | "y"; delta: number; before: DiagramRect; after: DiagramRect } | null = null
    if (!excludeAxes.has("x")) {
      const horizontal = fixed.filter((rect) => rangesOverlap(rect.y, rect.y + rect.height, moving.y, moving.y + moving.height))
      const before = horizontal.filter((rect) => rect.x + rect.width <= moving.x).sort((a, b) => b.x + b.width - (a.x + a.width))[0]
      const after = horizontal.filter((rect) => rect.x >= moving.x + moving.width).sort((a, b) => a.x - b.x)[0]
      if (before && after) {
        const delta = ((after.x - moving.x - moving.width) - (moving.x - before.x - before.width)) / 2
        if (Math.abs(delta) <= radius) best = { axis: "x", delta, before, after }
      }
    }
    if (!excludeAxes.has("y")) {
      const vertical = fixed.filter((rect) => rangesOverlap(rect.x, rect.x + rect.width, moving.x, moving.x + moving.width))
      const before = vertical.filter((rect) => rect.y + rect.height <= moving.y).sort((a, b) => b.y + b.height - (a.y + a.height))[0]
      const after = vertical.filter((rect) => rect.y >= moving.y + moving.height).sort((a, b) => a.y - b.y)[0]
      if (before && after) {
        const delta = ((after.y - moving.y - moving.height) - (moving.y - before.y - before.height)) / 2
        if (Math.abs(delta) <= radius && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis: "y", delta, before, after }
      }
    }
    if (!best) return null
    if (best.axis === "x") {
      const centerY = moving.y + moving.height / 2
      return {
        dx: best.delta,
        dy: 0,
        guides: [
          { kind: "equal-spacing", axis: "x", start: { x: best.before.x + best.before.width, y: centerY }, end: { x: moving.x + best.delta, y: centerY } },
          { kind: "equal-spacing", axis: "x", start: { x: moving.x + moving.width + best.delta, y: centerY }, end: { x: best.after.x, y: centerY } },
        ],
      }
    }
    const centerX = moving.x + moving.width / 2
    return {
      dx: 0,
      dy: best.delta,
      guides: [
        { kind: "equal-spacing", axis: "y", start: { x: centerX, y: best.before.y + best.before.height }, end: { x: centerX, y: moving.y + best.delta } },
        { kind: "equal-spacing", axis: "y", start: { x: centerX, y: moving.y + moving.height + best.delta }, end: { x: centerX, y: best.after.y } },
      ],
    }
  }

  private createOrderedIds(): DiagramId[] {
    if (this.orderedIdsRevision === this.state.orderRevision) {
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
    this.orderedIdsRevision = this.state.orderRevision
    return this.orderedIdsCache
  }

  private createOrderIndex(): Map<DiagramId, number> {
    if (this.orderIndexRevision !== this.state.orderRevision) {
      this.orderIndexCache = new Map(this.createOrderedIds().map((id, index) => [id, index]))
      this.orderIndexRevision = this.state.orderRevision
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

  private isEntityTranslatable(id: DiagramId): boolean {
    if (this.state.entities.portsById.has(id)) return false
    const edge = this.state.entities.edgesById.get(id)
    if (edge) return edge.source.kind === "point" || edge.target.kind === "point" || Boolean(edge.points?.length)
    return this.state.entities.nodesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.shapesById.has(id)
  }
}

function isBatchNoOp(state: InternalState, command: DiagramCommand): boolean {
  if (command.type === "updateEntities" && command.updates.every((update) => {
    if (!hasEntity(state, update.id)) return false
    const current = getEntityMetadata(state, update.id) ?? {}
    return update.metadata === undefined || Object.entries(update.metadata).every(([key, value]) => Object.is(current[key], value))
  })) return true
  if (command.type === "setSelection" && command.selection.ids.length === state.selection.ids.length && command.selection.ids.every((id, index) => id === state.selection.ids[index]) && (command.selection.primaryId ?? null) === state.selection.primaryId) return true
  return false
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

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && aEnd >= bStart
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

export function deserializeDiagramDocument(input: DiagramDocument | SerializedDiagramScene): DiagramSceneInput {
  if (!input || typeof input !== "object") throw new TypeError("Invalid diagram document")
  if ("format" in input) {
    if (input.format !== "affino-diagram" || input.version !== 1 || !input.content || ![input.content.nodes, input.content.edges, input.content.texts, input.content.shapes, input.content.ports].every(Array.isArray)) {
      throw new TypeError("Unsupported or invalid diagram document")
    }
    const view = input.view ?? {}
    return validateSceneInput({ ...input.content, ...(view.selection ? { selection: view.selection } : {}), ...(view.viewport ? { viewport: view.viewport } : {}) })
  }
  return validateSceneInput(input)
}

function validateSceneInput(scene: DiagramSceneInput): DiagramSceneInput {
  const nodesInput = scene.nodes ?? []
  const edgesInput = scene.edges ?? []
  const textsInput = scene.texts ?? []
  const shapesInput = scene.shapes ?? []
  const portsInput = scene.ports ?? []
  if (![nodesInput, edgesInput, textsInput, shapesInput, portsInput].every(Array.isArray)) throw new TypeError("Invalid diagram scene collections")
  const ids = new Set<string>()
  for (const entity of [...nodesInput, ...edgesInput, ...textsInput, ...shapesInput, ...portsInput]) {
    if (!entity || typeof entity.id !== "string" || !entity.id || ids.has(entity.id)) throw new TypeError("Diagram entity IDs must be non-empty and globally unique")
    ids.add(entity.id)
  }
  const nodes = new Set(nodesInput.map((node) => node.id))
  const ports = new Map(portsInput.map((port) => [port.id, port]))
  for (const node of nodesInput) if (![node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) || node.width < 0 || node.height < 0) throw new TypeError(`Invalid geometry for node ${node.id}`)
  for (const port of portsInput) if (!nodes.has(port.nodeId) || ![port.x, port.y, port.radius ?? 0].every(Number.isFinite)) throw new TypeError(`Invalid port ${port.id}`)
  for (const node of nodesInput) if ((node.portIds ?? []).some((id) => ports.get(id)?.nodeId !== node.id)) throw new TypeError(`Invalid port reference on node ${node.id}`)
  for (const text of textsInput) if (![text.x, text.y, text.width ?? 0, text.height ?? 0, text.fontSize ?? 0, text.rotation ?? 0].every(Number.isFinite)) throw new TypeError(`Invalid geometry for text ${text.id}`)
  for (const shape of shapesInput) if (![shape.x, shape.y, shape.width, shape.height, shape.rotation ?? 0].every(Number.isFinite) || shape.width < 0 || shape.height < 0) throw new TypeError(`Invalid geometry for shape ${shape.id}`)
  for (const edge of edgesInput) {
    const validEndpoint = (endpoint: DiagramEdgeEndpoint) => endpoint.kind === "point" ? Number.isFinite(endpoint.point.x) && Number.isFinite(endpoint.point.y) : endpoint.kind === "node" ? nodes.has(endpoint.nodeId) : endpoint.kind === "port" && ports.has(endpoint.portId)
    if (!validEndpoint(edge.source) || !validEndpoint(edge.target) || !(edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) throw new TypeError(`Invalid edge ${edge.id}`)
  }
  if (scene.viewport && (![scene.viewport.x, scene.viewport.y, scene.viewport.width, scene.viewport.height, scene.viewport.zoom].filter((value) => value !== undefined).every(Number.isFinite) || (scene.viewport.zoom !== undefined && scene.viewport.zoom <= 0))) throw new TypeError("Invalid diagram viewport")
  const selectionIds = scene.selection?.ids ?? []
  if (selectionIds.some((id) => !ids.has(id))) throw new TypeError("Diagram selection contains an unknown entity")
  return { ...scene, nodes: nodesInput, edges: edgesInput, texts: textsInput, shapes: shapesInput, ports: portsInput }
}

function createMovePatch(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch | null {
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  const movableIds = ids.filter((id) => !isEntityLockedOrReadOnly(state, id) && (
    state.entities.nodesById.has(id)
    || isEdgeTranslatable(state.entities.edgesById.get(id))
    || state.entities.textsById.has(id)
    || state.entities.shapesById.has(id)
  ))
  if (!movableIds.length) {
    return null
  }
  return {
    apply: (next) => applyMoveDelta(next, movableIds, delta),
    inverse: createMovePatchUnchecked(movableIds, { x: -delta.x, y: -delta.y }),
  }
}

function isEdgeTranslatable(edge: DiagramEdge | undefined): boolean {
  return Boolean(edge && (edge.source.kind === "point" || edge.target.kind === "point" || edge.points?.length))
}

function createMovePatchUnchecked(ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch {
  return {
    apply: (next) => applyMoveDelta(next, ids, delta),
    inverse: undefined as unknown as Patch,
  }
}

function applyMoveDelta(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  const translate = (point: DiagramPoint): DiagramPoint => ({ x: point.x + delta.x, y: point.y + delta.y })
  for (const id of ids) {
    const node = state.entities.nodesById.get(id)
    if (node) {
      state.entities.nodesById.set(id, { ...node, x: node.x + delta.x, y: node.y + delta.y })
      changed.add(id)
      continue
    }
    const edge = state.entities.edgesById.get(id)
    if (edge) {
      state.entities.edgesById.set(id, {
        ...edge,
        source: edge.source.kind === "point" ? { kind: "point", point: translate(edge.source.point) } : edge.source,
        target: edge.target.kind === "point" ? { kind: "point", point: translate(edge.target.point) } : edge.target,
        points: edge.points?.map(translate),
      })
      changed.add(id)
      continue
    }
    const text = state.entities.textsById.get(id)
    if (text) {
      state.entities.textsById.set(id, { ...text, x: text.x + delta.x, y: text.y + delta.y })
      changed.add(id)
      continue
    }
    const shape = state.entities.shapesById.get(id)
    if (shape) {
      state.entities.shapesById.set(id, { ...shape, x: shape.x + delta.x, y: shape.y + delta.y })
      changed.add(id)
    }
  }
  return changed
}

function createMoveEdgeEndpointPatch(state: InternalState, id: DiagramId, endpoint: "source" | "target", point: DiagramPoint): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
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

function createEntityMetadataPatch(state: InternalState, id: DiagramId, metadata: DiagramMetadata | undefined): Patch | null {
  if (!hasEntity(state, id)) return null
  const previousMetadata = getEntityMetadata(state, id)
  const nextMetadata = metadata === undefined ? undefined : { ...metadata }
  if (metadataEqual(previousMetadata, nextMetadata)) return null
  return createMetadataSnapshotPatch(
    [id],
    new Map([[id, previousMetadata]]),
    new Map([[id, nextMetadata]]),
  )
}

function createEntityUpdatesPatch(
  state: InternalState,
  updates: ReadonlyArray<{ id: DiagramId; metadata?: Readonly<Record<string, unknown>> }>,
): Patch | null {
  const ids: DiagramId[] = []
  const previous = new Map<DiagramId, Readonly<Record<string, unknown>> | undefined>()
  const next = new Map<DiagramId, Readonly<Record<string, unknown>> | undefined>()
  for (const update of updates) {
    if (!hasEntity(state, update.id)) continue
    const original = previous.has(update.id) ? previous.get(update.id) : getEntityMetadata(state, update.id)
    if (!previous.has(update.id)) {
      ids.push(update.id)
      previous.set(update.id, original)
    }
    const current = next.has(update.id) ? next.get(update.id) : original
    const merged = update.metadata === undefined ? current : { ...(current ?? {}), ...update.metadata }
    next.set(update.id, merged)
  }
  const changedIds = ids.filter((id) => !metadataEqual(previous.get(id), next.get(id)))
  if (changedIds.length === 0) return null
  return createMetadataSnapshotPatch(
    changedIds,
    new Map(changedIds.map((id) => [id, previous.get(id)])),
    new Map(changedIds.map((id) => [id, next.get(id)])),
  )
}

function metadataEqual(
  first: Readonly<Record<string, unknown>> | undefined,
  second: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (first === second) return true
  if (first === undefined || second === undefined) return false
  const firstKeys = Object.keys(first)
  const secondKeys = Object.keys(second)
  return firstKeys.length === secondKeys.length && firstKeys.every((key) => first[key] === second[key])
}

function createMetadataSnapshotPatch(ids: ReadonlyArray<DiagramId>, previous: ReadonlyMap<DiagramId, Readonly<Record<string, unknown>> | undefined>, nextMetadata: ReadonlyMap<DiagramId, Readonly<Record<string, unknown>> | undefined>): Patch {
  return {
    orderChanged: true,
    apply: (state) => {
      for (const id of ids) setEntityMetadata(state, id, nextMetadata.get(id))
      return new Set(ids)
    },
    inverse: {
      orderChanged: true,
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
    orderChanged: true,
    apply: (state) => {
      state.order = cloneOrder(nextOrder)
      return new Set([...nextOrder.nodeIds, ...nextOrder.edgeIds, ...nextOrder.textIds, ...nextOrder.shapeIds])
    },
    inverse: {
      orderChanged: true,
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
  if (!isUniqueId(state, edge.id) || !isValidEdge(state, edge)) {
    return null
  }
  return {
    orderChanged: true,
    apply: (next) => {
      next.entities.edgesById.set(edge.id, edge)
      next.order.edgeIds.push(edge.id)
      next.versions.set(edge.id, 0)
      return new Set([edge.id])
    },
    inverse: createDeleteEntitiesPatch([edge.id]),
  }
}

function createCreateEntityPatch(state: InternalState, node: import("./types.js").DiagramNode): Patch | null {
  if (!isUniqueId(state, node.id) || Boolean(node.portIds?.length) || ![node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) || node.width < 0 || node.height < 0) return null
  return {
    orderChanged: true,
    apply: (next) => { next.entities.nodesById.set(node.id, node); next.order.nodeIds.push(node.id); next.versions.set(node.id, 0); return new Set([node.id]) },
    inverse: createDeleteEntitiesPatch([node.id]),
  }
}

function createCreatePortPatch(state: InternalState, port: import("./types.js").DiagramPort): Patch | null {
  const owner = state.entities.nodesById.get(port.nodeId)
  if (!owner || isEntityLockedOrReadOnly(state, owner.id) || !isUniqueId(state, port.id) || !Number.isFinite(port.x) || !Number.isFinite(port.y) || (port.radius !== undefined && (!Number.isFinite(port.radius) || port.radius < 0))) return null
  const previousPorts = [...(owner.portIds ?? [])]
  return {
    orderChanged: true,
    apply: (next) => {
      next.entities.portsById.set(port.id, port)
      next.entities.nodesById.set(owner.id, { ...next.entities.nodesById.get(owner.id)!, portIds: [...new Set([...previousPorts, port.id])] })
      next.versions.set(port.id, 0)
      return new Set([port.id, owner.id])
    },
    inverse: {
      orderChanged: true,
      apply: (next) => { next.entities.portsById.delete(port.id); next.entities.nodesById.set(owner.id, { ...next.entities.nodesById.get(owner.id)!, portIds: previousPorts }); return new Set([port.id, owner.id]) },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createDeleteEntitiesCommandPatch(state: InternalState, ids: ReadonlyArray<DiagramId>): Patch | null {
  if (!ids.length || ids.some((id) => !hasEntity(state, id))) return null
  const cascade = expandDeletedIds(state, ids)
  const deleting = new Set(cascade)
  for (const id of deleting) {
    if (state.entities.nodesById.has(id)) {
      for (const port of state.entities.portsById.values()) if (port.nodeId === id && !deleting.has(port.id)) return null
      for (const edge of state.entities.edgesById.values()) if (endpointDeleted(edge.source, deleting) || endpointDeleted(edge.target, deleting)) if (!deleting.has(edge.id)) return null
    }
  }
  if (cascade.length !== new Set(cascade).size || cascade.some((id) => isEntityNonDeletable(state, id) || isEntityLockedOrReadOnly(state, id))) return null
  if (ids.some((id) => isEntityNonDeletable(state, id) || isEntityLockedOrReadOnly(state, id))) return null
  return createDeleteEntitiesPatch(cascade)
}

function createReconnectEdgeEndpointPatch(state: InternalState, id: DiagramId, endpoint: "source" | "target", connection: DiagramEdgeEndpoint): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id) || !isValidEndpoint(state, connection)) return null
  const previous = edge[endpoint]
  if (JSON.stringify(previous) === JSON.stringify(connection)) return null
  return {
    apply: (next) => { const current = next.entities.edgesById.get(id); if (!current) return new Set(); next.entities.edgesById.set(id, { ...current, [endpoint]: connection }); return new Set([id]) },
    inverse: { apply: (next) => { const current = next.entities.edgesById.get(id); if (!current) return new Set(); next.entities.edgesById.set(id, { ...current, [endpoint]: previous }); return new Set([id]) }, inverse: undefined as unknown as Patch },
  }
}

function isUniqueId(state: InternalState, id: DiagramId): boolean { return typeof id === "string" && id.length > 0 && !hasEntity(state, id) }
function isValidEndpoint(state: InternalState, endpoint: DiagramEdgeEndpoint): boolean {
  if (endpoint.kind === "point") return Number.isFinite(endpoint.point.x) && Number.isFinite(endpoint.point.y)
  if (endpoint.kind === "node") return state.entities.nodesById.has(endpoint.nodeId)
  const port = state.entities.portsById.get(endpoint.portId)
  return Boolean(port && state.entities.nodesById.has(port.nodeId))
}
function isValidEdge(state: InternalState, edge: DiagramEdge): boolean {
  return isValidEndpoint(state, edge.source) && isValidEndpoint(state, edge.target) && (edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}
function commandIds(command: DiagramCommand): DiagramId[] {
  if ("id" in command) return [command.id]
  if ("ids" in command) return [...command.ids]
  if (command.type === "createEdge") return [command.edge.id]
  if (command.type === "createNode") return [command.node.id]
  if (command.type === "createPort") return [command.port.id, command.port.nodeId]
  if (command.type === "updateEntities") return command.updates.map((update) => update.id)
  return []
}

function createDeleteSelectionPatch(state: InternalState): Patch | null {
  const candidates = state.selection.ids.filter((id) => hasEntity(state, id) && !isEntityNonDeletable(state, id) && !isEntityLockedOrReadOnly(state, id))
  const safe = candidates.filter((id) => {
    const node = state.entities.nodesById.get(id)
    if (node) {
      if ([...state.entities.portsById.values()].some((port) => port.nodeId === id && (isEntityNonDeletable(state, port.id) || isEntityLockedOrReadOnly(state, port.id)))) return false
      if ([...state.entities.edgesById.values()].some((edge) => (endpointDeleted(edge.source, new Set([id])) || endpointDeleted(edge.target, new Set([id]))) && (isEntityNonDeletable(state, edge.id) || isEntityLockedOrReadOnly(state, edge.id)))) return false
    }
    return true
  })
  const deleted = expandDeletedIds(state, safe)
  return deleted.length ? createDeleteEntitiesPatch(deleted) : null
}

function createDeleteEntitiesPatch(ids: ReadonlyArray<DiagramId>): Patch {
  let deleted: SerializedDiagramScene | null = null
  let deletedOrder: MutableOrder | null = null
  let deletedPortOrder: DiagramId[] | null = null
  let deletedPortOwners = new Map<DiagramId, import("./types.js").DiagramNode>()
  const patch: Patch = {
    orderChanged: true,
    apply: (next) => {
      const changed = new Set<DiagramId>()
      deletedOrder = cloneOrder(next.order)
      deletedPortOrder = [...next.entities.portsById.keys()]
      deletedPortOwners = new Map()
      for (const id of ids) {
        const port = next.entities.portsById.get(id)
        const owner = port && next.entities.nodesById.get(port.nodeId)
        if (port && owner) {
          deletedPortOwners.set(owner.id, owner)
          next.entities.nodesById.set(owner.id, { ...owner, portIds: (owner.portIds ?? []).filter((portId) => portId !== id) })
          changed.add(owner.id)
        }
      }
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
      orderChanged: true,
      apply: (next) => {
        if (!deleted) {
          return new Set()
        }
        const restored = restoreSerialized(next, deleted)
        for (const [id, node] of deletedPortOwners) {
          next.entities.nodesById.set(id, node)
          restored.add(id)
        }
        if (deletedOrder) next.order = cloneOrder(deletedOrder)
        if (deletedPortOrder) next.entities.portsById = new Map(deletedPortOrder.flatMap((id) => { const port = next.entities.portsById.get(id); return port ? [[id, port] as const] : [] }))
        return restored
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
    documentChanged: false,
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
    documentChanged: false,
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
    orderChanged: true,
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
        if (port.nodeId === id && !isEntityNonDeletable(state, port.id) && !isEntityLockedOrReadOnly(state, port.id)) {
          deleted.add(port.id)
        }
      }
    }
  }
  for (const edge of state.entities.edgesById.values()) {
    if (deleted.has(edge.id)) {
      continue
    }
    if ((endpointDeleted(edge.source, deleted) || endpointDeleted(edge.target, deleted)) && !isEntityNonDeletable(state, edge.id) && !isEntityLockedOrReadOnly(state, edge.id)) {
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
    documentChanged: first.documentChanged !== false || second.documentChanged !== false,
    orderChanged: first.orderChanged === true || second.orderChanged === true,
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

function removeDependency(index: Map<DiagramId, Set<DiagramId>>, ownerId: DiagramId, dependentId: DiagramId): void {
  const dependents = index.get(ownerId)
  if (!dependents) return
  dependents.delete(dependentId)
  if (!dependents.size) index.delete(ownerId)
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
