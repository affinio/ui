import { composeDiagramAffine, createDiagramGeometryResolutionCache, createEntityGeometry, createLocalEntityGeometry, diagramPortHostId, distance, getDiagramTableCellAt, inflateRect, inverseTransformPointAround, invertDiagramAffine, isValidDiagramPortAnchor, normalizeOrthogonalRoute, pointAtRouteFraction, rectContainsPoint, rectIntersects, resolveDiagramParentId, resolveDiagramTableLayout, resolveEdgePath, resolveEndpoint, resolveEntityParentTransform, resolveLocalEntityTransform, resolveParentTransform, resolvePortPoint, resolveTransformOrigin, resolveWorldEntityTransform, rotatePoint, transformDiagramPoint, transformPointAround } from "./geometry.js"
import { createConnectorRenderGeometry } from "./connectorRendering.js"
import { createCircularArc, flattenPathContour, pathContourBoundsPoints, translatePathContour } from "./pathOperations.js"
import { DiagramClipboardService } from "./internal/DiagramClipboardService.js"
import { DiagramGeometryService } from "./internal/DiagramGeometryService.js"
import { DiagramHistory } from "./internal/DiagramHistory.js"
import { DiagramSceneStore, createInternalState } from "./internal/DiagramSceneStore.js"
import { DiagramSpatialIndex } from "./internal/DiagramSpatialIndex.js"
import { DiagramViewportService } from "./internal/DiagramViewportService.js"
import { EMPTY_SELECTION } from "./internal/model.js"
import { cloneDiagramMetadata, isValidDiagramMetadata } from "./metadata.js"
import type { InternalState, MutableEntities, MutableOrder, Patch, TransactionResult } from "./internal/model.js"
import type {
  DiagramAffineTransform,
  DiagramChange,
  DiagramClipboard,
  DiagramCommand,
  DiagramCommandResult,
  DiagramBatchOptions,
  DiagramBatchResult,
  DiagramBatchPreviewResult,
  DiagramDiagnostics,
  DiagramEdge,
  DiagramEntities,
  DiagramEdgeRouting,
  DiagramJunction,
  DiagramConnectorAttachment,
  DiagramConnectorRenderGeometry,
  DiagramConnectorRenderOptions,
  DiagramEdgeEndpoint,
  DiagramNode,
  DiagramPort,
  DiagramPortAnchor,
  DiagramPortRemap,
  DiagramText,
  DiagramVisualStyle,
  DiagramShape,
  DiagramFlipAxis,
  DiagramGroup,
  DiagramTable,
  DiagramTableCell,
  DiagramTableMerge,
  DiagramTableStyle,
  DiagramTableStyleUpdate,
  DiagramTableHeader,
  DiagramEntityKind,
  DiagramMetadata,
  DiagramGeometry,
  DiagramHit,
  DiagramHitTestOptions,
  DiagramId,
  DiagramPoint,
  DiagramPath,
  DiagramPathContour,
  DiagramPathSegment,
  DiagramQueryOptions,
  DiagramRect,
  DiagramRenderOrderOptions,
  DiagramResizeEntry,
  DiagramGridSnapOptions,
  DiagramRotateEntry,
  DiagramAlignEdge,
  DiagramScene,
  DiagramSceneInput,
  DiagramEngineOptions,
  DiagramSelection,
  DiagramKeyboardCommand,
  DiagramKeyboardOptions,
  DiagramSnapContext,
  DiagramSnapOptions,
  DiagramSnapCandidate,
  DiagramSnapKind,
  DiagramSnapResult,
  DiagramTranslationSnapResult,
  DiagramSnapGuide,
  DiagramSubscriber,
  DiagramViewport,
  SerializedDiagramScene,
  DiagramDocument,
  DiagramValidationIssue,
  TransformOrigin,
} from "./types.js"

type DiagramFlipSnapshot = DiagramNode | DiagramEdge | DiagramText | DiagramShape | DiagramTable
type DiagramRotationSnapshot = DiagramNode | DiagramEdge | DiagramText | DiagramShape | DiagramTable | DiagramGroup

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
  private snapCandidateQueryCount = 0
  private snapCandidateCount = 0
  private lastCommandMs = 0
  private orderIndexRevision = -1
  private orderIndexCache = new Map<DiagramId, number>()
  private orderedIdsRevision = -1
  private orderedIdsCache: DiagramId[] = []
  private dependencyIndexReady = false
  private dependencyIndexRebuildCount = 0
  private dependencyEntityIds = new Set<DiagramId>()
  private portIdsByHost = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByNode = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByPort = new Map<DiagramId, Set<DiagramId>>()
  private edgeIdsByJunction = new Map<DiagramId, Set<DiagramId>>()
  private dependencyEdgeEndpoints = new Map<DiagramId, readonly [DiagramEdgeEndpoint, DiagramEdgeEndpoint]>()
  private dependencyPortOwners = new Map<DiagramId, DiagramId>()
  private batchReceipts = new Map<string, Readonly<{ fingerprint: string; result: DiagramBatchResult }>>()
  private editingLocked = false
  private readonly editingLockListeners = new Set<(locked: boolean) => void>()

  constructor(initialScene: DiagramSceneInput = {}, options: DiagramEngineOptions = {}) {
    this.history = new DiagramHistory(options.history)
    this.store = new DiagramSceneStore(validateSceneInput(initialScene))
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

  isEditingLocked(): boolean {
    return this.editingLocked
  }

  /** Locks user-facing commands and active interactions. `transact()` remains available for authoritative scene replacement. */
  setEditingLocked(locked: boolean): void {
    if (this.editingLocked === locked) return
    this.editingLocked = locked
    for (const listener of this.editingLockListeners) listener(locked)
  }

  subscribeEditingLock(listener: (locked: boolean) => void): { unsubscribe: () => void } {
    this.editingLockListeners.add(listener)
    listener(this.editingLocked)
    return { unsubscribe: () => this.editingLockListeners.delete(listener) }
  }

  getGeometryReadCount(): number {
    return this.geometryService.getReadCount()
  }

  /** Number of canonical local Table layouts resolved by this engine; exposed for diagnostics and benchmarks. */
  getTableLayoutReadCount(): number { return this.geometryService.getTableLayoutReadCount() }

  /** Cached local Table layout. Parent transforms, viewport, selection, and transient state do not affect this result. */
  getTableLayout(id: DiagramId, textMeasurementProvider?: import("./types.js").DiagramTextMeasurementProvider) {
    const table = this.state.entities.tablesById.get(id)
    return table ? this.geometryService.getTableLayout(table, textMeasurementProvider) : null
  }

  /** Resolve a table layout for a read-only presentation context. Override content never enters scene state or history. */
  getPresentedTableLayout(id: DiagramId, options: import("./geometry.js").DiagramTableLayoutOptions = {}) {
    const table = this.state.entities.tablesById.get(id)
    return table ? this.geometryService.getTableLayout(table, options.textMeasurementProvider, options.contentOverrides) : null
  }

  getGeometrySnapshot(id: DiagramId): DiagramGeometry | null {
    return this.getGeometry(id)
  }

  /** Resolve renderer geometry using alternative displayed Text content without changing authoritative geometry or caches. */
  getPresentedGeometrySnapshot(id: DiagramId, contentOverrides: import("./types.js").DiagramContentOverrides): DiagramGeometry | null {
    return createEntityGeometry(id, this.state.entities, undefined, contentOverrides)
  }

  getParentGroupId(id: DiagramId): DiagramId | null {
    return resolveDiagramParentId(id, this.state.entities)
  }

  getGroupChildren(id: DiagramId): ReadonlyArray<DiagramId> {
    return this.state.entities.groupsById.get(id)?.childIds ?? []
  }

  getLocalBounds(id: DiagramId): DiagramRect | null {
    const geometry = createLocalEntityGeometry(id, this.state.entities)
    return geometry?.unrotatedBounds ?? geometry?.bounds ?? null
  }

  getWorldBounds(id: DiagramId): DiagramRect | null {
    return this.getGeometry(id)?.bounds ?? null
  }

  resolveLocalTransform(id: DiagramId) {
    return hasEntity(this.state, id) ? resolveLocalEntityTransform(id, this.state.entities) : null
  }

  resolveWorldTransform(id: DiagramId) {
    return hasEntity(this.state, id) ? resolveWorldEntityTransform(id, this.state.entities) : null
  }

  localToWorld(id: DiagramId, point: DiagramPoint): DiagramPoint | null {
    const matrix = this.resolveWorldTransform(id)
    return matrix ? transformDiagramPoint(matrix, point) : null
  }

  worldToLocal(id: DiagramId, point: DiagramPoint): DiagramPoint | null {
    const matrix = this.resolveWorldTransform(id)
    const inverse = matrix ? invertDiagramAffine(matrix) : null
    return inverse ? transformDiagramPoint(inverse, point) : null
  }

  getTableCellAt(id: DiagramId, worldPoint: DiagramPoint) {
    const table = this.state.entities.tablesById.get(id)
    return table ? getDiagramTableCellAt(table, worldPoint, resolveEntityParentTransform(id, this.state.entities) ?? undefined, this.geometryService.getTableLayout(table)) : null
  }

  getTransformOrigin(id: DiagramId) {
    const entity = getDiagramRotationSnapshot(this.state, id)
    return entity && entity.kind !== "edge" ? entity.transformOrigin : undefined
  }

  resolveLocalTransformOrigin(id: DiagramId): DiagramPoint | null {
    const entity = getDiagramRotationSnapshot(this.state, id)
    const geometry = entity ? createEntityGeometry(id, snapshotEntities(this.state)) : null
    const bounds = entity && geometry ? transformOriginBounds(entity, geometry) : undefined
    if (!entity || entity.kind === "edge" || !bounds) return null
    const point = resolveTransformOrigin(bounds, entity.transformOrigin)
    return { x: point.x - bounds.x, y: point.y - bounds.y }
  }

  resolveWorldTransformOrigin(id: DiagramId): DiagramPoint | null {
    const geometry = this.getGeometry(id)
    if (!geometry) return null
    if (geometry.transformOrigin) return geometry.transformOrigin
    const entity = getDiagramRotationSnapshot(this.state, id)
    if (!entity || entity.kind === "edge") return null
    const bounds = transformOriginBounds(entity, geometry)
    return resolveTransformOrigin(bounds, entity?.transformOrigin)
  }

  dispatch(command: DiagramCommand): DiagramCommandResult {
    const startedAt = now()
    if (this.editingLocked) {
      this.lastCommandMs = now() - startedAt
      return { changed: false, revision: this.state.revision, reason: "scene-locked" }
    }
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
    if (command.type === "mergeTableCells") {
      const diagnostic = getTableMergeFailure(this.state.entities.tablesById.get(command.id), command.startRow, command.endRow, command.startColumn, command.endColumn, command.contentPolicy)
      if (diagnostic) {
        this.lastCommandMs = now() - startedAt
        return { changed: false, revision: this.state.revision, reason: diagnostic === "merge-content-conflict" ? diagnostic : "invalid-table-range", diagnostic: diagnostic === "merge-content-conflict" ? "Merge rejected: a non-anchor selected cell contains content." : "Merge rejected: the selected rectangle is invalid or partially intersects an existing merged region." }
      }
    }
    const patch = this.createPatch(command)
    if (!patch) {
      this.lastCommandMs = now() - startedAt
      return { changed: false, revision: this.state.revision }
    }
    if (commandMayAffectFixedJunctionRoutes(command) && [...this.state.entities.junctionsById.values()].some((junction) => junction.anchor.kind === "fixed")) {
      const draft = new DiagramEngine(serializeScene(this.store.getSnapshot()))
      draft.commitPatch(patch, false, null)
      const invalid = fixedJunctionRouteFailure(draft.state.entities)
      if (invalid) return { changed: false, revision: this.state.revision, reason: "invalid-command", diagnostic: invalid }
    }
    const transaction = this.commitPatch(patch, command.type !== "setSelection" && command.type !== "setViewport", "historyKey" in command ? command.historyKey ?? null : null)
    result = { changed: transaction.changedIds.size > 0, revision: this.state.revision }
    this.lastCommandMs = now() - startedAt
    return result
  }

  dispatchBatch(commands: ReadonlyArray<DiagramCommand>, options: DiagramBatchOptions = {}): DiagramBatchResult {
    const failure = (reason: "revision-mismatch" | "invalid-command" | "unsupported-command" | "operation-id-conflict" | "scene-locked", index: number | null, ids: DiagramId[] = []): DiagramBatchResult => ({
      ok: false, changed: false, revision: this.state.revision, documentRevision: this.state.documentRevision,
      failedCommandIndex: index, reason, affectedIds: [...new Set(ids)],
    })
    if (this.editingLocked) return failure("scene-locked", null)
    const operationId = options.operationId
    let fingerprint = ""
    if (operationId) {
      if (!operationId.trim()) return failure("invalid-command", null)
      try { fingerprint = JSON.stringify({ commands, expectedRevision: options.expectedRevision, expectedDocumentRevision: options.expectedDocumentRevision }) }
      catch { return failure("invalid-command", null) }
      const previous = this.batchReceipts.get(operationId)
      if (previous) return previous.fingerprint === fingerprint ? previous.result : { ...failure("operation-id-conflict", null), affectedIds: [] }
    }
    const finish = (result: DiagramBatchResult): DiagramBatchResult => {
      if (operationId) {
        this.batchReceipts.set(operationId, { fingerprint, result })
        if (this.batchReceipts.size > 1024) this.batchReceipts.delete(this.batchReceipts.keys().next().value!)
      }
      return result
    }
    if ((options.expectedRevision !== undefined && options.expectedRevision !== this.state.documentRevision) || (options.expectedDocumentRevision !== undefined && options.expectedDocumentRevision !== this.state.documentRevision)) {
      return finish(failure("revision-mismatch", null))
    }
    const draft = new DiagramEngine(serializeScene(this.store.getSnapshot()))
    draft.state.revision = this.state.revision
    draft.state.documentRevision = this.state.documentRevision
    draft.state.orderRevision = this.state.orderRevision
    const patches: Patch[] = []
    const historyPatches: Patch[] = []
    const affected = new Set<DiagramId>()
    for (let index = 0; index < commands.length; index += 1) {
      const command = commands[index]!
      if (command.type === "undo" || command.type === "redo") return finish(failure("unsupported-command", index))
      const patch = draft.createPatch(command)
      if (!patch) {
        if (isBatchNoOp(draft.state, command)) continue
        const ids = commandIds(command)
        const missing = ids.filter((id) => !draft.hasEntity(id))
        return finish(failure("invalid-command", index, missing.length ? missing : ids))
      }
      const changed = draft.commitPatch(patch, false, null).changedIds
      if (changed.size) {
        patches.push(patch)
        if (command.type !== "setSelection" && command.type !== "setViewport") historyPatches.push(patch)
        for (const id of changed) affected.add(id)
      }
    }
    const routeFailure = fixedJunctionRouteFailure(draft.state.entities)
    if (routeFailure) return finish({ ...failure("invalid-command", commands.length ? commands.length - 1 : null, fixedJunctionHostIds(draft.state.entities)), diagnostic: routeFailure })
    if (!patches.length) return finish({ ok: true, changed: false, revision: this.state.revision, documentRevision: this.state.documentRevision, failedCommandIndex: null, reason: null, affectedIds: [] })
    let combined = patches[0]!
    for (let index = 1; index < patches.length; index += 1) combined = composePatches(combined, patches[index]!)
    let inverse = patches[patches.length - 1]!.inverse
    for (let index = patches.length - 2; index >= 0; index -= 1) inverse = composePatches(inverse, patches[index]!.inverse)
    combined.inverse = inverse
    let historyPatch = historyPatches[0]
    if (historyPatch) {
      for (let index = 1; index < historyPatches.length; index += 1) historyPatch = composePatches(historyPatch, historyPatches[index]!)
      let historyInverse = historyPatches[historyPatches.length - 1]!.inverse
      for (let index = historyPatches.length - 2; index >= 0; index -= 1) historyInverse = composePatches(historyInverse, historyPatches[index]!.inverse)
      historyPatch.inverse = historyInverse
    }
    const changed = this.commitPatch(combined, historyPatch !== undefined, null, historyPatch).changedIds
    return finish({ ok: true, changed: changed.size > 0, revision: this.state.revision, documentRevision: this.state.documentRevision, failedCommandIndex: null, reason: null, affectedIds: [...affected] })
  }

  /** Applies a batch to an isolated draft and returns its candidate scene without publishing or changing history. */
  previewBatch(commands: ReadonlyArray<DiagramCommand>, options: DiagramBatchOptions = {}): DiagramBatchPreviewResult {
    const failure = (reason: "revision-mismatch" | "invalid-command" | "unsupported-command" | "scene-locked", index: number | null, ids: DiagramId[] = []): DiagramBatchPreviewResult => ({
      ok: false, changed: false, revision: this.state.revision, documentRevision: this.state.documentRevision,
      failedCommandIndex: index, reason, affectedIds: [...new Set(ids)],
    })
    if (this.editingLocked) return failure("scene-locked", null)
    if ((options.expectedRevision !== undefined && options.expectedRevision !== this.state.documentRevision) || (options.expectedDocumentRevision !== undefined && options.expectedDocumentRevision !== this.state.documentRevision)) return failure("revision-mismatch", null)
    const draft = new DiagramEngine(serializeScene(this.store.getSnapshot()))
    draft.state.revision = this.state.revision
    draft.state.documentRevision = this.state.documentRevision
    draft.state.orderRevision = this.state.orderRevision
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
      for (const id of draft.commitPatch(patch, false, null).changedIds) affected.add(id)
    }
    const routeFailure = fixedJunctionRouteFailure(draft.state.entities)
    if (routeFailure) return { ...failure("invalid-command", commands.length ? commands.length - 1 : null, fixedJunctionHostIds(draft.state.entities)), diagnostic: routeFailure }
    return {
      ok: true,
      changed: affected.size > 0,
      revision: this.state.revision,
      documentRevision: this.state.documentRevision,
      failedCommandIndex: null,
      reason: null,
      affectedIds: [...affected],
      scene: draft.serialize(),
    }
  }

  transact(mutator: (draft: DiagramScene) => DiagramSceneInput): DiagramCommandResult {
    const next = validateSceneInput(mutator(this.store.getSnapshot()))
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
      if (portDistance <= radius && (!best || portDistance < best.distance || (portDistance === best.distance && id.localeCompare(best.id) < 0))) {
        best = { id, kind: "port", distance: portDistance }
      }
    }
    return best
  }

  /** Finds the nearest point on an existing connector route, resolving equal distances by render order. */
  nearestConnectorAttachment(point: DiagramPoint, radius: number, exclude: ReadonlySet<DiagramId> = new Set()): DiagramConnectorAttachment | null {
    if (![point.x, point.y, radius].every(Number.isFinite) || radius < 0) return null
    this.ensureIndexes()
    const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    const order = this.createOrderIndex()
    let best: DiagramConnectorAttachment | null = null
    for (const id of this.spatialIndex.queryHit(bounds)) {
      if (exclude.has(id)) continue
      const edge = this.state.entities.edgesById.get(id)
      if (!edge) continue
      const path = resolveEdgePath(edge, this.state.entities)
      const lengths = path.slice(1).map((end, index) => distance(path[index]!, end))
      const total = lengths.reduce((sum, value) => sum + value, 0)
      if (!total) continue
      let offset = 0
      for (let index = 0; index < lengths.length; index += 1) {
        const start = path[index]!, end = path[index + 1]!, length = lengths[index]!
        const dx = end.x - start.x, dy = end.y - start.y
        const ratio = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length))) : 0
        const candidatePoint = { x: start.x + dx * ratio, y: start.y + dy * ratio }
        const candidateDistance = distance(point, candidatePoint)
        const fraction = (offset + length * ratio) / total
        if (candidateDistance <= radius && (!best || candidateDistance < best.distance || (candidateDistance === best.distance && (order.get(id) ?? 0) > (order.get(best.edgeId) ?? 0)))) {
          best = { edgeId: id, point: candidatePoint, fraction, distance: candidateDistance }
        }
        offset += length
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
      if (portDistance <= radius && (!best || portDistance < best.distance || (portDistance === best.distance && id.localeCompare(best.id) < 0))) {
        best = { id, kind: "port", distance: portDistance }
      }
    }
    return best
  }

  snapPoint(point: DiagramPoint, context: DiagramSnapContext = {}): DiagramSnapResult {
    const result = this.resolveSnapPoint(point, context)
    const gridSize = context.gridSize
    if (!context.strictGrid || !Number.isFinite(gridSize) || gridSize! <= 0) return result
    const snappedPoint = {
      x: context.axisConstraint === "y" ? point.x : Math.round(result.point.x / gridSize!) * gridSize!,
      y: context.axisConstraint === "x" ? point.y : Math.round(result.point.y / gridSize!) * gridSize!,
    }
    if (snappedPoint.x === result.point.x && snappedPoint.y === result.point.y) return result
    return { point: snappedPoint, snapped: true, source: "grid", ...(result.candidates ? { candidates: result.candidates } : {}) }
  }

  private resolveSnapPoint(point: DiagramPoint, context: DiagramSnapContext): DiagramSnapResult {
    const custom = context.custom?.(point)
    if (custom) return { point: constrainSnapPoint(custom, point, context.axisConstraint), snapped: true, source: "custom" }
    if (context.kinds || context.tolerancePx !== undefined || context.angleIncrement !== undefined || (context.angleConstraint !== undefined && context.origin !== undefined) || context.additionalAngles || context.ortho) {
      const zoom = this.state.viewport.zoom > 0 ? this.state.viewport.zoom : 1
      const candidates = this.getSnapCandidates(point, {
        tolerancePx: context.tolerancePx ?? (context.radius ?? 6) * zoom,
        gridSize: context.gridSize,
        kinds: context.kinds,
        excludeIds: context.excludeIds,
        origin: context.origin,
        angleIncrement: context.angleIncrement ?? context.angleConstraint,
        additionalAngles: context.additionalAngles,
        ortho: context.ortho,
      })
      const candidate = candidates.map((entry) => {
        const adjustedPoint = constrainSnapPoint(entry.point, point, context.axisConstraint)
        return { entry, adjustedPoint, distancePx: distance(adjustedPoint, point) * zoom }
      }).find(({ distancePx }) => distancePx <= (context.tolerancePx ?? (context.radius ?? 6) * zoom))
      return candidate
        ? { point: candidate.adjustedPoint, snapped: true, source: candidate.entry.kind, targetId: candidate.entry.targetId, candidate: { ...candidate.entry, point: candidate.adjustedPoint, distancePx: candidate.distancePx }, candidates }
        : context.origin && (context.ortho || (Number.isFinite(context.angleIncrement) && context.angleIncrement! > 0) || context.additionalAngles?.some(Number.isFinite))
          ? { point: constrainSnapPoint(constrainAngleFromOrigin(point, context.origin, context.ortho ? 90 : context.angleIncrement ?? 360, context.additionalAngles), context.origin, context.axisConstraint), snapped: true, source: "angle", candidates }
          : { point, snapped: false, source: null, candidates }
    }
    const port = context.snapToPorts === false ? null : this.nearestPort(point, context.radius ?? 12, context.excludeIds ?? new Set())
    if (port) {
      const geometry = this.getGeometry(port.id)
      if (geometry?.point) {
        const snappedPoint = constrainSnapPoint(geometry.point, point, context.axisConstraint)
        const candidate = { kind: "port" as const, point: snappedPoint, targetId: port.id, distancePx: distance(point, snappedPoint) * (this.state.viewport.zoom || 1) }
        return { point: snappedPoint, snapped: true, source: "port", targetId: port.id }
      }
    }
    const aligned = context.snapToAlignment === false ? null : this.snapToAlignment(point, context.radius ?? 6, context.excludeIds, context.axisConstraint)
    if (aligned) {
      return { point: aligned, snapped: true, source: "alignment" }
    }
    if (context.angleConstraint && context.angleConstraint > 0) {
      return { point: constrainSnapPoint(constrainAngle(point, context.angleConstraint), point, context.axisConstraint), snapped: true, source: "angle" }
    }
    if (context.gridSize && context.gridSize > 0) {
      const gridPoint = {
          x: context.axisConstraint === "y" ? point.x : Math.round(point.x / context.gridSize) * context.gridSize,
          y: context.axisConstraint === "x" ? point.y : Math.round(point.y / context.gridSize) * context.gridSize,
        }
      return {
        point: gridPoint,
        snapped: true,
        source: "grid",
      }
    }
    return { point, snapped: false, source: null }
  }

  /** Returns deterministic, read-only snap candidates within a screen-space tolerance. */
  getSnapCandidates(point: DiagramPoint, options: DiagramSnapOptions = {}): ReadonlyArray<DiagramSnapCandidate> {
    this.snapCandidateQueryCount += 1
    if (![point.x, point.y].every(Number.isFinite)) return Object.freeze([])
    const zoom = this.state.viewport.zoom > 0 ? this.state.viewport.zoom : 1
    const tolerancePx = options.tolerancePx ?? 6
    if (!Number.isFinite(tolerancePx) || tolerancePx < 0) return Object.freeze([])
    const radius = tolerancePx / zoom
    const enabled = new Set(options.kinds ?? ["port", "connector", "endpoint", "midpoint", "center", "intersection", "perpendicular", "nearest", "alignment", "equal-spacing", ...(options.gridSize ? ["grid" as const] : [])])
    const excluded = options.excludeIds ?? new Set<DiagramId>()
    const found: DiagramSnapCandidate[] = []
    const add = (kind: DiagramSnapKind, candidatePoint: DiagramPoint, targetId?: DiagramId) => {
      const candidateDistance = distance(point, candidatePoint) * zoom
      if (candidateDistance <= tolerancePx) found.push({ kind, point: candidatePoint, ...(targetId ? { targetId } : {}), distancePx: candidateDistance })
    }
    const searchBounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    this.ensureIndexes()
    const nearby = this.spatialIndex.queryHit(searchBounds).filter((id) => !excluded.has(id)).sort((a, b) => a.localeCompare(b))
    const paths: Array<{ id: DiagramId; points: ReadonlyArray<DiagramPoint> }> = []
    const eligibleCenter = new Set<DiagramEntityKind>(["node", "shape", "table", "group"])
    for (const id of nearby) {
      const geometry = this.getGeometry(id)
      if (!geometry) continue
      if (enabled.has("port") && geometry.kind === "port" && geometry.point) add("port", geometry.point, id)
      if (enabled.has("center") && eligibleCenter.has(geometry.kind)) add("center", { x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }, id)
      let points = geometry.kind === "edge" ? geometry.path : undefined
      if (geometry.kind === "shape") {
        const shape = this.state.entities.shapesById.get(id)
        if (shape?.shape === "line") points = geometry.path ?? [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }]
        else if (shape?.shape === "rect") points = geometry.corners ? [...geometry.corners, geometry.corners[0]!] : [
          { x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y },
          { x: shape.x + shape.width, y: shape.y + shape.height }, { x: shape.x, y: shape.y + shape.height },
          { x: shape.x, y: shape.y },
        ]
        else if (shape?.shape === "ellipse") {
          const bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
          const origin = resolveTransformOrigin(bounds, shape.transformOrigin)
          const center = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
          points = Array.from({ length: 33 }, (_, index) => {
            const angle = index * Math.PI * 2 / 32
            return { x: center.x + Math.cos(angle) * shape.width / 2, y: center.y + Math.sin(angle) * shape.height / 2 }
          }).map((shapePoint) => transformPointAround(shapePoint, origin, shape.rotation ?? 0, shape.flipX === true, shape.flipY === true))
        }
      }
      if (points?.length) {
        paths.push({ id, points })
        if (enabled.has("endpoint")) {
          add("endpoint", points[0]!, id)
          add("endpoint", points[points.length - 1]!, id)
        }
        if (enabled.has("connector") && geometry.kind === "edge") {
          let nearest: DiagramPoint | null = null
          for (let index = 1; index < points.length; index += 1) {
            const candidate = closestPointOnSegment(point, points[index - 1]!, points[index]!)
            if (!nearest || distance(point, candidate) < distance(point, nearest)) nearest = candidate
          }
          if (nearest) add("connector", nearest, id)
        }
        if (enabled.has("midpoint")) for (let index = 1; index < points.length; index += 1) add("midpoint", midpoint(points[index - 1]!, points[index]!), id)
        if (enabled.has("nearest") || enabled.has("perpendicular")) for (let index = 1; index < points.length; index += 1) {
          const nearest = closestPointOnSegment(point, points[index - 1]!, points[index]!)
          if (enabled.has("nearest")) add("nearest", nearest, id)
          if (enabled.has("perpendicular") && options.origin) add("perpendicular", closestPointOnSegment(options.origin, points[index - 1]!, points[index]!), id)
        }
      }
    }
    if (enabled.has("intersection")) {
      for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
        const left = paths[leftIndex]!
        const right = paths[rightIndex]!
        if (left.id === right.id) continue
        for (let i = 1; i < left.points.length; i += 1) for (let j = 1; j < right.points.length; j += 1) {
          const intersection = segmentIntersection(left.points[i - 1]!, left.points[i]!, right.points[j - 1]!, right.points[j]!)
          if (intersection) add("intersection", intersection, [left.id, right.id].sort().join("|"))
        }
      }
    }
    if (enabled.has("alignment")) {
      const aligned = this.snapToAlignment(point, radius, excluded)
      if (aligned) add("alignment", aligned)
    }
    if (enabled.has("equal-spacing")) {
      const bounds = nearby.map((id) => this.getGeometry(id)).filter((geometry): geometry is DiagramGeometry => Boolean(geometry && ["node", "shape", "table"].includes(geometry.kind))).map((geometry) => geometry.bounds)
      for (let i = 0; i < bounds.length; i += 1) for (let j = i + 1; j < bounds.length; j += 1) {
        const a = bounds[i]!, b = bounds[j]!
        if (rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height)) {
          const [left, right] = a.x <= b.x ? [a, b] : [b, a]
          add("equal-spacing", { x: (left.x + left.width + right.x) / 2, y: point.y })
        }
        if (rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width)) {
          const [top, bottom] = a.y <= b.y ? [a, b] : [b, a]
          add("equal-spacing", { x: point.x, y: (top.y + top.height + bottom.y) / 2 })
        }
      }
    }
    if (enabled.has("grid") && options.gridSize && Number.isFinite(options.gridSize) && options.gridSize > 0) add("grid", { x: Math.round(point.x / options.gridSize) * options.gridSize, y: Math.round(point.y / options.gridSize) * options.gridSize })
    const priority: DiagramSnapKind[] = ["port", "connector", "endpoint", "intersection", "midpoint", "center", "perpendicular", "nearest", "alignment", "equal-spacing", "grid"]
    found.sort((a, b) => (priority.indexOf(a.kind) - priority.indexOf(b.kind)) || a.distancePx - b.distancePx || (a.targetId ?? "").localeCompare(b.targetId ?? "") || a.point.x - b.point.x || a.point.y - b.point.y)
    this.snapCandidateCount += found.length
    return Object.freeze(found.map((candidate) => Object.freeze({ ...candidate, point: Object.freeze({ ...candidate.point }) })))
  }

  snapTranslation(selection: DiagramSelection, delta: DiagramPoint, context: DiagramSnapContext = {}): DiagramTranslationSnapResult {
    const primaryId = selection.primaryId ?? selection.ids[0]
    const geometry = primaryId ? this.getGeometry(primaryId) : null
    const origin = geometry ? { x: geometry.bounds.x, y: geometry.bounds.y } : { x: 0, y: 0 }
    const radius = context.radius ?? 6
    const excludeIds = new Set([...(context.excludeIds ?? []), ...selection.ids])
    const proposed = context.axisConstraint === "x"
      ? { x: origin.x + delta.x, y: origin.y }
      : context.axisConstraint === "y"
        ? { x: origin.x, y: origin.y + delta.y }
        : { x: origin.x + delta.x, y: origin.y + delta.y }
    if (context.strictGrid && Number.isFinite(context.gridSize) && context.gridSize! > 0) {
      const size = context.gridSize!
      const snapped = {
        x: context.axisConstraint === "y" ? origin.x : Math.round(proposed.x / size) * size,
        y: context.axisConstraint === "x" ? origin.y : Math.round(proposed.y / size) * size,
      }
      return {
        point: { x: snapped.x - origin.x, y: snapped.y - origin.y },
        snapped: true,
        source: "grid",
        guides: Object.freeze([]),
      }
    }
    const guides: DiagramSnapGuide[] = []
    let point = proposed
    let source: DiagramSnapResult["source"] = null
    let prioritySnap = false
    let selectedCandidate: DiagramSnapCandidate | undefined
    const pointKinds = context.kinds?.filter((kind) => !["alignment", "equal-spacing", "grid"].includes(kind))
    if (pointKinds?.length) {
      const zoom = this.state.viewport.zoom > 0 ? this.state.viewport.zoom : 1
      const tolerancePx = context.tolerancePx ?? radius * zoom
      const candidate = this.getSnapCandidates(point, { tolerancePx, kinds: pointKinds, excludeIds, origin: context.origin }).map((entry) => {
        const adjustedPoint = constrainSnapPoint(entry.point, point, context.axisConstraint)
        return { entry, adjustedPoint, distancePx: distance(adjustedPoint, point) * zoom }
      }).find((entry) => entry.distancePx <= tolerancePx)
      if (candidate) {
        point = candidate.adjustedPoint
        source = candidate.entry.kind
        selectedCandidate = { ...candidate.entry, point, distancePx: candidate.distancePx }
        prioritySnap = true
      }
    }
    const portSnap = (context.snapToPorts === false || (context.kinds !== undefined && !context.kinds.includes("port"))) && !context.custom
      ? { point, snapped: false, source: null as DiagramSnapResult["source"] }
      : prioritySnap ? { point, snapped: true, source } : this.snapPoint(point, { ...context, gridSize: undefined, radius, excludeIds, snapToAlignment: false })
    if (portSnap.source === "port" || portSnap.source === "custom") {
      point = constrainSnapPoint(portSnap.point, origin, context.axisConstraint)
      source = portSnap.source
      if (portSnap.source === "port" && portSnap.targetId) selectedCandidate = { kind: "port", point, targetId: portSnap.targetId, distancePx: distance(proposed, point) * (this.state.viewport.zoom || 1) }
      prioritySnap = true
    }
    if (!prioritySnap && context.snapToAlignment !== false && (!context.kinds || context.kinds.includes("alignment")) && geometry) {
      const aligned = this.findTranslationAlignment(geometry.bounds, point, radius, excludeIds, context.axisConstraint)
      if (aligned) {
        point = { x: point.x + aligned.dx, y: point.y + aligned.dy }
        guides.push(...aligned.guides)
        source ??= "alignment"
      selectedCandidate ??= { kind: "alignment", point, distancePx: Math.hypot(aligned.dx, aligned.dy) * (this.state.viewport.zoom || 1) }
      }
    }
    if (!prioritySnap && context.snapToEqualSpacing && (!context.kinds || context.kinds.includes("equal-spacing")) && geometry) {
      const alignedAxes = new Set(guides.filter((guide) => guide.kind === "alignment").map((guide) => guide.axis))
      if (context.axisConstraint === "x") alignedAxes.add("y")
      if (context.axisConstraint === "y") alignedAxes.add("x")
      const spaced = this.findEqualSpacing(geometry.bounds, point, radius, excludeIds, alignedAxes)
      if (spaced) {
        const before = point
        point = { x: point.x + spaced.dx, y: point.y + spaced.dy }
        guides.push(...spaced.guides)
        source ??= "equal-spacing"
        selectedCandidate ??= { kind: "equal-spacing", point, distancePx: Math.hypot(point.x - before.x, point.y - before.y) * (this.state.viewport.zoom || 1) }
      }
    }
    if (!prioritySnap && (!context.kinds || context.kinds.includes("grid")) && context.gridSize && context.gridSize > 0) {
      const snappedAxes = new Set(guides.map((guide) => guide.axis))
      let gridChanged = false
      if (!snappedAxes.has("x") && context.axisConstraint !== "y") {
        const x = Math.round(point.x / context.gridSize) * context.gridSize
        gridChanged ||= x !== point.x
        point = { ...point, x }
      }
      if (!snappedAxes.has("y") && context.axisConstraint !== "x") {
        const y = Math.round(point.y / context.gridSize) * context.gridSize
        gridChanged ||= y !== point.y
        point = { ...point, y }
      }
      if (gridChanged) {
        source ??= "grid"
        selectedCandidate ??= { kind: "grid", point, distancePx: Math.hypot(point.x - proposed.x, point.y - proposed.y) * (this.state.viewport.zoom || 1) }
      }
    }
    return {
      point: { x: point.x - origin.x, y: point.y - origin.y },
      snapped: source !== null,
      source,
      ...(selectedCandidate && (context.includeCandidates || context.kinds !== undefined || context.tolerancePx !== undefined) ? { candidate: selectedCandidate, targetId: selectedCandidate.targetId } : {}),
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
      && ids.every((id) => {
        const group = this.state.entities.groupsById.get(id)
          ?? [...this.state.entities.groupsById.values()].find((candidate) => candidate.childIds.includes(id))
        return !group || groupMembers(this.state, group.id).every((childId) => !this.isEntityNonDeletable(childId) && !this.isEntityLockedOrReadOnly(childId))
      })
  }

  canMove(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => this.isEntityTranslatable(id) && !this.isEntityLockedOrReadOnly(id))
  }

  canResize(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => {
      const group = this.state.entities.groupsById.get(id)
      // TODO(next-major): Remove resize support for legacy baked groups after migration obligations are retired.
      if (group) return group.x === undefined && group.y === undefined && group.childIds.length > 0 && group.childIds.every((childId) => this.isEntityResizable(childId) && !this.isEntityLockedOrReadOnly(childId))
      return this.isEntityResizable(id) && !this.isEntityLockedOrReadOnly(id)
    })
  }

  canRotate(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => {
      if (this.isEntityLockedOrReadOnly(id)) return false
      if (this.state.entities.groupsById.has(id)) return isGroupRotatable(this.state, id)
      return this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.tablesById.has(id) || isFreeEdgeRotatable(this.state.entities.edgesById.get(id))
    })
  }

  canAlign(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.filter((id) => !this.isEntityLockedOrReadOnly(id) && (this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.tablesById.has(id))).length >= 2
  }

  canEditText(id: DiagramId | null = this.state.selection.primaryId): boolean {
    return Boolean(id && this.state.entities.textsById.has(id) && !this.isEntityLockedOrReadOnly(id))
  }

  canPaste(clipboard: DiagramClipboard | null | undefined): boolean {
    return Boolean(clipboard && (clipboard.nodes.length || clipboard.edges.length || clipboard.texts.length || clipboard.shapes.length || clipboard.ports.length || clipboard.groups?.length || clipboard.tables?.length))
  }

  getDiagnostics(): DiagramDiagnostics {
    return {
      revision: this.state.revision,
      visibleQueryCount: this.visibleQueryCount,
      entityQueryCount: this.entityQueryCount,
      hitTestCount: this.hitTestCount,
      snapCandidateQueryCount: this.snapCandidateQueryCount,
      snapCandidateCount: this.snapCandidateCount,
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

  /** Returns transient renderer-neutral connector paths with optional rounded corners and crossing bridges. */
  getConnectorRenderGeometry(options: DiagramConnectorRenderOptions = {}): ReadonlyArray<DiagramConnectorRenderGeometry> {
    const scene = this.getScene()
    const edgeOrder = this.getRenderOrder().filter((id) => scene.entities.edgesById.has(id))
    return createConnectorRenderGeometry(scene, options, edgeOrder)
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
      content: { nodes: scene.nodes, edges: scene.edges, texts: scene.texts, shapes: scene.shapes, ports: scene.ports, ...(scene.junctions?.length ? { junctions: scene.junctions } : {}), groups: scene.groups ?? [], tables: scene.tables ?? [] },
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

  private commitPatch(patch: Patch, recordHistory: boolean, historyKey: string | null, historyPatch: Patch = patch): TransactionResult {
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
    this.geometryService.invalidate(invalidatedIds, new Set(this.state.entities.tablesById.keys()))
    const invalidatedGeometryIds = [...invalidatedIds]
    const resolutionCache = createDiagramGeometryResolutionCache(this.state.entities)
    this.spatialIndex.update(
      invalidatedGeometryIds
        .map((id) => this.geometryService.get(id, this.state.entities, this.state.versions.get(id) ?? 0, resolutionCache))
        .filter((geometry): geometry is DiagramGeometry => geometry !== null),
      invalidatedGeometryIds.filter((id) => !this.hasEntity(id)),
    )
    if (recordHistory) {
      this.history.record(historyPatch, historyKey, composePatches)
    }
    this.store.publish(changedIds, invalidatedIds)
    return { changedIds, invalidatedIds }
  }

  private collectInvalidatedIds(changedIds: ReadonlySet<DiagramId>): Set<DiagramId> {
    const invalidated = new Set(changedIds)
    const changedObstacleBounds: DiagramRect[] = []
    const changedRouteBounds: DiagramRect[] = []
    for (const id of changedIds) {
      if (this.state.entities.edgesById.has(id)) {
        const previousRoute = this.geometryService.get(id, this.state.entities, this.state.versions.get(id) ?? 0)
        const currentRoute = createEntityGeometry(id, this.state.entities)
        if (previousRoute) changedRouteBounds.push(inflateRect(previousRoute.bounds, 1))
        if (currentRoute) changedRouteBounds.push(inflateRect(currentRoute.bounds, 1))
      }
      if (!(this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.tablesById.has(id))) continue
      const previousGeometry = this.geometryService.get(id, this.state.entities, this.state.versions.get(id) ?? 0)
      const currentGeometry = createEntityGeometry(id, this.state.entities)
      if (previousGeometry) changedObstacleBounds.push(inflateRect(previousGeometry.bounds, 1))
      if (currentGeometry) changedObstacleBounds.push(inflateRect(currentGeometry.bounds, 1))
    }
    if (changedObstacleBounds.length || changedRouteBounds.length) {
      for (const edge of this.state.entities.edgesById.values()) {
        if (edge.routing?.mode !== "auto" || changedIds.has(edge.id)) continue
        const routeGeometry = this.geometryService.get(edge.id, this.state.entities, this.state.versions.get(edge.id) ?? 0)
        if (!routeGeometry || ![...changedObstacleBounds, ...changedRouteBounds].some((bounds) => rectIntersects(inflateRect(routeGeometry.bounds, edge.routing?.clearance ?? 0), bounds))) continue
        invalidated.add(edge.id)
      }
    }
    for (const id of invalidated) {
      for (const junction of this.state.entities.junctionsById.values()) {
        if (junction.hostEdgeId !== id) continue
        invalidated.add(junction.id)
        for (const branchId of this.edgeIdsByJunction.get(junction.id) ?? []) invalidated.add(branchId)
      }
      for (const branchId of this.edgeIdsByJunction.get(id) ?? []) invalidated.add(branchId)
      for (const portId of this.portIdsByHost.get(id) ?? []) {
        invalidated.add(portId)
        for (const edgeId of this.edgeIdsByPort.get(portId) ?? []) invalidated.add(edgeId)
      }
      for (const edgeId of this.edgeIdsByNode.get(id) ?? []) {
        invalidated.add(edgeId)
      }
      for (const edgeId of this.edgeIdsByPort.get(id) ?? []) {
        invalidated.add(edgeId)
      }
      for (const group of this.state.entities.groupsById.values()) {
        if (group.childIds.includes(id)) invalidated.add(group.id)
      }
    }
    const childIdsByGroup = new Map([...this.state.entities.groupsById.values()].map((group) => [group.id, group.childIds]))
    const pendingGroups = [...invalidated].filter((id) => childIdsByGroup.has(id))
    const visitedGroups = new Set<DiagramId>()
    while (pendingGroups.length) {
      const groupId = pendingGroups.pop()!
      if (visitedGroups.has(groupId)) continue
      visitedGroups.add(groupId)
      for (const childId of childIdsByGroup.get(groupId) ?? []) {
        invalidated.add(childId)
        for (const portId of this.portIdsByHost.get(childId) ?? []) {
          invalidated.add(portId)
          for (const edgeId of this.edgeIdsByPort.get(portId) ?? []) invalidated.add(edgeId)
        }
        for (const edgeId of this.edgeIdsByNode.get(childId) ?? []) invalidated.add(edgeId)
        if (childIdsByGroup.has(childId)) pendingGroups.push(childId)
      }
    }
    for (const id of [...invalidated]) {
      if (!this.state.entities.edgesById.has(id)) continue
      for (const junction of this.state.entities.junctionsById.values()) {
        if (junction.hostEdgeId !== id) continue
        invalidated.add(junction.id)
        for (const branchId of this.edgeIdsByJunction.get(junction.id) ?? []) invalidated.add(branchId)
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
        const nextOwner = port ? diagramPortHostId(port) : undefined
        if (oldOwner !== nextOwner) {
          const attachedEdges = [...(this.edgeIdsByPort.get(id) ?? [])]
          for (const edgeId of attachedEdges) {
            const endpoints = this.dependencyEdgeEndpoints.get(edgeId)
            if (endpoints) this.removeEdgeDependencies(edgeId, endpoints)
          }
          if (oldOwner) removeDependency(this.portIdsByHost, oldOwner, id)
          if (!port) this.dependencyPortOwners.delete(id)
          else {
            this.dependencyPortOwners.set(id, nextOwner!)
            addDependency(this.portIdsByHost, nextOwner!, id)
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
      ...this.state.entities.junctionsById.keys(),
      ...this.state.order.groupIds,
      ...this.state.order.tableIds,
    ])
    this.portIdsByHost = new Map()
    this.edgeIdsByNode = new Map()
    this.edgeIdsByPort = new Map()
    this.edgeIdsByJunction = new Map()
    this.dependencyEdgeEndpoints.clear()
    this.dependencyPortOwners.clear()
    for (const port of this.state.entities.portsById.values()) {
      const hostId = diagramPortHostId(port)
      this.dependencyPortOwners.set(port.id, hostId)
      addDependency(this.portIdsByHost, hostId, port.id)
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
      } else if (endpoint.kind === "junction") addDependency(this.edgeIdsByJunction, endpoint.junctionId, id)
    }
  }

  private removeEdgeDependencies(id: DiagramId, endpoints: readonly [DiagramEdgeEndpoint, DiagramEdgeEndpoint]): void {
    for (const endpoint of endpoints) {
      if (endpoint.kind === "node") removeDependency(this.edgeIdsByNode, endpoint.nodeId, id)
      else if (endpoint.kind === "port") {
        removeDependency(this.edgeIdsByPort, endpoint.portId, id)
        const owner = this.dependencyPortOwners.get(endpoint.portId)
        if (owner) removeDependency(this.edgeIdsByNode, owner, id)
      } else if (endpoint.kind === "junction") removeDependency(this.edgeIdsByJunction, endpoint.junctionId, id)
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
        return createMovePatch(this.state, command.ids, command.delta, command.snap)
      case "moveNode":
        return createMovePatch(this.state, [command.id], command.delta)
      case "createNode":
        return createCreateEntityPatch(this.state, command.node)
      case "createShape":
        return createCreateShapePatch(this.state, command.shape)
      case "createPath":
        return createCreatePathPatch(this.state, command.path)
      case "createArc": {
        const arc = createCircularArc(command.start, command.through, command.end)
        return arc.ok ? createCreatePathPatch(this.state, { id: command.id, kind: "path", contours: [arc.value], ...(command.metadata ? { metadata: command.metadata } : {}) }) : null
      }
      case "updateShapePath":
        return createUpdateShapePathPatch(this.state, command.id, command.points, command.pathContours, command.worldSpace, command.portRemaps)
      case "insertPathVertex":
        return createPathVertexPatch(this.state, command.id, command.index, command.point, "insert", command.portRemaps)
      case "movePathVertex":
        return createPathVertexPatch(this.state, command.id, command.index, command.point, "move", command.portRemaps)
      case "removePathVertex":
        return createPathVertexPatch(this.state, command.id, command.index, null, "remove", command.portRemaps)
      case "updateShape":
        return createUpdateShapePatch(this.state, command.id, command.cornerRadius)
      case "setTransformOrigin":
        return createTransformOriginPatch(this.state, command.id, command.transformOrigin, command.preserveWorldGeometry !== false)
      case "createTable":
        return createCreateTablePatch(this.state, command.table)
      case "mergeTableCells":
        return createMergeTableCellsPatch(this.state, command.id, command.startRow, command.endRow, command.startColumn, command.endColumn, command.contentPolicy)
      case "unmergeTableCell":
        return createUnmergeTableCellPatch(this.state, command.id, command.row, command.column)
      case "insertTableRow":
        return createTableStructurePatch(this.state, command.id, "row", command.index, "insert", command.cells)
      case "deleteTableRow":
        return createTableStructurePatch(this.state, command.id, "row", command.index, "delete")
      case "insertTableColumn":
        return createTableStructurePatch(this.state, command.id, "column", command.index, "insert", command.cells)
      case "deleteTableColumn":
        return createTableStructurePatch(this.state, command.id, "column", command.index, "delete")
      case "resizeTableRow":
        return createResizeTableAxisPatch(this.state, command.id, "row", command.index, command.height, command.policy)
      case "resizeTableColumn":
        return createResizeTableAxisPatch(this.state, command.id, "column", command.index, command.width, command.policy)
      case "setTableSize":
        return createSetTableSizePatch(this.state, command.id, command.width, command.height, command.distribution)
      case "updateTableCell":
        return createUpdateTableCellPatch(this.state, command.id, command.row, command.column, command.cell)
      case "updateTableCellRange":
        return createUpdateTableCellRangePatch(this.state, command.id, command.startRow, command.endRow, command.startColumn, command.endColumn, command.cell)
      case "setTableCellBorders":
        return createSetTableCellBordersPatch(this.state, command.id, command.startRow, command.endRow, command.startColumn, command.endColumn, command.preset, command.border)
      case "updateTableStyle":
        return createUpdateTableStylePatch(this.state, command.id, command.style)
      case "updateTableHeader":
        return createUpdateTableHeaderPatch(this.state, command.id, command.header)
      case "groupEntities":
        return createGroupEntitiesPatch(this.state, command.id, command.ids ?? this.state.selection.ids, command.transformOrigin)
      case "ungroupEntities":
        return createUngroupEntitiesPatch(this.state, command.ids, command.portRemaps)
      case "reparentEntity":
        return createReparentEntityPatch(this.state, command.id, command.parentId)
      case "createPort":
        return createCreatePortPatch(this.state, command.port)
      case "setPortDirection":
        return createSetPortDirectionPatch(this.state, command.id, command.direction)
      case "createJunction":
        return createCreateJunctionPatch(this.state, command.junction)
      case "updateJunction":
        return createUpdateJunctionPatch(this.state, command.id, command.anchor)
      case "deleteEntities":
        return createDeleteEntitiesCommandPatch(this.state, command.ids)
      case "reconnectEdgeEndpoint":
        return createReconnectEdgeEndpointPatch(this.state, command.id, command.endpoint, command.connection)
      case "moveEdgeEndpoint":
        return createMoveEdgeEndpointPatch(this.state, command.id, command.endpoint, command.point)
      case "setEdgeRoute":
        return createSetEdgeRoutePatch(this.state, command.id, command.points)
      case "insertEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, command.point, "insert")
      case "moveEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, command.point, "move")
      case "removeEdgeWaypoint":
        return createEdgeWaypointPatch(this.state, command.id, command.index, null, "remove")
      case "updateEdgeRouting":
        return createUpdateEdgeRoutingPatch(this.state, command.id, command.routing)
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
        return createResizePatch(this.state, command.entries, command.snap)
      case "rotateEntities":
        return createRotatePatch(this.state, command.entries, command.snap)
      case "flipEntities":
        return createFlipPatch(this.state, command.ids ?? this.state.selection.ids, command.axis)
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
      case "updateEntityStyle":
        return createEntityStylePatch(this.state, command.id, command.visualStyle)
      case "updateEntities":
        return createEntityUpdatesPatchWithTextOrientation(this.state, command.updates)
      case "keyboard":
        return createKeyboardPatch(this.state, command.command, command.options ?? {})
      case "setSelection":
        return createSelectionPatch(this.state.selection, command.selection, command.mode ?? "replace")
      case "editText":
        return this.canEditText(command.id) ? createEditTextPatch(this.state, command.id, command.text) : null
      case "setViewport":
        return createViewportPatch(this.state.viewport, command.viewport)
    }
    return null
  }

  private snapToAlignment(point: DiagramPoint, radius: number, excludeIds?: ReadonlySet<DiagramId>, axisConstraint?: "x" | "y"): DiagramPoint | null {
    for (const id of this.state.order.nodeIds) {
      if (excludeIds?.has(id)) {
        continue
      }
      const geometry = this.getGeometry(id)
      if (!geometry) {
        continue
      }
      const center = { x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }
      if (axisConstraint !== "y" && Math.abs(center.x - point.x) <= radius) {
        return { x: center.x, y: point.y }
      }
      if (axisConstraint !== "x" && Math.abs(center.y - point.y) <= radius) {
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
    axisConstraint?: "x" | "y",
  ): { dx: number; dy: number; guides: DiagramSnapGuide[] } | null {
    const moving = { ...sourceBounds, x: targetOrigin.x, y: targetOrigin.y }
    let bestX: { delta: number; coordinate: number; start: number; end: number; startIsMoving: boolean; endIsMoving: boolean } | null = null
    let bestY: { delta: number; coordinate: number; start: number; end: number; startIsMoving: boolean; endIsMoving: boolean } | null = null
    // Alignment guides span the distance between objects, so a 2-D neighborhood
    // around the moving item misses valid guides on separated shapes. Query thin
    // indexed bands along each axis across the visible document extent instead
    // of scanning every entity or widening to an unbounded scene rectangle.
    const viewport = this.state.viewport
    const minX = Math.min(viewport.x, moving.x) - radius
    const maxX = Math.max(viewport.x + viewport.width, moving.x + moving.width) + radius
    const minY = Math.min(viewport.y, moving.y) - radius
    const maxY = Math.max(viewport.y + viewport.height, moving.y + moving.height) + radius
    const alignmentCandidates = new Set<DiagramId>([
      ...this.queryEntities({ bounds: { x: minX, y: moving.y - radius, width: maxX - minX, height: moving.height + radius * 2 }, kinds: ["node", "shape", "text"] }),
      ...this.queryEntities({ bounds: { x: moving.x - radius, y: minY, width: moving.width + radius * 2, height: maxY - minY }, kinds: ["node", "shape", "text"] }),
    ])
    for (const fixedId of alignmentCandidates) {
      if (excludeIds.has(fixedId)) continue
      const fixed = this.getGeometry(fixedId)?.bounds
      if (!fixed) continue
      if (axisConstraint !== "y") {
        const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
        const fixedX = [fixed.x, fixed.x + fixed.width / 2, fixed.x + fixed.width]
        for (const value of movingX) {
          for (const coordinate of fixedX) {
            const delta = coordinate - value
            if (Math.abs(delta) <= radius && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
              bestX = { delta, coordinate, start: Math.min(moving.y, fixed.y), end: Math.max(moving.y + moving.height, fixed.y + fixed.height), startIsMoving: moving.y <= fixed.y, endIsMoving: moving.y + moving.height >= fixed.y + fixed.height }
            }
          }
        }
      }
      if (axisConstraint !== "x") {
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
    const searchBounds = { x: moving.x - reach, y: moving.y - reach, width: moving.width + reach * 2, height: moving.height + reach * 2 }
    const order = this.createOrderIndex()
    let xBefore: { id: DiagramId; bounds: DiagramRect } | null = null
    let xAfter: { id: DiagramId; bounds: DiagramRect } | null = null
    let yBefore: { id: DiagramId; bounds: DiagramRect } | null = null
    let yAfter: { id: DiagramId; bounds: DiagramRect } | null = null
    const earlier = (candidate: DiagramId, current: DiagramId) => (order.get(candidate) ?? 0) < (order.get(current) ?? 0)
    for (const id of this.spatialIndex.queryVisible(searchBounds)) {
      if (excludeIds.has(id)) continue
      const kind = this.getEntityKind(id)
      if (kind !== "node" && kind !== "shape" && kind !== "text") continue
      const bounds = this.getGeometry(id)?.bounds
      if (!bounds) continue
      if (rangesOverlap(bounds.y, bounds.y + bounds.height, moving.y, moving.y + moving.height)) {
        if (bounds.x + bounds.width <= moving.x && (!xBefore || bounds.x + bounds.width > xBefore.bounds.x + xBefore.bounds.width || (bounds.x + bounds.width === xBefore.bounds.x + xBefore.bounds.width && earlier(id, xBefore.id)))) xBefore = { id, bounds }
        if (bounds.x >= moving.x + moving.width && (!xAfter || bounds.x < xAfter.bounds.x || (bounds.x === xAfter.bounds.x && earlier(id, xAfter.id)))) xAfter = { id, bounds }
      }
      if (rangesOverlap(bounds.x, bounds.x + bounds.width, moving.x, moving.x + moving.width)) {
        if (bounds.y + bounds.height <= moving.y && (!yBefore || bounds.y + bounds.height > yBefore.bounds.y + yBefore.bounds.height || (bounds.y + bounds.height === yBefore.bounds.y + yBefore.bounds.height && earlier(id, yBefore.id)))) yBefore = { id, bounds }
        if (bounds.y >= moving.y + moving.height && (!yAfter || bounds.y < yAfter.bounds.y || (bounds.y === yAfter.bounds.y && earlier(id, yAfter.id)))) yAfter = { id, bounds }
      }
    }
    let best: { axis: "x" | "y"; delta: number; before: DiagramRect; after: DiagramRect } | null = null
    if (!excludeAxes.has("x")) {
      if (xBefore && xAfter) {
        const delta = ((xAfter.bounds.x - moving.x - moving.width) - (moving.x - xBefore.bounds.x - xBefore.bounds.width)) / 2
        if (Math.abs(delta) <= radius) best = { axis: "x", delta, before: xBefore.bounds, after: xAfter.bounds }
      }
    }
    if (!excludeAxes.has("y")) {
      if (yBefore && yAfter) {
        const delta = ((yAfter.bounds.y - moving.y - moving.height) - (moving.y - yBefore.bounds.y - yBefore.bounds.height)) / 2
        if (Math.abs(delta) <= radius && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis: "y", delta, before: yBefore.bounds, after: yAfter.bounds }
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
      ...this.state.order.groupIds,
      ...this.state.order.tableIds,
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
    if (this.state.entities.groupsById.has(id)) return "group"
    if (this.state.entities.tablesById.has(id)) return "table"
    return null
  }

  private getEntityMetadata(id: DiagramId): Readonly<Record<string, unknown>> | undefined {
    return this.state.entities.nodesById.get(id)?.metadata
      ?? this.state.entities.edgesById.get(id)?.metadata
      ?? this.state.entities.textsById.get(id)?.metadata
      ?? this.state.entities.shapesById.get(id)?.metadata
      ?? this.state.entities.portsById.get(id)?.metadata
      ?? this.state.entities.junctionsById.get(id)?.metadata
      ?? this.state.entities.groupsById.get(id)?.metadata
      ?? this.state.entities.tablesById.get(id)?.metadata
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
    const group = this.state.entities.groupsById.get(id)
    if (group) {
      return group.childIds.length > 0
        && group.childIds.every((childId) => !this.isEntityLockedOrReadOnly(childId) && (this.isEntityTranslatable(childId) || this.state.entities.edgesById.has(childId)))
        && group.childIds.some((childId) => this.isEntityTranslatable(childId))
    }
    const edge = this.state.entities.edgesById.get(id)
    if (edge) return edge.source.kind === "point" || edge.target.kind === "point" || Boolean(edge.points?.length)
    return this.state.entities.nodesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.tablesById.has(id)
  }

  private isEntityResizable(id: DiagramId): boolean {
    return this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.edgesById.has(id) || this.state.entities.tablesById.has(id)
  }
}


function isBatchNoOp(state: InternalState, command: DiagramCommand): boolean {
  if (command.type === "reparentEntity") return resolveDiagramParentId(command.id, state.entities) === command.parentId
  if (command.type === "setTransformOrigin") {
    const entity = getDiagramRotationSnapshot(state, command.id)
    return Boolean(entity && (entity.kind === "edge" ? command.transformOrigin === null : JSON.stringify(entity.transformOrigin) === JSON.stringify(command.transformOrigin ?? undefined)))
  }
  if (command.type === "updateEntityStyle") {
    const entity = getStyleEntity(state, command.id)
    return Boolean(entity && JSON.stringify(entity.visualStyle) === JSON.stringify(command.visualStyle))
  }
  if (command.type === "updateShape") {
    const shape = state.entities.shapesById.get(command.id)
    return Boolean(shape && (shape.cornerRadius ?? 0) === command.cornerRadius)
  }
  if (command.type === "updateTableHeader") {
    const table = state.entities.tablesById.get(command.id)
    return Boolean(table && JSON.stringify(table.header) === JSON.stringify(command.header ?? undefined))
  }
  if (command.type === "updateEdgeRouting") {
    const edge = state.entities.edgesById.get(command.id)
    return Boolean(edge && JSON.stringify(edge.routing) === JSON.stringify(command.routing))
  }
  if (command.type === "updateEntities" && command.updates.every((update) => {
    if (!hasEntity(state, update.id)) return false
    const current = getEntityMetadata(state, update.id) ?? {}
    const metadataMatches = update.metadata === undefined || Object.entries(update.metadata).every(([key, value]) => Object.is(current[key], value))
    const text = state.entities.textsById.get(update.id)
    return metadataMatches && (update.orientationPolicy === undefined || update.orientationPolicy === text?.orientationPolicy)
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
  const tableText = state.entities.tablesById.get(id)?.cells?.flatMap((row) => row.map((cell) => cell.text)).join(" ")
  if (tableText?.toLocaleLowerCase().includes(normalizedText)) return true
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
    edges: scene.order.edgeIds.map((id) => scene.entities.edgesById.get(id)).filter(isDefined).map((edge) => {
      if (edge.routing?.mode !== "auto") return edge
      return { ...edge, points: resolveEdgePath(edge, scene.entities).slice(1, -1) }
    }),
    texts: scene.order.textIds.map((id) => scene.entities.textsById.get(id)).filter(isDefined),
    shapes: scene.order.shapeIds.map((id) => scene.entities.shapesById.get(id)).filter(isDefined),
    ports: [...scene.entities.portsById.values()],
    groups: scene.order.groupIds.map((id) => scene.entities.groupsById.get(id)).filter(isDefined),
    tables: scene.order.tableIds.map((id) => scene.entities.tablesById.get(id)).filter(isDefined),
    ...(scene.entities.junctionsById.size ? { junctions: [...scene.entities.junctionsById.values()] } : {}),
    selection: scene.selection,
    viewport: scene.viewport,
  }
}

export function deserializeScene(scene: SerializedDiagramScene): DiagramSceneInput {
  return validateSceneInput(scene)
}

export function deserializeDiagramDocument(input: DiagramDocument | SerializedDiagramScene): DiagramSceneInput {
  if (!input || typeof input !== "object") throw new TypeError("Invalid diagram document")
  if ("format" in input) {
    if (input.format !== "affino-diagram" || input.version !== 1 || !input.content || ![input.content.nodes, input.content.edges, input.content.texts, input.content.shapes, input.content.ports].every(Array.isArray) || (input.content.junctions !== undefined && !Array.isArray(input.content.junctions)) || (input.content.groups !== undefined && !Array.isArray(input.content.groups)) || (input.content.tables !== undefined && !Array.isArray(input.content.tables))) {
      throw new TypeError("Unsupported or invalid diagram document")
    }
    const view = input.view ?? {}
    return validateSceneInput({ ...input.content, ...(view.selection ? { selection: view.selection } : {}), ...(view.viewport ? { viewport: view.viewport } : {}) })
  }
  return validateSceneInput(input)
}

const DEFAULT_TABLE_STYLE: DiagramTableStyle = {
  grid: { visible: true, stroke: { color: "#D1D5DB", width: 1, style: "solid" } },
  border: { visible: true, stroke: { color: "#9CA3AF", width: 1, style: "solid" }, radius: 8 },
  cellPadding: 8,
  overflow: "clip",
}

function normalizeTable(table: DiagramTable): DiagramTable {
  const normalizedDefaultCell: DiagramTableCell = normalizeTableCell(table.defaultCell ?? { text: "" }, table.id, 0, 0)
  const { id: _defaultCellId, ...defaultCell } = normalizedDefaultCell
  const usedIds = new Set((table.cells ?? []).flatMap((row) => row.flatMap((cell) => cell.id ? [cell.id] : [])))
  const cells = Array.from({ length: table.rowCount }, (_, row) => Array.from({ length: table.columnCount }, (_, column) => {
    const cell = table.cells?.[row]?.[column] ?? defaultCell
    if ("id" in cell && cell.id) return normalizeTableCell(cell, table.id, row, column)
    let cellId = `${table.id}:cell:${row}:${column}`
    let suffix = 1
    while (usedIds.has(cellId)) cellId = `${table.id}:cell:${row}:${column}:${suffix++}`
    usedIds.add(cellId)
    return normalizeTableCell({ ...cell, id: cellId }, table.id, row, column)
  }))
  const rowHeights = table.rowHeights ? [...table.rowHeights] : Array(table.rowCount).fill(table.height / table.rowCount) as number[]
  const columnWidths = table.columnWidths ? [...table.columnWidths] : Array(table.columnCount).fill(table.width / table.columnCount) as number[]
  return { ...table, cells, rowHeights, columnWidths, defaultCell, merges: table.merges?.map((merge) => ({ ...merge })), style: normalizeTableStyle(table.style), ...(table.header ? { header: { ...table.header } } : {}) }
}

function normalizeTableCell(cell: DiagramTableCell, tableId = "table", row = 0, column = 0): DiagramTableCell { return { id: cell.id ?? `${tableId}:cell:${row}:${column}`, text: cell.text, ...(cell.horizontalAlign ? { horizontalAlign: cell.horizontalAlign } : {}), ...(cell.verticalAlign ? { verticalAlign: cell.verticalAlign } : {}), ...(cell.metadata ? { metadata: cloneDiagramMetadata(cell.metadata) } : {}), ...(cell.style ? { style: normalizeTableCellStyle(cell.style) } : {}) } }
function normalizeTableCellStyle(style: NonNullable<DiagramTableCell["style"]>): NonNullable<DiagramTableCell["style"]> { return { ...style, ...(style.padding ? { padding: { ...style.padding } } : {}), ...(style.text ? { text: { ...style.text } } : {}), ...(style.borders ? { borders: Object.fromEntries(Object.entries(style.borders).map(([side, border]) => [side, border ? { ...border, ...(border.stroke ? { stroke: { ...border.stroke } } : {}) } : border])) } : {}) } }
function mergeTableCellStyle(previous: DiagramTableCell["style"], update: NonNullable<DiagramTableCell["style"]>): NonNullable<DiagramTableCell["style"]> {
  const next: Record<string, unknown> = { ...(previous ?? {}), ...update }
  if (update.padding !== undefined) next.padding = { ...(previous?.padding ?? {}), ...update.padding }
  if (update.text !== undefined) next.text = { ...(previous?.text ?? {}), ...update.text }
  if (update.borders !== undefined) {
    const borders: Record<string, unknown> = { ...(previous?.borders ?? {}) }
    for (const [side, border] of Object.entries(update.borders)) {
      if (border === undefined) delete borders[side]
      else {
        const oldBorder = previous?.borders?.[side as keyof NonNullable<NonNullable<DiagramTableCell["style"]>["borders"]>]
        borders[side] = { ...oldBorder, ...border, ...(border.stroke ? { stroke: { ...oldBorder?.stroke, ...border.stroke } } : {}) }
      }
    }
    next.borders = borders
  }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  return next as NonNullable<DiagramTableCell["style"]>
}
function normalizeTableStyle(style?: DiagramTableStyle): DiagramTableStyle {
  return {
    grid: { ...DEFAULT_TABLE_STYLE.grid, ...style?.grid, stroke: { ...DEFAULT_TABLE_STYLE.grid.stroke, ...style?.grid?.stroke } },
    border: { ...DEFAULT_TABLE_STYLE.border, ...style?.border, stroke: { ...DEFAULT_TABLE_STYLE.border.stroke, ...style?.border?.stroke } },
    cellPadding: style?.cellPadding ?? DEFAULT_TABLE_STYLE.cellPadding,
    ...(style?.background !== undefined ? { background: style.background } : {}),
    ...(style?.text ? { text: { ...style.text } } : {}),
    overflow: style?.overflow ?? "clip",
  }
}

function validateDiagramTable(source: DiagramTable): void {
  if (!source || source.kind !== "table" || ![source.x, source.y, source.width, source.height, source.rotation ?? 0].every(Number.isFinite) || source.width <= 0 || source.height <= 0 || !validFlipFlags(source)) throw new TypeError(`Invalid geometry for table ${source?.id ?? ""}`)
  if (!Number.isInteger(source.rowCount) || source.rowCount < 1 || !Number.isInteger(source.columnCount) || source.columnCount < 1) throw new TypeError(`Invalid dimensions for table ${source.id}: at least one row and column are required`)
  if (source.cells !== undefined && (!Array.isArray(source.cells) || source.cells.length !== source.rowCount || source.cells.some((row) => !Array.isArray(row) || row.length !== source.columnCount))) throw new TypeError(`Invalid cell matrix for table ${source.id}`)
  for (const row of source.cells ?? []) for (const cell of row) validateTableCell(cell, source.id)
  const sourceCells: ReadonlyArray<ReadonlyArray<DiagramTableCell>> = source.cells ?? []
  const ids: string[] = sourceCells.flatMap((row: ReadonlyArray<DiagramTableCell>) => row.map((cell: DiagramTableCell) => cell.id).filter((cellId: string | undefined): cellId is string => cellId !== undefined))
  if (new Set(ids).size !== ids.length) throw new TypeError(`Duplicate cell identity in table ${source.id}`)
  if (source.merges !== undefined) {
    if (!Array.isArray(source.merges)) throw new TypeError(`Invalid merged regions for table ${source.id}`)
    const positions = new Map<string, { row: number; column: number }>()
    sourceCells.forEach((row: ReadonlyArray<DiagramTableCell>, rowIndex: number) => row.forEach((cell: DiagramTableCell, columnIndex: number) => { if (cell.id) positions.set(cell.id, { row: rowIndex, column: columnIndex }) }))
    const occupied = new Set<string>()
    for (const merge of source.merges) {
      const anchor = positions.get(merge.anchorCellId)
      if (!anchor || !Number.isInteger(merge.rowSpan) || !Number.isInteger(merge.columnSpan) || merge.rowSpan < 1 || merge.columnSpan < 1 || anchor.row + merge.rowSpan > source.rowCount || anchor.column + merge.columnSpan > source.columnCount) throw new TypeError(`Invalid merged region in table ${source.id}`)
      for (let row = anchor.row; row < anchor.row + merge.rowSpan; row += 1) for (let column = anchor.column; column < anchor.column + merge.columnSpan; column += 1) {
        const key = `${row}:${column}`
        if (occupied.has(key)) throw new TypeError(`Overlapping merged regions in table ${source.id}`)
        occupied.add(key)
      }
    }
  }
  if (source.defaultCell) validateTableCell(source.defaultCell, source.id)
  if (source.header !== undefined && !isValidDiagramTableHeader(source.header)) throw new TypeError(`Invalid header for table ${source.id}`)
  if (source.header && (![source.y - source.header.height, source.height + source.header.height].every(Number.isFinite))) throw new TypeError(`Invalid header geometry for table ${source.id}`)
  if (source.rowHeights && (!validSizes(source.rowHeights, source.rowCount) || !sizesMatch(source.rowHeights, source.height))) throw new TypeError(`Invalid row heights for table ${source.id}`)
  if (source.columnWidths && (!validSizes(source.columnWidths, source.columnCount) || !sizesMatch(source.columnWidths, source.width))) throw new TypeError(`Invalid column widths for table ${source.id}`)
  if (source.style && !validTableStyleShape(source.style)) throw new TypeError(`Invalid style for table ${source.id}`)
  validateDiagramTableStyle(normalizeTableStyle(source.style), source.id)
}

function isValidDiagramTableHeader(header: DiagramTableHeader): boolean {
  return Boolean(header && Object.keys(header).every((key) => ["text", "height", "horizontalAlign", "verticalAlign"].includes(key))
    && typeof header.text === "string" && Number.isFinite(header.height) && header.height > 0
    && (header.horizontalAlign === undefined || ["left", "center", "right"].includes(header.horizontalAlign))
    && (header.verticalAlign === undefined || ["top", "middle", "bottom"].includes(header.verticalAlign)))
}

function validFlipFlags(entity: { flipX?: unknown; flipY?: unknown }): boolean {
  return (entity.flipX === undefined || typeof entity.flipX === "boolean")
    && (entity.flipY === undefined || typeof entity.flipY === "boolean")
}

function validTransformOrigin(entity: { transformOrigin?: unknown }): boolean {
  const origin = entity.transformOrigin as { mode?: unknown; x?: unknown; y?: unknown } | undefined
  return origin === undefined || Boolean(origin && (origin.mode === "relative" || origin.mode === "absolute") && typeof origin.x === "number" && Number.isFinite(origin.x) && typeof origin.y === "number" && Number.isFinite(origin.y))
}

function isValidEdgeRouting(routing: DiagramEdgeRouting): boolean {
  return Boolean(routing && (routing.mode === "manual" || routing.mode === "auto")
    && (routing.strategy === undefined || routing.strategy === "simple" || routing.strategy === "obstacle-aware")
    && (routing.strictGrid === undefined || typeof routing.strictGrid === "boolean")
    && (routing.gridSize === undefined || Number.isFinite(routing.gridSize) && routing.gridSize > 0)
    && (!routing.strictGrid || Number.isFinite(routing.gridSize) && routing.gridSize! > 0)
    && (routing.clearance === undefined || Number.isFinite(routing.clearance) && routing.clearance >= 0)
    && (routing.terminalLead === undefined || Number.isFinite(routing.terminalLead) && routing.terminalLead >= 0)
    && (routing.firstAxis === undefined || routing.firstAxis === "horizontal" || routing.firstAxis === "vertical")
    && (routing.sourceDirection === undefined || ["north", "east", "south", "west"].includes(routing.sourceDirection))
    && (routing.targetDirection === undefined || ["north", "east", "south", "west"].includes(routing.targetDirection))
    && (routing.maxBends === undefined || Number.isInteger(routing.maxBends) && routing.maxBends >= 0)
    && (routing.maxRouteBends === undefined || Number.isInteger(routing.maxRouteBends) && routing.maxRouteBends >= 0)
    && (routing.tieBreak === undefined || ["coordinates", "horizontal-first", "vertical-first"].includes(routing.tieBreak))
    && (routing.waypoints === undefined || routing.waypoints.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    && (routing.routeHint === undefined || Number.isFinite(routing.routeHint.x) && Number.isFinite(routing.routeHint.y)))
}

function validateTableCell(cell: DiagramTableCell, id: DiagramId): void {
  if (!cell || Object.keys(cell).some((key) => !["id", "text", "horizontalAlign", "verticalAlign", "metadata", "style"].includes(key)) || (cell.id !== undefined && (typeof cell.id !== "string" || !cell.id)) || typeof cell.text !== "string" || (cell.horizontalAlign !== undefined && !["left", "center", "right"].includes(cell.horizontalAlign)) || (cell.verticalAlign !== undefined && !["top", "middle", "bottom"].includes(cell.verticalAlign)) || !isValidDiagramMetadata(cell.metadata) || !isValidDiagramTableCellStyle(cell.style)) throw new TypeError(`Invalid cell in table ${id}`)
}
function isValidDiagramTableCellStyle(style: DiagramTableCell["style"]): boolean {
  if (style === undefined) return true
  if (!style || typeof style !== "object" || Object.keys(style).some((key) => !["background", "padding", "text", "borders", "overflow"].includes(key))) return false
  if (style.background !== undefined && style.background !== null && (typeof style.background !== "string" || !style.background.trim())) return false
  if (style.padding && (Object.keys(style.padding).some((key) => !["top", "right", "bottom", "left"].includes(key)) || Object.values(style.padding).some((value) => !Number.isFinite(value) || value! < 0))) return false
  if (style.text && !isValidVisualStyle(style.text)) return false
  if (style.overflow !== undefined && !["clip", "visible", "wrap"].includes(style.overflow)) return false
  if (style.borders) {
    for (const [side, border] of Object.entries(style.borders)) {
      if (!["top", "right", "bottom", "left"].includes(side) || !border || typeof border.visible !== "boolean") return false
      const stroke = border.stroke
      if (!stroke) continue
      if (Object.keys(stroke).some((key) => !["color", "width", "style"].includes(key))) return false
      if (stroke.color !== undefined && (typeof stroke.color !== "string" || !stroke.color.trim())) return false
      if (stroke.width !== undefined && (!Number.isFinite(stroke.width) || stroke.width < 0)) return false
      if (stroke.style !== undefined && !["solid", "dashed", "dotted"].includes(stroke.style)) return false
    }
  }
  return true
}
function validTableStyleShape(style: unknown): style is DiagramTableStyle {
  if (!style || typeof style !== "object") return false
  const value = style as Record<string, unknown>
  const grid = value.grid as Record<string, unknown> | undefined
  const border = value.border as Record<string, unknown> | undefined
  const validStrokeShape = (stroke: unknown) => Boolean(stroke && typeof stroke === "object" && Object.keys(stroke).every((key) => ["color", "width", "style"].includes(key)))
  return Object.keys(value).every((key) => ["grid", "border", "cellPadding", "background", "text", "overflow"].includes(key))
    && Boolean(grid && Object.keys(grid).every((key) => ["visible", "stroke"].includes(key)) && (grid.stroke === undefined || validStrokeShape(grid.stroke)))
    && Boolean(border && Object.keys(border).every((key) => ["visible", "stroke", "radius"].includes(key)) && (border.stroke === undefined || validStrokeShape(border.stroke)))
}
function validateDiagramTableStyle(style: DiagramTableStyle, id: DiagramId): void {
  const validStroke = (stroke: DiagramTableStyle["grid"]["stroke"]) => typeof stroke.color === "string" && stroke.color.trim().length > 0 && Number.isFinite(stroke.width) && stroke.width >= 0 && ["solid", "dashed", "dotted"].includes(stroke.style)
  if (typeof style.grid.visible !== "boolean" || typeof style.border.visible !== "boolean" || !validStroke(style.grid.stroke) || !validStroke(style.border.stroke) || !Number.isFinite(style.border.radius) || style.border.radius < 0 || !Number.isFinite(style.cellPadding ?? NaN) || (style.cellPadding ?? -1) < 0 || (style.background !== undefined && style.background !== null && (typeof style.background !== "string" || !style.background.trim())) || !isValidVisualStyle(style.text) || !["clip", "visible", "wrap"].includes(style.overflow ?? "clip")) throw new TypeError(`Invalid style for table ${id}`)
}
function validSizes(values: ReadonlyArray<number>, expectedLength: number): boolean { return values.length === expectedLength && values.every((value) => Number.isFinite(value) && value > 0) }
function sizesMatch(values: ReadonlyArray<number>, total: number): boolean { return Math.abs(values.reduce((sum, value) => sum + value, 0) - total) <= Math.max(0.01, total * 1e-6) }

export function validateDiagramScene(scene: DiagramSceneInput): ReadonlyArray<DiagramValidationIssue> {
  try {
    validateSceneInput(scene)
    return Object.freeze(portOwnerHintIssues(scene))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const entityMatch = message.match(/(?:geometry for (?:node|text|shape|table)|port |edge |group |table |node )(.+?)(?::|$)/i)
    const code = message.includes("globally unique") ? "duplicate-id"
      : message.includes("Invalid geometry") ? "invalid-geometry"
        : message.includes("visual style") ? "invalid-visual-style"
        : message.includes("Invalid port") || message.includes("port reference") ? "invalid-port-reference"
          : message.includes("Invalid edge") ? "invalid-edge-reference"
            : message.includes("Invalid group") ? "invalid-group"
              : message.includes("viewport") ? "invalid-viewport"
                : message.includes("table") ? "invalid-table"
                  : "invalid-scene"
    return Object.freeze([{ code, severity: "error" as const, entityIds: Object.freeze(entityMatch ? [entityMatch[1]!.trim()] : []), message }])
  }
}

function validateSceneInput(scene: DiagramSceneInput): DiagramSceneInput {
  const nodesInput = scene.nodes ?? []
  const edgesInput = scene.edges ?? []
  const textsInput = scene.texts ?? []
  const shapesInput = scene.shapes ?? []
  const portsInput = scene.ports ?? []
  const junctionsInput = scene.junctions ?? []
  const groupsInput = scene.groups ?? []
  const tablesInput = scene.tables ?? []
  if (![nodesInput, edgesInput, textsInput, shapesInput, portsInput, junctionsInput, groupsInput, tablesInput].every(Array.isArray)) throw new TypeError("Invalid diagram scene collections")
  const ids = new Set<string>()
  for (const entity of [...nodesInput, ...edgesInput, ...textsInput, ...shapesInput, ...portsInput, ...junctionsInput, ...groupsInput, ...tablesInput]) {
    if (!entity || typeof entity.id !== "string" || !entity.id || ids.has(entity.id)) throw new TypeError("Diagram entity IDs must be non-empty and globally unique")
    if (!isValidVisualStyle(entity.visualStyle)) throw new TypeError(`Invalid visual style for entity ${entity.id}`)
    if ("transformOrigin" in entity && !validTransformOrigin(entity)) throw new TypeError(`Invalid transform origin for entity ${entity.id}`)
    if ("parentOffset" in entity && entity.parentOffset !== undefined && (![entity.parentOffset.x, entity.parentOffset.y].every(Number.isFinite))) throw new TypeError(`Invalid parent offset for entity ${entity.id}`)
    ids.add(entity.id)
  }
  const nodes = new Set(nodesInput.map((node) => node.id))
  const ports = new Map(portsInput.map((port) => [port.id, port]))
  const edges = new Map(edgesInput.map((edge) => [edge.id, edge]))
  const junctions = new Map(junctionsInput.map((junction) => [junction.id, junction]))
  for (const junction of junctionsInput) {
    const anchorValid = junction.anchor?.kind === "route"
      ? Number.isFinite(junction.anchor.fraction) && junction.anchor.fraction >= 0 && junction.anchor.fraction <= 1
      : junction.anchor?.kind === "fixed" && Number.isFinite(junction.anchor.point?.x) && Number.isFinite(junction.anchor.point?.y)
    if (junction.kind !== "junction" || !edges.has(junction.hostEdgeId) || junction.hostEdgeId === junction.id || !anchorValid) throw new TypeError(`Invalid junction ${junction.id}`)
  }
  for (const node of nodesInput) if (![node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) || node.width < 0 || node.height < 0 || !validFlipFlags(node)) throw new TypeError(`Invalid geometry for node ${node.id}`)
  for (const port of portsInput) {
    const legacyNodePort = "nodeId" in port && typeof port.nodeId === "string"
    const validPosition = legacyNodePort ? nodes.has(port.nodeId) && [port.x, port.y].every(Number.isFinite) : "hostId" in port && typeof port.hostId === "string" && "anchor" in port && Boolean(port.anchor)
    const validDirection = port.direction === undefined || ["north", "east", "south", "west", "auto", "any"].includes(port.direction)
    if (!validPosition || !validDirection || (port.radius !== undefined && (!Number.isFinite(port.radius) || port.radius < 0))) throw new TypeError(`Invalid port ${port.id}`)
  }
  for (const text of textsInput) if (![text.x, text.y, text.width ?? 0, text.height ?? 0, text.fontSize ?? 0, text.rotation ?? 0].every(Number.isFinite) || !validFlipFlags(text) || (text.orientationPolicy !== undefined && !["inherit", "keep-readable", "keep-horizontal"].includes(text.orientationPolicy))) throw new TypeError(`Invalid geometry for text ${text.id}`)
  for (const shape of shapesInput) if (!isValidDiagramShape(shape)) throw new TypeError(`Invalid geometry for shape ${shape.id}`)
  for (const table of tablesInput) validateDiagramTable(table)
  for (const edge of edgesInput) {
    const validEndpoint = (endpoint: DiagramEdgeEndpoint) => endpoint.kind === "point" ? Number.isFinite(endpoint.point.x) && Number.isFinite(endpoint.point.y) : endpoint.kind === "node" ? nodes.has(endpoint.nodeId) : endpoint.kind === "port" ? ports.has(endpoint.portId) : endpoint.kind === "junction" && junctions.has(endpoint.junctionId)
    const routing = edge.routing
    const validDirection = (value: unknown) => value === undefined || ["north", "east", "south", "west"].includes(value as string)
    const validRouting = routing === undefined || (routing.mode === "manual" || routing.mode === "auto")
      && (routing.strategy === undefined || routing.strategy === "simple" || routing.strategy === "obstacle-aware")
      && Number.isFinite(routing.clearance ?? 0) && (routing.clearance ?? 0) >= 0
      && Number.isFinite(routing.terminalLead ?? 12) && (routing.terminalLead ?? 12) >= 0
      && (routing.maxBends === undefined || Number.isInteger(routing.maxBends) && routing.maxBends >= 0)
      && (routing.maxRouteBends === undefined || Number.isInteger(routing.maxRouteBends) && routing.maxRouteBends >= 0)
      && (routing.firstAxis === undefined || routing.firstAxis === "horizontal" || routing.firstAxis === "vertical")
      && validDirection(routing.sourceDirection) && validDirection(routing.targetDirection)
      && (routing.tieBreak === undefined || ["coordinates", "horizontal-first", "vertical-first"].includes(routing.tieBreak))
      && (routing.waypoints ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      && (routing.routeHint === undefined || Number.isFinite(routing.routeHint.x) && Number.isFinite(routing.routeHint.y))
    if (!validEndpoint(edge.source) || !validEndpoint(edge.target) || !Number.isFinite(edge.rotation ?? 0) || !(edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)) || !validRouting) throw new TypeError(`Invalid edge ${edge.id}`)
  }
  for (const edge of edgesInput) {
    if (hasRouteAttachmentCycle(edge, edges, junctions, ports)) throw new TypeError(`Invalid edge ${edge.id}: connector attachments cannot form a route cycle`)
  }
  const groupedChildren = new Set<DiagramId>()
  const groupable = new Set<DiagramId>([...nodesInput, ...edgesInput, ...textsInput, ...shapesInput, ...tablesInput, ...groupsInput].map((entity) => entity.id))
  for (const group of groupsInput) {
    if (group.kind !== "group" || !Array.isArray(group.childIds) || new Set(group.childIds).size !== group.childIds.length || !Number.isFinite(group.rotation ?? 0) || (group.x !== undefined && !Number.isFinite(group.x)) || (group.y !== undefined && !Number.isFinite(group.y)) || !validFlipFlags(group)) throw new TypeError(`Invalid group ${group.id}: groups require unique children and finite transform values`)
    for (const childId of group.childIds) {
      if (childId === group.id || !groupable.has(childId) || groupedChildren.has(childId)) throw new TypeError(`Invalid group ${group.id}: unknown, cyclic, port, or already grouped child ${childId}`)
      const edge = edges.get(childId)
      if ((group.x !== undefined || group.y !== undefined) && edge && (edge.source.kind !== "point" || edge.target.kind !== "point")) throw new TypeError(`Invalid retained group ${group.id}: connectors with attached endpoints stay in document coordinates`)
      groupedChildren.add(childId)
    }
  }
  const groupsById = new Map(groupsInput.map((group) => [group.id, group]))
  const visitGroup = (id: DiagramId, active: Set<DiagramId>, visited: Set<DiagramId>) => {
    if (active.has(id)) throw new TypeError(`Invalid group ${id}: group hierarchy contains a cycle`)
    if (visited.has(id)) return
    active.add(id)
    for (const childId of groupsById.get(id)?.childIds ?? []) if (groupsById.has(childId)) visitGroup(childId, active, visited)
    active.delete(id)
    visited.add(id)
  }
  const visitedGroups = new Set<DiagramId>()
  for (const group of groupsInput) visitGroup(group.id, new Set(), visitedGroups)
  const portEntities = {
    nodesById: new Map(nodesInput.map((entity) => [entity.id, entity])),
    edgesById: new Map(edgesInput.map((entity) => [entity.id, entity])),
    textsById: new Map(textsInput.map((entity) => [entity.id, entity])),
    shapesById: new Map(shapesInput.map((entity) => [entity.id, entity])),
    portsById: new Map(portsInput.map((entity) => [entity.id, entity])),
    junctionsById: new Map(junctionsInput.map((entity) => [entity.id, entity])),
    groupsById: new Map(groupsInput.map((entity) => [entity.id, entity])),
    tablesById: new Map(tablesInput.map((entity) => [entity.id, entity])),
  }
  for (const port of portsInput) {
    if ("nodeId" in port && port.nodeId) continue
    const anchored = port as Extract<DiagramPort, { hostId: DiagramId }>
    if (!anchored.hostId || !isValidDiagramPortAnchor(anchored.hostId, anchored.anchor, portEntities)) throw new TypeError(`Invalid port anchor ${port.id}`)
  }
  const fixedJunctionFailure = fixedJunctionRouteFailure(portEntities)
  if (fixedJunctionFailure) throw new TypeError(fixedJunctionFailure)
  if (scene.viewport && (![scene.viewport.x, scene.viewport.y, scene.viewport.width, scene.viewport.height, scene.viewport.zoom].filter((value) => value !== undefined).every(Number.isFinite) || (scene.viewport.zoom !== undefined && scene.viewport.zoom <= 0))) throw new TypeError("Invalid diagram viewport")
  const selectionIds = scene.selection?.ids ?? []
  if (selectionIds.some((id) => !ids.has(id))) throw new TypeError("Diagram selection contains an unknown entity")
  return { ...scene, nodes: normalizeNodePortHints(nodesInput, portsInput), edges: edgesInput, texts: textsInput, shapes: shapesInput, ports: portsInput, junctions: junctionsInput, groups: normalizeLegacyGroups(groupsInput, edgesInput), tables: tablesInput.map(normalizeTable) }
}

/**
 * @deprecated Legacy baked-group loading adapter. Retained group transforms are canonical;
 * remove after the next-major legacy document migration window closes.
 */
function normalizeLegacyGroups(groups: ReadonlyArray<DiagramGroup>, edges: ReadonlyArray<DiagramEdge>): DiagramGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const legacyIds = new Set(groups.filter((group) => group.x === undefined && group.y === undefined).map((group) => group.id))
  const unsafe = new Set<DiagramId>()
  for (const group of groups) {
    const pending = [group.id]
    const descendants = new Set<DiagramId>()
    while (pending.length) {
      const id = pending.pop()!
      if (descendants.has(id)) continue
      descendants.add(id)
      pending.push(...(byId.get(id)?.childIds ?? []))
    }
    if (edges.some((edge) => descendants.has(edge.id) && (edge.source.kind !== "point" || edge.target.kind !== "point"))) unsafe.add(group.id)
  }
  // A retained ancestor cannot compose through a legacy descendant that still owns world-space attached routes.
  let changed = true
  while (changed) {
    changed = false
    for (const group of groups) if (!unsafe.has(group.id) && group.childIds.some((id) => unsafe.has(id))) { unsafe.add(group.id); changed = true }
  }
  return groups.map((group) => legacyIds.has(group.id) && !unsafe.has(group.id)
    ? { ...group, x: 0, y: 0, rotation: 0, flipX: false, flipY: false }
    : group)
}

function normalizeNodePortHints(nodes: ReadonlyArray<DiagramNode>, ports: ReadonlyArray<DiagramPort>): DiagramNode[] {
  const portsById = new Map(ports.map((port) => [port.id, port]))
  return nodes.map((node) => {
    const owned = ports.filter((port) => diagramPortHostId(port) === node.id).map((port) => port.id)
    const orderHint = (node.portIds ?? []).filter((id, index, all) => all.indexOf(id) === index && diagramPortHostIdSafe(portsById.get(id)) === node.id)
    const portIds = [...orderHint, ...owned.filter((id) => !orderHint.includes(id))]
    return portIds.length || node.portIds !== undefined ? { ...node, portIds } : node
  })
}

function portOwnerHintIssues(scene: DiagramSceneInput): DiagramValidationIssue[] {
  const nodes = scene.nodes ?? []
  const portsById = new Map((scene.ports ?? []).map((port) => [port.id, port]))
  return nodes.flatMap((node) => (node.portIds ?? []).flatMap((id) =>
    diagramPortHostIdSafe(portsById.get(id)) === node.id ? [] : [{ code: "port-owner-hint-conflict", severity: "warning" as const, entityIds: [node.id, id], message: `Node ${node.id} portIds contains stale or contradictory hint ${id}; the port's nodeId/hostId remains authoritative.` }]))
}

function diagramPortHostIdSafe(port: DiagramPort | undefined): DiagramId | undefined {
  return port ? diagramPortHostId(port) : undefined
}

function createMovePatch(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint, snap: DiagramGridSnapOptions = {}): Patch | null {
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  ids = normalizeGroupSelectionIds(state, ids)
  const groupIds = ids.filter((id) => state.entities.groupsById.has(id))
  const expandedIds = [
    ...ids.filter((id) => !state.entities.groupsById.has(id)),
    ...groupIds.flatMap((id) => {
      const group = state.entities.groupsById.get(id)!
      if (group.x !== undefined || group.y !== undefined) return isEntityLockedOrReadOnly(state, id) ? [] : [id]
      // TODO(next-major): Remove child expansion for legacy baked groups.
      return !isEntityLockedOrReadOnly(state, id) && isGroupMovable(state, id) ? groupMembers(state, id) : []
    }),
  ]
  const movableIds = [...new Set(expandedIds)].filter((id) => !isEntityLockedOrReadOnly(state, id) && (
    state.entities.nodesById.has(id)
    || isEdgeTranslatable(state.entities.edgesById.get(id))
    || state.entities.textsById.has(id)
    || state.entities.shapesById.has(id)
    || state.entities.tablesById.has(id)
    || state.entities.groupsById.has(id)
  ))
  if (!movableIds.length) {
    return null
  }
  const gridSize = snap.strictGrid === true && Number.isFinite(snap.gridSize) && snap.gridSize! > 0 ? snap.gridSize! : undefined
  const deltas = new Map<DiagramId, DiagramPoint>()
  for (const id of movableIds) {
    let resolvedDelta = delta
    if (gridSize) {
      const geometry = createEntityGeometry(id, state.entities)
      if (geometry) resolvedDelta = {
        x: Math.round((geometry.bounds.x + delta.x) / gridSize) * gridSize - geometry.bounds.x,
        y: Math.round((geometry.bounds.y + delta.y) / gridSize) * gridSize - geometry.bounds.y,
      }
    }
    deltas.set(id, resolvedDelta)
  }
  const inverseDeltas = new Map([...deltas].map(([id, value]) => [id, { x: -value.x, y: -value.y }]))
  return { apply: (next) => applyMoveDeltas(next, movableIds, deltas), inverse: createMovePatchUnchecked(movableIds, inverseDeltas) }
}

function isEdgeTranslatable(edge: DiagramEdge | undefined): boolean {
  return Boolean(edge && (edge.source.kind === "point" || edge.target.kind === "point" || edge.points?.length))
}

function isFreeEdgeRotatable(edge: DiagramEdge | undefined): edge is DiagramEdge & Readonly<{ source: Extract<DiagramEdgeEndpoint, { kind: "point" }>; target: Extract<DiagramEdgeEndpoint, { kind: "point" }> }> {
  return Boolean(edge && edge.source.kind === "point" && edge.target.kind === "point")
}

function createMovePatchUnchecked(ids: ReadonlyArray<DiagramId>, deltas: ReadonlyMap<DiagramId, DiagramPoint>): Patch {
  return {
    apply: (next) => applyMoveDeltas(next, ids, deltas),
    inverse: undefined as unknown as Patch,
  }
}

function applyMoveDeltas(state: InternalState, ids: ReadonlyArray<DiagramId>, deltas: ReadonlyMap<DiagramId, DiagramPoint>): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const id of ids) {
    const delta = deltas.get(id) ?? { x: 0, y: 0 }
    if (delta.x === 0 && delta.y === 0) continue
    const translate = (point: DiagramPoint): DiagramPoint => ({ x: point.x + delta.x, y: point.y + delta.y })
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
        ...(edge.routing?.mode === "auto" ? { routing: { ...edge.routing, ...(edge.routing.waypoints ? { waypoints: edge.routing.waypoints.map(translate) } : {}), ...(edge.routing.routeHint ? { routeHint: translate(edge.routing.routeHint) } : {}) } } : {}),
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
      continue
    }
    const table = state.entities.tablesById.get(id)
    if (table) {
      state.entities.tablesById.set(id, { ...table, x: table.x + delta.x, y: table.y + delta.y })
      changed.add(id)
      continue
    }
    const group = state.entities.groupsById.get(id)
    if (group) { state.entities.groupsById.set(id, { ...group, x: (group.x ?? 0) + delta.x, y: (group.y ?? 0) + delta.y }); changed.add(id) }
  }
  return changed
}

function portAtGridPoint(port: DiagramPort, entities: MutableEntities, gridSize: number): DiagramPort | null {
  const world = resolvePortPoint(port, entities)
  const point = { x: Math.round(world.x / gridSize) * gridSize, y: Math.round(world.y / gridSize) * gridSize }
  if ("nodeId" in port && port.nodeId) {
    const node = entities.nodesById.get(port.nodeId)
    if (!node) return null
    const bounds = { x: node.x, y: node.y, width: node.width, height: node.height }
    const local = inverseTransformPointAround(point, resolveTransformOrigin(bounds, node.transformOrigin), node.rotation ?? 0, node.flipX === true, node.flipY === true)
    return { ...port, x: local.x - node.x, y: local.y - node.y }
  }
  if (!("hostId" in port) || !port.hostId || port.anchor.kind !== "local") return null
  const geometry = createEntityGeometry(port.hostId, entities)
  const hostBounds = geometry?.unrotatedBounds ?? geometry?.bounds
  if (!hostBounds) return null
  const host = entities.nodesById.get(port.hostId) ?? entities.shapesById.get(port.hostId) ?? entities.textsById.get(port.hostId) ?? entities.tablesById.get(port.hostId)
  const local = host
    ? inverseTransformPointAround(point, resolveTransformOrigin(hostBounds, host.transformOrigin), host.rotation ?? 0, host.flipX === true, host.flipY === true)
    : point
  const x = local.x - hostBounds.x, y = local.y - hostBounds.y
  return { ...port, anchor: { kind: "local", x, y } }
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
  const previousPoints = [...(edge.routing?.mode === "auto" ? edge.routing.waypoints ?? [] : edge.points ?? [])]
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
  if (edge.routing?.mode === "auto") return createUpdateEdgeRoutingPatch(state, id, { ...edge.routing, waypoints: nextPoints })
  return createEdgePointsPatch(id, previousPoints, nextPoints)
}

function createUpdateEdgeRoutingPatch(state: InternalState, id: DiagramId, routing: DiagramEdgeRouting): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id) || !isValidEdgeRouting(routing) || JSON.stringify(edge.routing) === JSON.stringify(routing)) return null
  const previous = edge.routing
  return {
    apply: (next) => {
      const current = next.entities.edgesById.get(id)
      if (!current) return new Set()
      next.entities.edgesById.set(id, { ...current, routing })
      return new Set([id])
    },
    inverse: {
      apply: (next) => {
        const current = next.entities.edgesById.get(id)
        if (!current) return new Set()
        const { routing: _routing, ...rest } = current
        next.entities.edgesById.set(id, previous ? { ...rest, routing: previous } : rest)
        return new Set([id])
      },
      inverse: undefined as unknown as Patch,
    },
  }
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

function createSetEdgeRoutePatch(state: InternalState, id: DiagramId, points: ReadonlyArray<DiagramPoint>): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id) || !Array.isArray(points)) return null
  const path = normalizeOrthogonalRoute([resolveEndpoint(edge.source, state.entities), ...points, resolveEndpoint(edge.target, state.entities)])
  if (!path || path.length < 2) return null
  const next: DiagramEdge = { ...edge, points: path.slice(1, -1), routing: { mode: "manual" } }
  if (JSON.stringify(edge.points) === JSON.stringify(next.points) && edge.routing?.mode === "manual") return null
  const apply = (value: DiagramEdge): Patch["apply"] => (draft) => {
    if (!draft.entities.edgesById.has(id)) return new Set()
    draft.entities.edgesById.set(id, value)
    return new Set([id])
  }
  return { apply: apply(next), inverse: { apply: apply(edge), inverse: undefined as unknown as Patch } }
}

function createResizePatch(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>, snap: DiagramGridSnapOptions = {}): Patch | null {
  const gridSize = snap.strictGrid === true && Number.isFinite(snap.gridSize) && snap.gridSize! > 0 ? snap.gridSize! : undefined
  if (gridSize) {
    const entities = snapshotEntities(state)
    entries = entries.map((entry) => {
      const geometry = createEntityGeometry(entry.id, entities)
      const rectangular = state.entities.shapesById.get(entry.id) ?? state.entities.nodesById.get(entry.id) ?? state.entities.textsById.get(entry.id) ?? state.entities.tablesById.get(entry.id)
      const bounds = rectangular ? { x: rectangular.x, y: rectangular.y, width: rectangular.width ?? geometry?.bounds.width ?? 0, height: rectangular.height ?? geometry?.bounds.height ?? 0 } : geometry?.unrotatedBounds ?? geometry?.bounds
      return snapResizeEntryToGrid({
        ...entry,
        ...(bounds ? { x: entry.x ?? bounds.x, y: entry.y ?? bounds.y, width: entry.width ?? bounds.width, height: entry.height ?? bounds.height } : {}),
      }, gridSize)
    })
  }
  const groupEntries = entries.filter((entry) => state.entities.groupsById.has(entry.id))
  if (!groupEntries.length) return createResizePatchForEntities(state, entries, snap)
  if (groupEntries.some((entry) => {
    const group = state.entities.groupsById.get(entry.id)!
    return group.x !== undefined || group.y !== undefined
  })) return null // Affine group scaling is not a supported command; do not bake it into descendants.
  if (groupEntries.some((entry) => {
    const group = state.entities.groupsById.get(entry.id)!
    return isEntityLockedOrReadOnly(state, entry.id)
      || group.childIds.some((id) => isEntityLockedOrReadOnly(state, id) || !isGroupResizableEntity(state, id))
  })) return null

  const groupedChildren = new Set(groupEntries.flatMap((entry) => groupMembers(state, entry.id)))
  const regularPatch = createResizePatchForEntities(state, entries.filter((entry) => !state.entities.groupsById.has(entry.id) && !groupedChildren.has(entry.id)), snap)
  const rectEntries: DiagramResizeEntry[] = []
  const portPatches: Patch[] = []
  const previousEdges = new Map<DiagramId, DiagramEdge>()
  const nextEdges = new Map<DiagramId, DiagramEdge>()
  const entities = snapshotEntities(state)
  for (const entry of groupEntries) {
    const geometry = createEntityGeometry(entry.id, entities)
    if (!geometry) return null
    const base = geometry.bounds
    const nextBounds = { x: entry.x ?? base.x, y: entry.y ?? base.y, width: entry.width ?? base.width, height: entry.height ?? base.height }
    if (![nextBounds.x, nextBounds.y, nextBounds.width, nextBounds.height].every(Number.isFinite) || nextBounds.width < 0 || nextBounds.height < 0) return null
    const scaleX = base.width === 0 ? 1 : nextBounds.width / base.width
    const scaleY = base.height === 0 ? 1 : nextBounds.height / base.height
    const transform = (point: DiagramPoint): DiagramPoint => ({
      x: nextBounds.x + (point.x - base.x) * scaleX,
      y: nextBounds.y + (point.y - base.y) * scaleY,
    })
    const portPatch = createGroupPortResizePatch(state, entry.id, base, nextBounds, snap)
    if (portPatch) portPatches.push(portPatch)
    for (const id of groupMembers(state, entry.id)) {
      const edge = state.entities.edgesById.get(id)
      if (edge) {
        const snapPoint = (point: DiagramPoint): DiagramPoint => gridSize ? { x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize } : point
        const nextEdge: DiagramEdge = {
          ...edge,
          source: edge.source.kind === "point" ? { kind: "point", point: snapPoint(transform(edge.source.point)) } : edge.source,
          target: edge.target.kind === "point" ? { kind: "point", point: snapPoint(transform(edge.target.point)) } : edge.target,
          points: edge.points?.map((point) => snapPoint(transform(point))),
          ...(edge.routing?.mode === "auto" ? { routing: { ...edge.routing, ...(edge.routing.waypoints ? { waypoints: edge.routing.waypoints.map((point) => snapPoint(transform(point))) } : {}), ...(edge.routing.routeHint ? { routeHint: snapPoint(transform(edge.routing.routeHint)) } : {}) } } : {}),
        }
        previousEdges.set(id, edge)
        nextEdges.set(id, nextEdge)
        continue
      }
      const childGeometry = createEntityGeometry(id, entities)
      const childBounds = childGeometry?.unrotatedBounds ?? childGeometry?.bounds
      if (!childBounds) return null
      const nextChildBounds = { ...transform({ x: childBounds.x, y: childBounds.y }), width: childBounds.width * scaleX, height: childBounds.height * scaleY }
      rectEntries.push({ id, ...nextChildBounds })
    }
  }
  const childRectPatch = createResizePatchForEntities(state, rectEntries, snap)
  const changedEdges = [...nextEdges].filter(([id, next]) => !diagramEdgesEqual(previousEdges.get(id)!, next))
  const edgePatch = changedEdges.length ? createEntitySnapshotPatch(
    changedEdges.map(([id]) => id),
    previousEdges,
    new Map(changedEdges),
    (next, id, value) => next.entities.edgesById.set(id, value as DiagramEdge),
  ) : null
  const groupPatch = [childRectPatch, edgePatch, ...portPatches].filter((patch): patch is Patch => patch !== null).reduce<Patch | null>((current, patch) => current ? composeUndoablePatches(current, patch) : patch, null)
  return [regularPatch, groupPatch].filter((patch): patch is Patch => patch !== null).reduce<Patch | null>((current, patch) => current ? composeUndoablePatches(current, patch) : patch, null)
}

function createGroupPortResizePatch(state: InternalState, groupId: DiagramId, from: DiagramRect, to: DiagramRect, snap: DiagramGridSnapOptions = {}): Patch | null {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  const previous = new Map<DiagramId, DiagramPort>()
  const next = new Map<DiagramId, DiagramPort>()
  for (const port of state.entities.portsById.values()) {
    if (diagramPortHostId(port) !== groupId || !("hostId" in port)) continue
    const anchored = port as Extract<DiagramPort, { hostId: DiagramId }>
    if (anchored.anchor.kind !== "local") continue
    previous.set(port.id, port)
    const x = anchored.anchor.x * sx, y = anchored.anchor.y * sy
    const gridSize = snap.strictGrid === true && Number.isFinite(snap.gridSize) && snap.gridSize! > 0 ? snap.gridSize! : undefined
    const worldX = to.x + x, worldY = to.y + y
    next.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: groupId, anchor: { kind: "local", x: gridSize ? Math.round(worldX / gridSize) * gridSize - to.x : x, y: gridSize ? Math.round(worldY / gridSize) * gridSize - to.y : y } })
  }
  return next.size ? createEntitySnapshotPatch([...next.keys()], previous, next, (draft, id, value) => draft.entities.portsById.set(id, value)) : null
}

function snapResizeEntryToGrid(entry: DiagramResizeEntry, gridSize: number): DiagramResizeEntry {
  const minimum = Math.max(gridSize, Math.ceil(8 / gridSize) * gridSize)
  return {
    ...entry,
    ...(entry.x === undefined ? {} : { x: Math.round(entry.x / gridSize) * gridSize }),
    ...(entry.y === undefined ? {} : { y: Math.round(entry.y / gridSize) * gridSize }),
    ...(entry.width === undefined ? {} : { width: Math.max(minimum, Math.round(entry.width / gridSize) * gridSize) }),
    ...(entry.height === undefined ? {} : { height: Math.max(minimum, Math.round(entry.height / gridSize) * gridSize) }),
  }
}

function createResizePatchForEntities(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>, snap: DiagramGridSnapOptions = {}): Patch | null {
  const tableEntries = entries.filter((entry) => state.entities.tablesById.has(entry.id))
  const otherEntries = entries.filter((entry) => !state.entities.tablesById.has(entry.id))
  const patches: Patch[] = []
  const otherPatch = createResizePatchForNonTableEntities(state, otherEntries, snap)
  if (otherPatch) patches.push(otherPatch)
  const previous = new Map<DiagramId, DiagramTable>()
  const next = new Map<DiagramId, DiagramTable>()
  for (const entry of tableEntries) {
    const table = state.entities.tablesById.get(entry.id)!
    if (isEntityLockedOrReadOnly(state, entry.id)) continue
    const resized = resizeTable(table, entry)
    if (![resized.x, resized.y, resized.width, resized.height].every(Number.isFinite) || resized.width <= 0 || resized.height <= 0) return null
    previous.set(entry.id, table)
    next.set(entry.id, resized)
    const anchoredPorts = createPortResizePatch(state, entry.id, table.width, table.height, resized.width, resized.height, snap, entry)
    if (anchoredPorts) patches.push(anchoredPorts)
  }
  if (next.size) patches.push(createEntitySnapshotPatch([...next.keys()], previous, next, (draft, id, value) => draft.entities.tablesById.set(id, value as DiagramTable)))
  return patches.reduce<Patch | null>((current, patch) => current ? composeUndoablePatches(current, patch) : patch, null)
}

function createResizePatchForNonTableEntities(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>, snap: DiagramGridSnapOptions = {}): Patch | null {
  const previous = new Map<DiagramId, DiagramResizeEntry>()
  const nextEntries: DiagramResizeEntry[] = []
  const patches: Patch[] = []
  for (const entry of entries) {
    if (isEntityLockedOrReadOnly(state, entry.id)) continue
    const node = state.entities.nodesById.get(entry.id)
    const shape = state.entities.shapesById.get(entry.id)
    const text = state.entities.textsById.get(entry.id)
    const entity = node ?? shape ?? text
    if (!entity) continue
    if (shape && shape.shape === "rect" && !isValidCornerRadius({ ...shape, width: entry.width ?? shape.width, height: entry.height ?? shape.height }, shape.cornerRadius ?? 0)) return null
    if (shape?.pathContours?.some((contour) => contour.segments.some((segment) => segment.kind === "arc"))
      && Math.abs((entry.width ?? shape.width) / (shape.width || 1) - (entry.height ?? shape.height) / (shape.height || 1)) > 1e-8) return null
    previous.set(entry.id, { id: entry.id, x: entity.x, y: entity.y, width: entity.width, height: entity.height })
    nextEntries.push(entry)
    const oldWidth = entity.width ?? 1, oldHeight = entity.height ?? 1
    const resizedPorts = createPortResizePatch(state, entry.id, oldWidth, oldHeight, entry.width ?? oldWidth, entry.height ?? oldHeight, snap, entry)
    if (resizedPorts) patches.push(resizedPorts)
  }
  if (nextEntries.length) {
    patches.unshift(createResizePatchUnchecked(nextEntries, [...previous.values()]))
    const gridSize = snap.strictGrid === true && Number.isFinite(snap.gridSize) && snap.gridSize! > 0 ? snap.gridSize! : undefined
    if (gridSize) {
      const projected: MutableEntities = { nodesById: new Map(state.entities.nodesById), edgesById: new Map(state.entities.edgesById), textsById: new Map(state.entities.textsById), shapesById: new Map(state.entities.shapesById), portsById: new Map(state.entities.portsById), junctionsById: new Map(state.entities.junctionsById), groupsById: new Map(state.entities.groupsById), tablesById: new Map(state.entities.tablesById) }
      applyResizeEntries({ ...state, entities: projected }, nextEntries)
      const previousShapes = new Map<DiagramId, DiagramShape>()
      const nextShapes = new Map<DiagramId, DiagramShape>()
      for (const entry of nextEntries) {
        const before = state.entities.shapesById.get(entry.id)
        const after = projected.shapesById.get(entry.id)
        if (!before || !after || (!after.points && !after.pathContours)) continue
        const snapped = snapShapePathGeometry(after, gridSize)
        if (snapped) { previousShapes.set(entry.id, before); nextShapes.set(entry.id, snapped) }
      }
      if (nextShapes.size) patches.push(createEntitySnapshotPatch([...nextShapes.keys()], previousShapes, nextShapes, (draft, id, value) => draft.entities.shapesById.set(id, value)))
    }
  }
  return patches.reduce<Patch | null>((current, patch) => current ? composeUndoablePatches(current, patch) : patch, null)
}

function snapShapePathGeometry(shape: DiagramShape, gridSize: number): DiagramShape | null {
  const snap = (point: DiagramPoint): DiagramPoint => ({ x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize })
  const origin = resolveTransformOrigin({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.transformOrigin)
  const toWorld = (point: DiagramPoint): DiagramPoint => {
    return transformPointAround({ x: shape.x + point.x, y: shape.y + point.y }, origin, shape.rotation ?? 0, shape.flipX === true, shape.flipY === true)
  }
  const toLocal = (point: DiagramPoint): DiagramPoint => {
    const local = inverseTransformPointAround(point, origin, shape.rotation ?? 0, shape.flipX === true, shape.flipY === true)
    return { x: local.x - shape.x, y: local.y - shape.y }
  }
  const map = (point: DiagramPoint) => toLocal(snap(toWorld(point)))
  return {
    ...shape,
    ...(shape.points ? { points: shape.points.map(map) } : {}),
    ...(shape.pathContours ? { pathContours: shape.pathContours.map((contour) => ({ ...contour, segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
      ? { ...segment, start: map(segment.start), end: map(segment.end) }
      : segment.kind === "cubic"
        ? { ...segment, start: map(segment.start), control1: map(segment.control1), control2: map(segment.control2), end: map(segment.end) }
        : { ...segment, center: map(segment.center) }) })) } : {}),
  }
}

function createPortResizePatch(state: InternalState, hostId: DiagramId, oldWidth: number, oldHeight: number, width: number, height: number, snap: DiagramGridSnapOptions = {}, entry?: DiagramResizeEntry): Patch | null {
  const scaleX = oldWidth === 0 ? 1 : width / oldWidth
  const scaleY = oldHeight === 0 ? 1 : height / oldHeight
  const previous = new Map<DiagramId, DiagramPort>()
  const next = new Map<DiagramId, DiagramPort>()
  const gridSize = snap.strictGrid === true && Number.isFinite(snap.gridSize) && snap.gridSize! > 0 ? snap.gridSize! : undefined
  const projectedEntities: MutableEntities = {
    nodesById: new Map(state.entities.nodesById), edgesById: new Map(state.entities.edgesById), textsById: new Map(state.entities.textsById),
    shapesById: new Map(state.entities.shapesById), portsById: new Map(state.entities.portsById), junctionsById: new Map(state.entities.junctionsById),
    groupsById: new Map(state.entities.groupsById), tablesById: new Map(state.entities.tablesById),
  }
  const projectedState = { ...state, entities: projectedEntities }
  const resizeEntry = entry ?? { id: hostId, width, height }
  const table = state.entities.tablesById.get(hostId)
  if (table) projectedEntities.tablesById.set(hostId, resizeTable(table, resizeEntry))
  else applyResizeEntries(projectedState, [resizeEntry])
  for (const port of state.entities.portsById.values()) {
    if (diagramPortHostId(port) !== hostId || isEntityLockedOrReadOnly(state, port.id)) continue
    let resized: DiagramPort | null = null
    if ("nodeId" in port && port.nodeId) resized = { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, nodeId: port.nodeId, x: port.x * scaleX, y: port.y * scaleY }
    else {
      const anchored = port as Extract<DiagramPort, { hostId: DiagramId }>
      if (anchored.anchor.kind === "local") resized = { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: anchored.hostId, anchor: { ...anchored.anchor, x: anchored.anchor.x * scaleX, y: anchored.anchor.y * scaleY } }
    }
    if (resized) {
      if (gridSize) {
        projectedEntities.portsById.set(port.id, resized)
        resized = portAtGridPoint(resized, projectedEntities, gridSize) ?? resized
      }
      previous.set(port.id, port); next.set(port.id, resized)
    }
  }
  return next.size ? createEntitySnapshotPatch([...next.keys()], previous, next, (draft, id, value) => draft.entities.portsById.set(id, value)) : null
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
      const nextWidth = entry.width ?? shape.width
      const nextHeight = entry.height ?? shape.height
      const scaleX = shape.width === 0 ? 1 : nextWidth / shape.width
      const scaleY = shape.height === 0 ? 1 : nextHeight / shape.height
      state.entities.shapesById.set(entry.id, {
        ...shape,
        ...definedRectPatch(entry),
        ...(shape.points ? { points: shape.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })) } : {}),
        ...(shape.pathContours ? { pathContours: shape.pathContours.map((contour) => ({
          ...contour,
          segments: contour.segments.map((segment): DiagramPathSegment => segment.kind === "line"
            ? { kind: "line", start: { x: segment.start.x * scaleX, y: segment.start.y * scaleY }, end: { x: segment.end.x * scaleX, y: segment.end.y * scaleY } }
            : segment.kind === "cubic"
              ? { kind: "cubic", start: { x: segment.start.x * scaleX, y: segment.start.y * scaleY }, control1: { x: segment.control1.x * scaleX, y: segment.control1.y * scaleY }, control2: { x: segment.control2.x * scaleX, y: segment.control2.y * scaleY }, end: { x: segment.end.x * scaleX, y: segment.end.y * scaleY } }
              : { ...segment, center: { x: segment.center.x * scaleX, y: segment.center.y * scaleY }, radius: segment.radius * scaleX }),
        })) } : {}),
      })
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
      if ("nodeId" in port && port.nodeId) state.entities.portsById.set(entry.id, { ...port, ...patch })
      changed.add(entry.id)
    }
  }
  return changed
}

function definedRectPatch(entry: DiagramResizeEntry): Partial<DiagramResizeEntry> {
  return Object.fromEntries(Object.entries(entry).filter(([key, value]) => key !== "id" && value !== undefined)) as Partial<DiagramResizeEntry>
}


function strictGridRotationCenter(center: DiagramPoint, snap: DiagramGridSnapOptions): DiagramPoint {
  const size = snap.strictGrid === true ? snap.gridSize : undefined
  if (!Number.isFinite(size) || size! <= 0) return center
  return { x: Math.round(center.x / size!) * size!, y: Math.round(center.y / size!) * size! }
}

function createRotatePatch(state: InternalState, entries: ReadonlyArray<DiagramRotateEntry>, snap: DiagramGridSnapOptions = {}): Patch | null {
  const previous = new Map<DiagramId, DiagramRotationSnapshot>()
  const next = new Map<DiagramId, DiagramRotationSnapshot>()
  const groupChildren = new Set<DiagramId>()
  const normalizedEntries = normalizeGroupSelectionIds(state, entries.map((entry) => entry.id)).map((id) => entries.find((entry) => entry.id === id)!).filter(Boolean)
  for (const entry of normalizedEntries) {
    const group = state.entities.groupsById.get(entry.id)
    if (!group || !Number.isFinite(entry.rotation) || !isGroupRotatable(state, entry.id)) continue
    const targetRotation = normalizeRotation(entry.rotation)
    const delta = normalizeRotation(targetRotation - (group.rotation ?? 0))
    if (delta === 0) continue
    if ((group.x !== undefined || group.y !== undefined) && Math.abs(targetRotation % 90) > 1e-9 && groupDescendantIds(state, group.id).some((id) => {
      const edge = state.entities.edgesById.get(id)
      return Boolean(edge?.routing && (edge.routing.mode === "manual" || edge.routing.mode === "auto"))
    })) continue
    const groupGeometry = createEntityGeometry(group.id, snapshotEntities(state))
    if (!groupGeometry) continue
    const center = strictGridRotationCenter(groupGeometry.transformOrigin ?? { x: groupGeometry.bounds.x + groupGeometry.bounds.width / 2, y: groupGeometry.bounds.y + groupGeometry.bounds.height / 2 }, snap)
    previous.set(group.id, group)
    next.set(group.id, { ...group, rotation: targetRotation })
    if (group.x !== undefined || group.y !== undefined) continue
    // TODO(next-major): Remove child geometry baking for legacy baked groups.
    for (const childId of group.childIds) {
      groupChildren.add(childId)
      const entity = getDiagramRotationSnapshot(state, childId)
      const geometry = entity ? createEntityGeometry(childId, snapshotEntities(state)) : null
      if (!entity || !geometry) continue
      const rotated = rotateGroupChild(entity, geometry, center, delta)
      if (!rotated) continue
      previous.set(childId, entity)
      next.set(childId, rotated)
    }
  }
  for (const entry of normalizedEntries) {
    if (groupChildren.has(entry.id) || state.entities.groupsById.has(entry.id) || !Number.isFinite(entry.rotation) || isEntityLockedOrReadOnly(state, entry.id)) continue
    const entity = getDiagramRotationSnapshot(state, entry.id)
    if (!entity || entity.kind === "group") continue
    if (entity.kind === "edge") {
      if (!isFreeEdgeRotatable(entity)) continue
      const geometry = createEntityGeometry(entity.id, snapshotEntities(state))
      if (!geometry) continue
      const rotation = normalizeRotation(entry.rotation)
      const delta = normalizeRotation(rotation - (entity.rotation ?? 0))
      if (!delta) continue
      const center = strictGridRotationCenter({ x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }, snap)
      const rotate = (point: DiagramPoint) => cleanRotatedPoint(rotatePoint(point, center, delta))
      const nextEdge: DiagramEdge = {
        ...entity,
        source: { kind: "point", point: rotate(entity.source.point) },
        target: { kind: "point", point: rotate(entity.target.point) },
        points: entity.points?.map(rotate),
        rotation,
      }
      previous.set(entity.id, entity)
      next.set(entity.id, nextEdge)
      continue
    }
    const rotation = normalizeRotation(entry.rotation)
    if ((entity.rotation ?? 0) === rotation) continue
    const geometry = createEntityGeometry(entry.id, snapshotEntities(state))
    const center = geometry ? strictGridRotationCenter({ x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }, snap) : null
    const dx = center && geometry ? center.x - (geometry.bounds.x + geometry.bounds.width / 2) : 0
    const dy = center && geometry ? center.y - (geometry.bounds.y + geometry.bounds.height / 2) : 0
    previous.set(entry.id, { ...entity, rotation: entity.rotation ?? 0 })
    next.set(entry.id, { ...entity, x: entity.x + dx, y: entity.y + dy, rotation })
  }
  if (!next.size) return null
  const rotationPatch = createRotatePatchUnchecked([...next.values()], [...previous.values()])
  const entities = {
    nodesById: new Map(state.entities.nodesById), edgesById: new Map(state.entities.edgesById), textsById: new Map(state.entities.textsById),
    shapesById: new Map(state.entities.shapesById), portsById: new Map(state.entities.portsById), junctionsById: new Map(state.entities.junctionsById), groupsById: new Map(state.entities.groupsById), tablesById: new Map(state.entities.tablesById),
  }
  for (const entity of next.values()) {
    if (entity.kind === "node") entities.nodesById.set(entity.id, entity)
    else if (entity.kind === "edge") entities.edgesById.set(entity.id, entity)
    else if (entity.kind === "text") entities.textsById.set(entity.id, entity)
    else if (entity.kind === "shape") entities.shapesById.set(entity.id, entity)
    else if (entity.kind === "table") entities.tablesById.set(entity.id, entity)
    else if (entity.kind === "group") entities.groupsById.set(entity.id, entity)
  }
  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextPorts = new Map<DiagramId, DiagramPort>()
  for (const entry of entries) {
    const group = state.entities.groupsById.get(entry.id)
    if (!group || !next.has(group.id) || group.x !== undefined || group.y !== undefined) continue
    const before = createEntityGeometry(group.id, snapshotEntities(state))
    const after = createEntityGeometry(group.id, entities)
    if (!before || !after) continue
    const center = strictGridRotationCenter(before.transformOrigin ?? { x: before.bounds.x + before.bounds.width / 2, y: before.bounds.y + before.bounds.height / 2 }, snap)
    const delta = normalizeRotation(entry.rotation - (group.rotation ?? 0))
    for (const port of state.entities.portsById.values()) {
      if (diagramPortHostId(port) !== group.id || !("hostId" in port)) continue
      const anchored = port as Extract<DiagramPort, { hostId: DiagramId }>
      if (anchored.anchor.kind !== "local") continue
      const world = resolvePortPoint(port, snapshotEntities(state))
      const rotated = rotatePoint(world, center, delta)
      previousPorts.set(port.id, port)
      nextPorts.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: group.id, anchor: { kind: "local", x: rotated.x - after.bounds.x, y: rotated.y - after.bounds.y } })
    }
  }
  const portPatch = nextPorts.size ? createEntitySnapshotPatch([...nextPorts.keys()], previousPorts, nextPorts, (draft, id, value) => draft.entities.portsById.set(id, value)) : null
  return portPatch ? composeUndoablePatches(rotationPatch, portPatch) : rotationPatch
}

function createRotatePatchUnchecked(entries: ReadonlyArray<DiagramRotationSnapshot>, inverseEntries: ReadonlyArray<DiagramRotationSnapshot>): Patch {
  return {
    apply: (state) => applyRotationSnapshots(state, entries),
    inverse: {
      apply: (state) => applyRotationSnapshots(state, inverseEntries),
      inverse: undefined as unknown as Patch,
    },
  }
}

function transformOriginBounds(entity: DiagramRotationSnapshot, geometry: DiagramGeometry): DiagramRect {
  if (entity.kind === "node" || entity.kind === "shape" || entity.kind === "text") return { x: entity.x, y: entity.y, width: entity.width ?? geometry.bounds.width, height: entity.height ?? geometry.bounds.height }
  if (entity.kind === "table") {
    const headerHeight = entity.header?.height ?? 0
    return { x: entity.x, y: entity.y - headerHeight, width: entity.width, height: entity.height + headerHeight }
  }
  return geometry.unrotatedBounds ?? geometry.bounds
}

function createTransformOriginPatch(state: InternalState, id: DiagramId, transformOrigin: TransformOrigin | null, preserveWorldGeometry: boolean): Patch | null {
  if (transformOrigin !== null && !validTransformOrigin({ transformOrigin })) return null
  const entity = getDiagramRotationSnapshot(state, id)
  if (!entity || entity.kind === "edge") return null
  if (JSON.stringify(entity.transformOrigin) === JSON.stringify(transformOrigin ?? undefined)) return null
  const geometry = createEntityGeometry(id, snapshotEntities(state))
  if (!geometry) return null
  let bounds = transformOriginBounds(entity, geometry)
  if (entity.kind === "group" && (entity.x !== undefined || entity.y !== undefined)) bounds = { ...bounds, x: bounds.x - (entity.x ?? 0), y: bounds.y - (entity.y ?? 0) }
  let next: DiagramRotationSnapshot = { ...entity, transformOrigin: transformOrigin ?? undefined }
  if (preserveWorldGeometry && entity.kind === "group" && (entity.x !== undefined || entity.y !== undefined)) {
    const oldPivot = resolveTransformOrigin(bounds, entity.transformOrigin)
    const newPivot = resolveTransformOrigin(bounds, transformOrigin ?? undefined)
    const radians = (entity.rotation ?? 0) * Math.PI / 180
    const cosine = Math.cos(radians), sine = Math.sin(radians)
    const sx = entity.flipX ? -1 : 1, sy = entity.flipY ? -1 : 1
    const a00 = cosine * sx, a01 = -sine * sy, a10 = sine * sx, a11 = cosine * sy
    const dx = oldPivot.x - newPivot.x, dy = oldPivot.y - newPivot.y
    const correction = { x: (1 - a00) * dx - a01 * dy, y: -a10 * dx + (1 - a11) * dy }
    next = { ...entity, transformOrigin: transformOrigin ?? undefined, x: (entity.x ?? 0) + correction.x, y: (entity.y ?? 0) + correction.y }
  } else if (preserveWorldGeometry && entity.kind !== "group") {
    const oldPivot = resolveTransformOrigin(bounds, entity.transformOrigin)
    const newPivot = resolveTransformOrigin(bounds, transformOrigin ?? undefined)
    const radians = (geometry.rotation ?? ("rotation" in entity ? entity.rotation ?? 0 : 0)) * Math.PI / 180
    const cosine = Math.cos(radians), sine = Math.sin(radians)
    const sx = (geometry.flipX ?? entity.flipX) ? -1 : 1, sy = (geometry.flipY ?? entity.flipY) ? -1 : 1
    const a00 = cosine * sx, a01 = -sine * sy, a10 = sine * sx, a11 = cosine * sy
    const dx = oldPivot.x - newPivot.x, dy = oldPivot.y - newPivot.y
    const correction = { x: (1 - a00) * dx - a01 * dy, y: -a10 * dx + (1 - a11) * dy }
    next = { ...(next as Exclude<DiagramRotationSnapshot, DiagramEdge | DiagramGroup>), x: entity.x + correction.x, y: entity.y + correction.y }
  }
  return createRotatePatchUnchecked([next], [entity])
}

function applyRotationSnapshots(state: InternalState, entries: ReadonlyArray<DiagramRotationSnapshot>): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const entity of entries) {
    if (entity.kind === "node") state.entities.nodesById.set(entity.id, entity)
    else if (entity.kind === "edge") state.entities.edgesById.set(entity.id, entity)
    else if (entity.kind === "text") state.entities.textsById.set(entity.id, entity)
    else if (entity.kind === "shape") state.entities.shapesById.set(entity.id, entity)
    else if (entity.kind === "table") state.entities.tablesById.set(entity.id, entity)
    else if (entity.kind === "group") state.entities.groupsById.set(entity.id, entity)
    changed.add(entity.id)
  }
  return changed
}

function getDiagramRotationSnapshot(state: InternalState, id: DiagramId): DiagramRotationSnapshot | null {
  return state.entities.nodesById.get(id)
    ?? state.entities.edgesById.get(id)
    ?? state.entities.textsById.get(id)
    ?? state.entities.shapesById.get(id)
    ?? state.entities.tablesById.get(id)
    ?? state.entities.groupsById.get(id)
    ?? null
}

/** @deprecated Legacy baked group transform; retained groups transform their own parent matrix. */
function rotateGroupChild(entity: DiagramRotationSnapshot, geometry: DiagramGeometry, center: DiagramPoint, delta: number): DiagramRotationSnapshot | null {
  if (entity.kind === "edge") {
    const hasPointGeometry = entity.source.kind === "point" || entity.target.kind === "point" || Boolean(entity.points?.length)
    if (!hasPointGeometry) return null
    const rotate = (point: DiagramPoint) => cleanRotatedPoint(rotatePoint(point, center, delta))
    const endpoint = (value: DiagramEdgeEndpoint): DiagramEdgeEndpoint => value.kind === "point" ? { kind: "point", point: rotate(value.point) } : value
    return { ...entity, source: endpoint(entity.source), target: endpoint(entity.target), points: entity.points?.map(rotate), rotation: normalizeRotation((entity.rotation ?? 0) + delta) }
  }
  if (entity.kind === "group") return null
  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const currentCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const nextCenter = cleanRotatedPoint(rotatePoint(currentCenter, center, delta))
  const x = cleanRotatedValue(nextCenter.x - bounds.width / 2)
  const y = cleanRotatedValue(nextCenter.y - bounds.height / 2)
  const rotation = normalizeRotation((entity.rotation ?? 0) + delta)
  return { ...entity, x, y: y + (entity.kind === "table" ? entity.header?.height ?? 0 : 0), rotation }
}

function cleanRotatedPoint(point: DiagramPoint): DiagramPoint {
  return { x: cleanRotatedValue(point.x), y: cleanRotatedValue(point.y) }
}

function cleanRotatedValue(value: number): number {
  const nearestInteger = Math.round(value)
  return Math.abs(value - nearestInteger) < 1e-10 ? nearestInteger : value
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
    junctionsById: state.entities.junctionsById,
    groupsById: state.entities.groupsById,
    tablesById: state.entities.tablesById,
  }
}

function fixedJunctionHostIds(entities: DiagramEntities): DiagramId[] {
  return [...new Set([...entities.junctionsById.values()].filter((junction) => junction.anchor.kind === "fixed").map((junction) => junction.hostEdgeId))]
}

function commandMayAffectFixedJunctionRoutes(command: DiagramCommand): boolean {
  return command.type !== "setViewport" && command.type !== "setSelection" && command.type !== "setEntityMetadata"
    && command.type !== "updateEntityStyle" && command.type !== "updateTableCell" && command.type !== "updateTableStyle"
    && command.type !== "updateTableHeader" && command.type !== "editText"
}

function fixedJunctionRouteFailure(entities: DiagramEntities): string | null {
  for (const junction of entities.junctionsById.values()) {
    const anchor = junction.anchor
    if (anchor.kind !== "fixed") continue
    const host = entities.edgesById.get(junction.hostEdgeId)
    if (!host) return `Fixed junction ${junction.id} has no host edge.`
    const route = resolveEdgePath(host, entities)
    const onRoute = route.some((point, index) => index > 0 && distanceToSegment(anchor.point, route[index - 1]!, point) <= 1e-6)
    if (!onRoute) return `Host route ${host.id} cannot preserve fixed junction ${junction.id} at (${anchor.point.x}, ${anchor.point.y}).`
  }
  return null
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function decomposeOrthogonalTransform(matrix: DiagramAffineTransform): (DiagramAffineTransform & Readonly<{ rotation: number; flipX: boolean; flipY: boolean }>) | null {
  const firstLength = Math.hypot(matrix.a, matrix.b)
  const secondLength = Math.hypot(matrix.c, matrix.d)
  const dot = matrix.a * matrix.c + matrix.b * matrix.d
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (![firstLength, secondLength, dot, determinant].every(Number.isFinite) || Math.abs(firstLength - 1) > 1e-8 || Math.abs(secondLength - 1) > 1e-8 || Math.abs(dot) > 1e-8) return null
  const flipX = determinant < 0
  const rotation = normalizeRotation(Math.atan2(flipX ? -matrix.b : matrix.b, flipX ? -matrix.a : matrix.a) * 180 / Math.PI)
  const angle = rotation * Math.PI / 180
  return { ...matrix, a: Math.cos(angle) * (flipX ? -1 : 1), b: Math.sin(angle) * (flipX ? -1 : 1), c: -Math.sin(angle), d: Math.cos(angle), rotation, flipX, flipY: false }
}

function createFlipPatch(state: InternalState, requestedIds: ReadonlyArray<DiagramId>, axis: DiagramFlipAxis): Patch | null {
  if (axis !== "horizontal" && axis !== "vertical") return null
  requestedIds = normalizeGroupSelectionIds(state, requestedIds)
  const retainedGroups = requestedIds.map((id) => state.entities.groupsById.get(id)).filter((group): group is DiagramGroup => Boolean(group && (group.x !== undefined || group.y !== undefined) && !isEntityLockedOrReadOnly(state, group.id)))
  const previousRetained = new Map(retainedGroups.map((group) => [group.id, group]))
  const nextRetained = new Map(retainedGroups.map((group) => [group.id, { ...group, rotation: normalizeRotation(-(group.rotation ?? 0)), ...(axis === "horizontal" ? { flipX: !group.flipX } : { flipY: !group.flipY }) }]))
  const retainedPatch = retainedGroups.length ? createEntitySnapshotPatch(retainedGroups.map((group) => group.id), previousRetained, nextRetained, (draft, id, value) => draft.entities.groupsById.set(id, value)) : null
  const expanded = new Set<DiagramId>()
  for (const id of requestedIds) {
    const group = state.entities.groupsById.get(id)
    if (group) {
      if (isEntityLockedOrReadOnly(state, id)) continue
      if (group.x !== undefined || group.y !== undefined) continue
      // TODO(next-major): Remove child expansion for legacy baked group reflections.
      for (const childId of group.childIds) expanded.add(childId)
    } else expanded.add(id)
  }
  const expandedIds = [...expanded]
  const entities = snapshotEntities(state)
  const candidates = [...new Set(expandedIds)].filter((id) => {
    if (isEntityLockedOrReadOnly(state, id)) return false
    return state.entities.nodesById.has(id)
      || state.entities.textsById.has(id)
      || state.entities.shapesById.has(id)
      || state.entities.tablesById.has(id)
      || isEdgeTranslatable(state.entities.edgesById.get(id))
  })
  const geometries = candidates.map((id) => createEntityGeometry(id, entities)).filter((geometry): geometry is DiagramGeometry => geometry !== null)
  if (!geometries.length) return retainedPatch
  const bounds = unionDiagramRects(geometries.map((geometry) => geometry.bounds))
  if (!bounds) return null
  const onlyGroup = requestedIds.length === 1 ? state.entities.groupsById.get(requestedIds[0]!) : undefined
  const groupOrigin = onlyGroup ? createEntityGeometry(onlyGroup.id, entities)?.transformOrigin : undefined
  const center = groupOrigin ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const previous = candidates.map((id) => getDiagramFlipSnapshot(state, id)).filter((entity): entity is DiagramFlipSnapshot => entity !== null)
  const next = previous.map((entity) => reflectDiagramEntity(entity, createEntityGeometry(entity.id, entities)!, center, axis))
  const flipPatch = createFlipPatchUnchecked(next, previous)
  const future = {
    nodesById: new Map(state.entities.nodesById), edgesById: new Map(state.entities.edgesById), textsById: new Map(state.entities.textsById),
    shapesById: new Map(state.entities.shapesById), portsById: new Map(state.entities.portsById), junctionsById: new Map(state.entities.junctionsById), groupsById: new Map(state.entities.groupsById), tablesById: new Map(state.entities.tablesById),
  }
  for (const entity of next) {
    if (entity.kind === "node") future.nodesById.set(entity.id, entity)
    else if (entity.kind === "edge") future.edgesById.set(entity.id, entity)
    else if (entity.kind === "text") future.textsById.set(entity.id, entity)
    else if (entity.kind === "shape") future.shapesById.set(entity.id, entity)
    else if (entity.kind === "table") future.tablesById.set(entity.id, entity)
  }
  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextPorts = new Map<DiagramId, DiagramPort>()
  const flippedGroups = requestedIds.filter((id) => state.entities.groupsById.get(id)?.childIds.some((childId) => candidates.includes(childId)))
  for (const groupId of flippedGroups) {
    const after = createEntityGeometry(groupId, future)
    if (!after) continue
    for (const port of state.entities.portsById.values()) {
      if (diagramPortHostId(port) !== groupId || !("hostId" in port)) continue
      const anchored = port as Extract<DiagramPort, { hostId: DiagramId }>
      if (anchored.anchor.kind !== "local") continue
      const point = resolvePortPoint(port, entities)
      const reflected = { x: axis === "horizontal" ? 2 * center.x - point.x : point.x, y: axis === "vertical" ? 2 * center.y - point.y : point.y }
      previousPorts.set(port.id, port)
      nextPorts.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: groupId, anchor: { kind: "local", x: reflected.x - after.bounds.x, y: reflected.y - after.bounds.y } })
    }
  }
  const portPatch = nextPorts.size ? createEntitySnapshotPatch([...nextPorts.keys()], previousPorts, nextPorts, (draft, id, value) => draft.entities.portsById.set(id, value)) : null
  const result = portPatch ? composeUndoablePatches(flipPatch, portPatch) : flipPatch
  return retainedPatch ? composeUndoablePatches(retainedPatch, result) : result
}

function createFlipPatchUnchecked(entries: ReadonlyArray<DiagramFlipSnapshot>, inverseEntries: ReadonlyArray<DiagramFlipSnapshot>): Patch {
  return {
    apply: (state) => applyFlipSnapshots(state, entries),
    inverse: {
      apply: (state) => applyFlipSnapshots(state, inverseEntries),
      inverse: undefined as unknown as Patch,
    },
  }
}

function applyFlipSnapshots(state: InternalState, entries: ReadonlyArray<DiagramFlipSnapshot>): Set<DiagramId> {
  const changed = new Set<DiagramId>()
  for (const entity of entries) {
    if (entity.kind === "node") state.entities.nodesById.set(entity.id, entity)
    else if (entity.kind === "edge") state.entities.edgesById.set(entity.id, entity)
    else if (entity.kind === "text") state.entities.textsById.set(entity.id, entity)
    else if (entity.kind === "shape") state.entities.shapesById.set(entity.id, entity)
    else if (entity.kind === "table") state.entities.tablesById.set(entity.id, entity)
    changed.add(entity.id)
  }
  return changed
}

function getDiagramFlipSnapshot(state: InternalState, id: DiagramId): DiagramFlipSnapshot | null {
  return state.entities.nodesById.get(id)
    ?? state.entities.edgesById.get(id)
    ?? state.entities.textsById.get(id)
    ?? state.entities.shapesById.get(id)
    ?? state.entities.tablesById.get(id)
    ?? null
}

function unionDiagramRects(rects: ReadonlyArray<DiagramRect>): DiagramRect | null {
  if (!rects.length) return null
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function reflectDiagramEntity(entity: DiagramFlipSnapshot, geometry: DiagramGeometry, center: DiagramPoint, axis: DiagramFlipAxis): DiagramFlipSnapshot {
  if (entity.kind === "edge") {
    const reflectPoint = (point: DiagramPoint): DiagramPoint => axis === "horizontal"
      ? { x: center.x * 2 - point.x, y: point.y }
      : { x: point.x, y: center.y * 2 - point.y }
    const reflectEndpoint = (endpoint: DiagramEdgeEndpoint): DiagramEdgeEndpoint => endpoint.kind === "point"
      ? { kind: "point", point: reflectPoint(endpoint.point) }
      : endpoint
    return { ...entity, source: reflectEndpoint(entity.source), target: reflectEndpoint(entity.target), points: entity.points?.map(reflectPoint) }
  }

  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const x = axis === "horizontal" ? center.x * 2 - (bounds.x + bounds.width) : bounds.x
  const y = axis === "vertical" ? center.y * 2 - (bounds.y + bounds.height) : bounds.y
  const flipX = axis === "horizontal" ? !entity.flipX : entity.flipX
  const flipY = axis === "vertical" ? !entity.flipY : entity.flipY
  const rotation = "rotation" in entity ? normalizeRotation(-(entity.rotation ?? 0)) : undefined
  if (entity.kind === "node" || entity.kind === "shape" || entity.kind === "text") {
    return { ...entity, x, y, flipX, flipY, ...(rotation === undefined ? {} : { rotation }) }
  }
  return { ...entity, x, y: y + (entity.kind === "table" ? entity.header?.height ?? 0 : 0), flipX, flipY }
}

function createOrderPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, mode: "forward" | "backward" | "front" | "back"): Patch | null {
  const expandedIds = expandGroupEntityIds(state, ids, true)
  const existingIds = expandedIds.filter((id) => hasEntity(state, id))
  if (!existingIds.length) return null
  if (mode === "front" || mode === "back") {
    return createZIndexPatch(state, existingIds, mode)
  }
  const previous = cloneOrder(state.order)
  const next = cloneOrder(state.order)
  reorderIds(next.nodeIds, expandedIds, mode)
  reorderIds(next.edgeIds, expandedIds, mode)
  reorderIds(next.textIds, expandedIds, mode)
  reorderIds(next.shapeIds, expandedIds, mode)
  reorderIds(next.groupIds, expandedIds, mode)
  reorderIds(next.tableIds, expandedIds, mode)
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
  if (!hasEntity(state, id) || !isValidDiagramMetadata(metadata)) return null
  const previousMetadata = getEntityMetadata(state, id)
  const nextMetadata = cloneDiagramMetadata(metadata)
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

function createEntityUpdatesPatchWithTextOrientation(state: InternalState, updates: ReadonlyArray<{ id: DiagramId; metadata?: Readonly<Record<string, unknown>>; orientationPolicy?: import("./types.js").TextOrientationPolicy }>): Patch | null {
  let combined = createEntityUpdatesPatch(state, updates)
  for (const update of updates) {
    const text = state.entities.textsById.get(update.id)
    if (!text || update.orientationPolicy === undefined || update.orientationPolicy === text.orientationPolicy) continue
    const before = text.orientationPolicy
    const after: import("./types.js").TextOrientationPolicy = update.orientationPolicy
    const makePatch = (value: import("./types.js").TextOrientationPolicy | undefined, inverseValue: import("./types.js").TextOrientationPolicy | undefined): Patch => {
      const apply = (draft: InternalState): Set<DiagramId> => {
        const current = draft.entities.textsById.get(update.id)
        if (!current) return new Set()
        if (value === undefined) {
          const { orientationPolicy: _orientationPolicy, ...rest } = current
          draft.entities.textsById.set(update.id, rest)
        } else draft.entities.textsById.set(update.id, { ...current, orientationPolicy: value })
        return new Set([update.id])
      }
      return { apply, inverse: { apply: (draft) => {
        const current = draft.entities.textsById.get(update.id)
        if (!current) return new Set()
        if (inverseValue === undefined) {
          const { orientationPolicy: _orientationPolicy, ...rest } = current
          draft.entities.textsById.set(update.id, rest)
        } else draft.entities.textsById.set(update.id, { ...current, orientationPolicy: inverseValue })
        return new Set([update.id])
      }, inverse: undefined as unknown as Patch } }
    }
    const policyPatch = makePatch(after, before)
    combined = combined ? composeUndoablePatches(combined, policyPatch) : policyPatch
  }
  return combined
}

function createEntityStylePatch(state: InternalState, id: DiagramId, visualStyle?: DiagramVisualStyle): Patch | null {
  if (!hasEntity(state, id) || isEntityLockedOrReadOnly(state, id) || !isValidVisualStyle(visualStyle)) return null
  const previous = getStyleEntity(state, id)
  if (!previous || JSON.stringify(previous.visualStyle) === JSON.stringify(visualStyle)) return null
  const next = { ...previous, ...(visualStyle ? { visualStyle } : { visualStyle: undefined }) }
  const apply = (entity: NonNullable<typeof previous>): Patch["apply"] => (draft) => {
    const maps = draft.entities
    if (maps.nodesById.has(id)) maps.nodesById.set(id, entity as DiagramNode)
    else if (maps.edgesById.has(id)) maps.edgesById.set(id, entity as DiagramEdge)
    else if (maps.textsById.has(id)) maps.textsById.set(id, entity as DiagramText)
    else if (maps.shapesById.has(id)) maps.shapesById.set(id, entity as DiagramShape)
    else if (maps.portsById.has(id)) maps.portsById.set(id, entity as DiagramPort)
    else if (maps.junctionsById.has(id)) maps.junctionsById.set(id, entity as DiagramJunction)
    else if (maps.groupsById.has(id)) maps.groupsById.set(id, entity as DiagramGroup)
    else if (maps.tablesById.has(id)) maps.tablesById.set(id, entity as DiagramTable)
    return new Set([id])
  }
  return { apply: apply(next), inverse: { apply: apply(previous), inverse: undefined as unknown as Patch } }
}

function getStyleEntity(state: InternalState, id: DiagramId) {
  return state.entities.nodesById.get(id) ?? state.entities.edgesById.get(id) ?? state.entities.textsById.get(id)
    ?? state.entities.shapesById.get(id) ?? state.entities.portsById.get(id) ?? state.entities.junctionsById.get(id)
    ?? state.entities.groupsById.get(id) ?? state.entities.tablesById.get(id)
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
      return new Set([...nextOrder.nodeIds, ...nextOrder.edgeIds, ...nextOrder.textIds, ...nextOrder.shapeIds, ...nextOrder.groupIds, ...nextOrder.tableIds])
    },
    inverse: {
      orderChanged: true,
      apply: (state) => {
        state.order = cloneOrder(previous)
        return new Set([...previous.nodeIds, ...previous.edgeIds, ...previous.textIds, ...previous.shapeIds, ...previous.groupIds, ...previous.tableIds])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createLayerPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, layer: string | undefined, layerRole: "background" | "normal" | "foreground" | undefined): Patch | null {
  const entries = expandGroupEntityIds(state, ids, true).filter((id) => !isEntityLockedOrReadOnly(state, id) && hasEntity(state, id))
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
  if (!isUniqueId(state, edge.id) || !isValidEdge(state, edge) || hasRouteAttachmentCycle(edge, state.entities.edgesById, state.entities.junctionsById, state.entities.portsById)) {
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
  if (!isUniqueId(state, node.id) || !isValidVisualStyle(node.visualStyle) || !validTransformOrigin(node) || Boolean(node.portIds?.length) || ![node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) || node.width < 0 || node.height < 0) return null
  return {
    orderChanged: true,
    apply: (next) => { next.entities.nodesById.set(node.id, node); next.order.nodeIds.push(node.id); next.versions.set(node.id, 0); return new Set([node.id]) },
    inverse: createDeleteEntitiesPatch([node.id]),
  }
}

function createCreateShapePatch(state: InternalState, shape: DiagramShape): Patch | null {
  if (!isUniqueId(state, shape.id) || !isValidDiagramShape(shape) || !validTransformOrigin(shape)) return null
  return {
    orderChanged: true,
    apply: (next) => { next.entities.shapesById.set(shape.id, shape); next.order.shapeIds.push(shape.id); next.versions.set(shape.id, 0); return new Set([shape.id]) },
    inverse: createDeleteEntitiesPatch([shape.id]),
  }
}

function createCreatePathPatch(state: InternalState, path: DiagramPath): Patch | null {
  const hasPoints = Array.isArray(path.points)
  const hasContours = Array.isArray(path.contours)
  if (!path.id || hasPoints === hasContours || (hasPoints && (path.points!.length < 2 || path.points!.some((point) => ![point.x, point.y].every(Number.isFinite))))) return null
  if (path.contours && !validPathContours(path.contours)) return null
  const allPoints = [...(path.points ?? []), ...(path.contours ?? []).flatMap((contour) => [...pathContourBoundsPoints(contour)])]
  if (allPoints.length < 2) return null
  const minX = Math.min(...allPoints.map((point) => point.x)), minY = Math.min(...allPoints.map((point) => point.y))
  const maxX = Math.max(...allPoints.map((point) => point.x)), maxY = Math.max(...allPoints.map((point) => point.y))
  return createCreateShapePatch(state, { id: path.id, kind: "shape", shape: "line", x: minX, y: minY, width: maxX - minX, height: maxY - minY, ...(path.transformOrigin ? { transformOrigin: path.transformOrigin } : {}), ...(path.points ? { points: path.points.map((point) => ({ x: point.x - minX, y: point.y - minY })) } : {}), ...(path.contours ? { pathContours: path.contours.map((contour) => translatePathContour(contour, -minX, -minY)) } : {}), ...(path.metadata ? { metadata: path.metadata } : {}), ...(path.visualStyle ? { visualStyle: path.visualStyle } : {}) })
}

function validPathContours(contours: ReadonlyArray<DiagramPathContour>): boolean {
  if (!contours.length || contours.some((contour) => !Array.isArray(contour.segments) || contour.segments.length === 0
    || (contour.name !== undefined && typeof contour.name !== "string")
    || (contour.hole === true && contour.closed !== true)
    || contour.segments.some((segment) => !isValidPathSegment(segment))
    || contour.segments.slice(1).some((segment, index) => !samePathPoint(pathSegmentEnd(contour.segments[index]!), pathSegmentStart(segment))))) return false
  return !contours.some((contour) => contour.hole) || contours.some((contour) => contour.closed && !contour.hole)
}

function isValidPathSegment(segment: DiagramPathSegment): boolean {
  if (segment.kind === "line") return [segment.start.x, segment.start.y, segment.end.x, segment.end.y].every(Number.isFinite)
  if (segment.kind === "arc") return [segment.center.x, segment.center.y, segment.radius, segment.startAngle, segment.sweepAngle].every(Number.isFinite) && segment.radius > 0 && Math.abs(segment.sweepAngle) > 0 && Math.abs(segment.sweepAngle) <= Math.PI * 2 + 1e-8
  return [segment.start.x, segment.start.y, segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y, segment.end.x, segment.end.y].every(Number.isFinite)
}

function pathSegmentStart(segment: DiagramPathSegment): DiagramPoint {
  if (segment.kind !== "arc") return segment.start
  return { x: segment.center.x + Math.cos(segment.startAngle) * segment.radius, y: segment.center.y + Math.sin(segment.startAngle) * segment.radius }
}

function pathSegmentEnd(segment: DiagramPathSegment): DiagramPoint {
  if (segment.kind !== "arc") return segment.end
  const angle = segment.startAngle + segment.sweepAngle
  return { x: segment.center.x + Math.cos(angle) * segment.radius, y: segment.center.y + Math.sin(angle) * segment.radius }
}

function samePathPoint(a: DiagramPoint, b: DiagramPoint): boolean {
  return Math.abs(a.x - b.x) <= 1e-8 && Math.abs(a.y - b.y) <= 1e-8
}

function isVertexPortForHost(port: DiagramPort, hostId: DiagramId): port is DiagramPort & { hostId: DiagramId; anchor: { kind: "vertex"; index: number } } {
  return diagramPortHostId(port) === hostId && "hostId" in port && (port as Extract<DiagramPort, { hostId: DiagramId }>).anchor.kind === "vertex"
}

function createUpdateShapePathPatch(state: InternalState, id: DiagramId, points?: ReadonlyArray<DiagramPoint>, contours?: ReadonlyArray<DiagramPathContour>, worldSpace = false, portRemaps: Readonly<Record<DiagramId, DiagramPortRemap>> = {}): Patch | null {
  const previous = state.entities.shapesById.get(id)
  if (!previous || isEntityLockedOrReadOnly(state, id) || Boolean(points) === Boolean(contours)) return null
  if (points && (points.length < 2 || points.some((point) => ![point.x, point.y].every(Number.isFinite)))) return null
  if (contours && !validPathContours(contours)) return null
  const vertexPorts = [...state.entities.portsById.values()].filter((port) => isVertexPortForHost(port, id))
  const hostPorts = [...state.entities.portsById.values()].filter((port) => diagramPortHostId(port) === id)
  const oldPointCount = previous.points?.length ?? (previous.shape === "line" ? 2 : 0)
  const newPointCount = points?.length ?? (previous.shape === "line" ? 2 : 0)
  if (Object.keys(portRemaps).some((portId) => !hostPorts.some((port) => port.id === portId))) return null
  if (worldSpace && hostPorts.some((port) => !portRemaps[port.id])) return null
  if (vertexPorts.some((port) => !portRemaps[port.id] && (oldPointCount !== newPointCount || port.anchor.index >= newPointCount))) return null
  const worldPoints = points?.map((point) => worldSpace ? point : ({ x: previous.x + point.x, y: previous.y + point.y })) ?? []
  const world = [...worldPoints, ...(contours ?? []).flatMap((contour) => pathContourBoundsPoints(contour))]
  if (world.length < 2) return null
  const minX = Math.min(...world.map((point) => point.x)), minY = Math.min(...world.map((point) => point.y))
  const maxX = Math.max(...world.map((point) => point.x)), maxY = Math.max(...world.map((point) => point.y))
  const next: DiagramShape = {
    ...previous,
    shape: "line",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    ...(worldSpace ? { rotation: 0, flipX: false, flipY: false } : {}),
    points: points ? worldPoints.map((point) => ({ x: point.x - minX, y: point.y - minY })) : undefined,
    pathContours: contours?.map((contour) => translatePathContour(contour, -minX, -minY)),
  }
  const shapePatch = createEntitySnapshotPatch([id], new Map([[id, previous]]), new Map([[id, next]]), (draft, entityId, value) => draft.entities.shapesById.set(entityId, value))
  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextPorts = new Map<DiagramId, DiagramPort>()
  const projected = { ...snapshotEntities(state), shapesById: new Map(state.entities.shapesById).set(id, next) }
  for (const port of hostPorts) {
    const remap = portRemaps[port.id]
    if (!remap) {
      if (worldSpace && isVertexPortForHost(port, id)) {
        const before = createEntityGeometry(id, state.entities)?.path
        if (!before || !points || !samePathPoint(before[port.anchor.index]!, worldPoints[port.anchor.index]!)) return null
      }
      continue
    }
    if (!hasEntity(state, remap.hostId) || isEntityLockedOrReadOnly(state, port.id) || !isValidDiagramPortAnchor(remap.hostId, remap.anchor, projected)) return null
    previousPorts.set(port.id, port)
    nextPorts.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: remap.hostId, anchor: remap.anchor })
  }
  const portPatch = nextPorts.size ? createEntitySnapshotPatch([...nextPorts.keys()], previousPorts, nextPorts, (draft, portId, value) => draft.entities.portsById.set(portId, value)) : null
  return portPatch ? composeUndoablePatches(shapePatch, portPatch) : shapePatch
}

function createPathVertexPatch(state: InternalState, id: DiagramId, index: number, point: DiagramPoint | null, operation: "insert" | "move" | "remove", portRemaps: Readonly<Record<DiagramId, DiagramPortRemap>> = {}): Patch | null {
  const shape = state.entities.shapesById.get(id)
  const points = shape ? [...(shape.points ?? (shape.shape === "line" ? [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }] : []))] : null
  if (!shape || shape.shape !== "line" || !points?.length || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(index)) return null
  if (operation === "insert" ? index < 0 || index > points.length : index < 0 || index >= points.length) return null
  if (operation === "remove" && (points.length <= 2 || index === 0 || index === points.length - 1)) return null
  if (operation !== "remove" && (!point || ![point.x, point.y].every(Number.isFinite))) return null
  const vertexPorts = [...state.entities.portsById.values()].filter((port) => isVertexPortForHost(port, id))
  const removedPorts = operation === "remove" ? vertexPorts.filter((port) => port.anchor.index === index) : []
  if (removedPorts.some((port) => !portRemaps[port.id])) return null
  if (Object.keys(portRemaps).some((portId) => !removedPorts.some((port) => port.id === portId))) return null
  const previous = shape
  if (operation === "remove") points.splice(index, 1)
  else {
    const unrotated = inverseTransformPointAround(point!, resolveTransformOrigin({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.transformOrigin), shape.rotation ?? 0, shape.flipX === true, shape.flipY === true)
    const localPoint = { x: unrotated.x - shape.x, y: unrotated.y - shape.y }
    if (operation === "insert") points.splice(index, 0, localPoint)
    else points[index] = localPoint
  }
  const next = { ...shape, points }
  const shapePatch = createEntitySnapshotPatch([id], new Map([[id, previous]]), new Map([[id, next]]), (draft, entityId, value) => draft.entities.shapesById.set(entityId, value))
  if (operation === "move" || !vertexPorts.length) return shapePatch
  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextPorts = new Map<DiagramId, DiagramPort>()
  for (const port of vertexPorts) {
    const anchor = port.anchor
    const anchored = port
    if (removedPorts.some((removed) => removed.id === port.id)) {
      const remap = portRemaps[port.id]!
      const projected = { ...snapshotEntities(state), shapesById: new Map(state.entities.shapesById).set(id, next) }
      if (!hasEntity(state, remap.hostId) || !isValidDiagramPortAnchor(remap.hostId, remap.anchor, projected)) return null
      previousPorts.set(port.id, port)
      nextPorts.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: remap.hostId, anchor: remap.anchor })
      continue
    }
    if (anchor.kind !== "vertex" || (operation === "remove" && anchor.index < index) || (operation === "insert" && anchor.index < index)) continue
    previousPorts.set(port.id, port)
    const nextIndex = operation === "insert" ? anchor.index + 1 : anchor.index - 1
    nextPorts.set(port.id, { id: port.id, kind: "port", metadata: port.metadata, radius: port.radius, direction: port.direction, hostId: anchored.hostId, anchor: { kind: "vertex", index: nextIndex } })
  }
  const portPatch = nextPorts.size ? createEntitySnapshotPatch([...nextPorts.keys()], previousPorts, nextPorts, (draft, portId, value) => draft.entities.portsById.set(portId, value)) : null
  return portPatch ? composeUndoablePatches(shapePatch, portPatch) : shapePatch
}

function createUpdateShapePatch(state: InternalState, id: DiagramId, cornerRadius: number): Patch | null {
  const shape = state.entities.shapesById.get(id)
  if (!shape || isEntityLockedOrReadOnly(state, id) || !isValidCornerRadius(shape, cornerRadius)) return null
  if ((shape.cornerRadius ?? 0) === cornerRadius) return null
  const previous = shape
  const next = { ...shape, cornerRadius }
  return {
    apply: (draft) => { draft.entities.shapesById.set(id, next); return new Set([id]) },
    inverse: { apply: (draft) => { draft.entities.shapesById.set(id, previous); return new Set([id]) }, inverse: undefined as unknown as Patch },
  }
}

function isValidCornerRadius(shape: DiagramShape, radius: number): boolean {
  if (!Number.isFinite(radius) || radius < 0) return false
  if (shape.shape !== "rect") return radius === 0
  return radius <= Math.min(shape.width, shape.height) / 2
}

function isValidVisualStyle(style?: DiagramVisualStyle): boolean {
  if (style === undefined) return true
  if (!style || typeof style !== "object" || Object.keys(style).some((key) => !["fill", "stroke", "strokeWidth", "strokeDasharray", "fillRule", "color", "fontFamily", "fontSize", "fontWeight", "fontStyle"].includes(key))) return false
  return [style.fill, style.stroke, style.strokeDasharray, style.color, style.fontFamily, style.fontStyle].every((value) => value === undefined || typeof value === "string")
    && (style.strokeWidth === undefined || Number.isFinite(style.strokeWidth) && style.strokeWidth >= 0)
    && (style.fillRule === undefined || style.fillRule === "nonzero" || style.fillRule === "evenodd")
    && (style.fontSize === undefined || Number.isFinite(style.fontSize) && style.fontSize > 0)
    && (style.fontWeight === undefined || typeof style.fontWeight === "string" || Number.isFinite(style.fontWeight))
}

function isValidDiagramShape(shape: DiagramShape): boolean {
  return Boolean(shape && isValidVisualStyle(shape.visualStyle) && [shape.x, shape.y, shape.width, shape.height, shape.rotation ?? 0].every(Number.isFinite)
    && shape.width >= 0 && shape.height >= 0 && validFlipFlags(shape)
    && isValidCornerRadius(shape, shape.cornerRadius ?? 0)
    && (!shape.points || (shape.shape === "line" && shape.points.length >= 2 && shape.points.every((point) => [point.x, point.y].every(Number.isFinite))))
    && (!shape.pathContours || validPathContours(shape.pathContours)))
}

function createTableSnapshotPatch(id: DiagramId, previous: DiagramTable, next: DiagramTable, orderChanged = false): Patch | null {
  if (sameTableSnapshot(previous, next)) return null
  const apply = (value: DiagramTable): Patch["apply"] => (state) => { state.entities.tablesById.set(id, value); return new Set([id]) }
  return { orderChanged, apply: apply(next), inverse: { orderChanged, apply: apply(previous), inverse: undefined as unknown as Patch } }
}

function sameTableSnapshot(left: DiagramTable, right: DiagramTable): boolean {
  if (left === right) return true
  const scalarKeys = ["id", "kind", "x", "y", "width", "height", "rowCount", "columnCount", "rotation", "flipX", "flipY"] as const
  if (scalarKeys.some((key) => left[key] !== right[key]) || left.metadata !== right.metadata || left.visualStyle !== right.visualStyle || left.parentOffset !== right.parentOffset || left.transformOrigin !== right.transformOrigin) return false
  const sameArray = <Value>(a?: ReadonlyArray<Value>, b?: ReadonlyArray<Value>, equal: (a: Value, b: Value) => boolean = Object.is) => a === b || Boolean(a && b && a.length === b.length && a.every((value, index) => equal(value, b[index]!)))
  if (!sameArray(left.rowHeights, right.rowHeights) || !sameArray(left.columnWidths, right.columnWidths)) return false
  if (!sameArray(left.merges, right.merges, (a, b) => a.anchorCellId === b.anchorCellId && a.rowSpan === b.rowSpan && a.columnSpan === b.columnSpan)) return false
  if (left.cells !== right.cells && !sameArray(left.cells, right.cells, (leftRow, rightRow) => sameArray(leftRow, rightRow, (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)))) return false
  if (left.defaultCell !== right.defaultCell && JSON.stringify(left.defaultCell) !== JSON.stringify(right.defaultCell)) return false
  if (left.style !== right.style && JSON.stringify(left.style) !== JSON.stringify(right.style)) return false
  return JSON.stringify(left.header) === JSON.stringify(right.header)
}

function createCreateTablePatch(state: InternalState, input: DiagramTable): Patch | null {
  let table: DiagramTable
  try { validateDiagramTable(input); table = normalizeTable(input) } catch { return null }
  if (!isUniqueId(state, table.id) || !validTransformOrigin(table)) return null
  return {
    orderChanged: true,
    apply: (next) => { next.entities.tablesById.set(table.id, table); next.order.tableIds.push(table.id); next.versions.set(table.id, 0); return new Set([table.id]) },
    inverse: createDeleteEntitiesPatch([table.id]),
  }
}

function createMergeTableCellsPatch(state: InternalState, id: DiagramId, startRow: number, endRow: number, startColumn: number, endColumn: number, contentPolicy: "reject-non-empty" | "keep-anchor" = "reject-non-empty"): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || getTableMergeFailure(table, startRow, endRow, startColumn, endColumn, contentPolicy)) return null
  if (startRow === endRow && startColumn === endColumn) return null
  const cells = table.cells!
  const merges = table.merges ?? []
  const idPositions = new Map<string, { row: number; column: number }>()
  cells.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => { if (cell.id) idPositions.set(cell.id, { row: rowIndex, column: columnIndex }) }))
  const includedMerges: DiagramTableMerge[] = []
  for (const merge of merges) {
    const anchor = idPositions.get(merge.anchorCellId)
    if (!anchor) return null
    const mergeEndRow = anchor.row + merge.rowSpan - 1, mergeEndColumn = anchor.column + merge.columnSpan - 1
    const intersects = anchor.row <= endRow && mergeEndRow >= startRow && anchor.column <= endColumn && mergeEndColumn >= startColumn
    if (!intersects) continue
    if (anchor.row < startRow || mergeEndRow > endRow || anchor.column < startColumn || mergeEndColumn > endColumn) return null
    includedMerges.push(merge)
  }
  const anchorCell = cells[startRow]![startColumn]!
  if (contentPolicy === "reject-non-empty") {
    for (let row = startRow; row <= endRow; row += 1) for (let column = startColumn; column <= endColumn; column += 1) {
      if ((row !== startRow || column !== startColumn) && (cells[row]![column]!.text.trim().length || hasMeaningfulDiagramMetadata(cells[row]![column]!.metadata))) return null
      const existing = merges.find((merge) => merge.anchorCellId === cells[row]![column]!.id)
      if (existing && existing.anchorCellId !== anchorCell.id && cells[row]![column]!.text.trim().length) return null
    }
  }
  const nextMerges = merges.filter((merge) => !includedMerges.includes(merge))
  nextMerges.push({ anchorCellId: anchorCell.id!, rowSpan: endRow - startRow + 1, columnSpan: endColumn - startColumn + 1 })
  return createTableSnapshotPatch(id, table, { ...table, merges: nextMerges })
}

function getTableMergeFailure(table: DiagramTable | undefined, startRow: number, endRow: number, startColumn: number, endColumn: number, contentPolicy: "reject-non-empty" | "keep-anchor" = "reject-non-empty"): "merge-content-conflict" | "invalid-table-range" | null {
  if (!table || ![startRow, endRow, startColumn, endColumn].every(Number.isInteger) || startRow < 0 || startColumn < 0 || endRow >= table.rowCount || endColumn >= table.columnCount || endRow < startRow || endColumn < startColumn || (startRow === endRow && startColumn === endColumn) || (contentPolicy !== "reject-non-empty" && contentPolicy !== "keep-anchor")) return "invalid-table-range"
  const positions = new Map<string, { row: number; column: number }>()
  table.cells!.forEach((line, row) => line.forEach((cell, column) => { if (cell.id) positions.set(cell.id, { row, column }) }))
  for (const merge of table.merges ?? []) {
    const anchor = positions.get(merge.anchorCellId)
    if (!anchor) return "invalid-table-range"
    const lastRow = anchor.row + merge.rowSpan - 1, lastColumn = anchor.column + merge.columnSpan - 1
    const intersects = anchor.row <= endRow && lastRow >= startRow && anchor.column <= endColumn && lastColumn >= startColumn
    if (intersects && (anchor.row < startRow || lastRow > endRow || anchor.column < startColumn || lastColumn > endColumn)) return "invalid-table-range"
  }
  if (contentPolicy === "reject-non-empty") for (let row = startRow; row <= endRow; row += 1) for (let column = startColumn; column <= endColumn; column += 1) {
    if ((row !== startRow || column !== startColumn) && (table.cells![row]![column]!.text.trim().length || hasMeaningfulDiagramMetadata(table.cells![row]![column]!.metadata))) return "merge-content-conflict"
  }
  return null
}

function hasMeaningfulDiagramMetadata(metadata: DiagramMetadata | undefined): boolean {
  return Boolean(metadata && Object.keys(metadata).length > 0)
}

function isTableCoveredPosition(table: DiagramTable, row: number, column: number): boolean {
  const cellId = table.cells?.[row]?.[column]?.id
  if (!cellId) return false
  const positions = new Map<string, { row: number; column: number }>()
  table.cells!.forEach((line, rowIndex) => line.forEach((cell, columnIndex) => { if (cell.id) positions.set(cell.id, { row: rowIndex, column: columnIndex }) }))
  return (table.merges ?? []).some((merge) => {
    const anchor = positions.get(merge.anchorCellId)
    return Boolean(anchor && (row !== anchor.row || column !== anchor.column) && row >= anchor.row && row < anchor.row + merge.rowSpan && column >= anchor.column && column < anchor.column + merge.columnSpan)
  })
}

function createUnmergeTableCellPatch(state: InternalState, id: DiagramId, row: number, column: number): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= table.rowCount || column < 0 || column >= table.columnCount) return null
  const cells = table.cells!
  const positions = new Map<string, { row: number; column: number }>()
  cells.forEach((line, rowIndex) => line.forEach((cell, columnIndex) => { if (cell.id) positions.set(cell.id, { row: rowIndex, column: columnIndex }) }))
  const anchor = table.merges?.find((merge) => {
    const position = positions.get(merge.anchorCellId)
    return Boolean(position && row >= position.row && row < position.row + merge.rowSpan && column >= position.column && column < position.column + merge.columnSpan)
  })
  if (!anchor) return null
  return createTableSnapshotPatch(id, table, { ...table, merges: table.merges!.filter((merge) => merge !== anchor) })
}

function createTableStructurePatch(state: InternalState, id: DiagramId, axis: "row" | "column", index: number, operation: "insert" | "delete", suppliedCells?: ReadonlyArray<DiagramTableCell>): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id)) return null
  const count = axis === "row" ? table.rowCount : table.columnCount
  if (!Number.isInteger(index) || index < 0 || index > (operation === "insert" ? count : count - 1) || (operation === "delete" && count <= 1)) return null
  const rows = table.cells!.map((row) => [...row])
  let rowHeights = [...table.rowHeights!]
  let columnWidths = [...table.columnWidths!]
  let rowCount = table.rowCount
  let columnCount = table.columnCount
  if (axis === "row") {
    if (operation === "insert") {
      const cells = suppliedCells ?? Array.from({ length: columnCount }, () => ({ text: "" }))
      if (cells.length !== columnCount || cells.some((cell) => !isValidCell(cell))) return null
      const inserted = createInsertedTableCells(table, cells, rows.flat())
      if (!inserted) return null
      rows.splice(index, 0, inserted)
      const splitAt = Math.min(index, rowHeights.length - 1)
      const size = rowHeights[splitAt]! / 2
      rowHeights[splitAt] = size
      rowHeights.splice(index, 0, size)
      rowCount += 1
    } else {
      rows.splice(index, 1)
      const removed = rowHeights.splice(index, 1)[0]!
      const receiver = index < rowHeights.length ? index : Math.max(0, index - 1)
      rowHeights[receiver] = rowHeights[receiver]! + removed
      rowCount -= 1
    }
  } else {
    if (operation === "insert") {
      const cells = suppliedCells ?? Array.from({ length: rowCount }, () => ({ text: "" }))
      if (cells.length !== rowCount || cells.some((cell) => !isValidCell(cell))) return null
      const inserted = createInsertedTableCells(table, cells, rows.flat())
      if (!inserted) return null
      rows.forEach((row, rowIndex) => row.splice(index, 0, inserted[rowIndex]!))
      const splitAt = Math.min(index, columnWidths.length - 1)
      const size = columnWidths[splitAt]! / 2
      columnWidths[splitAt] = size
      columnWidths.splice(index, 0, size)
      columnCount += 1
    } else {
      rows.forEach((row) => row.splice(index, 1))
      const removed = columnWidths.splice(index, 1)[0]!
      const receiver = index < columnWidths.length ? index : Math.max(0, index - 1)
      columnWidths[receiver] = columnWidths[receiver]! + removed
      columnCount -= 1
    }
  }
  const next = adjustTableMergesForTrackEdit(table, rows, axis, index, operation)
  if (!next) return null
  const updated: DiagramTable = { ...table, rowCount, columnCount, cells: rows, rowHeights, columnWidths, merges: next }
  try { validateDiagramTable(updated) } catch { return null }
  return createTableSnapshotPatch(id, table, updated)
}

function createInsertedTableCells(table: DiagramTable, supplied: ReadonlyArray<DiagramTableCell>, existing: ReadonlyArray<DiagramTableCell>): DiagramTableCell[] | null {
  const used = new Set(existing.flatMap((cell) => cell.id ? [cell.id] : []))
  const result: DiagramTableCell[] = []
  let next = 0
  for (const cell of supplied) {
    if (!isValidCell(cell) || (cell.id !== undefined && used.has(cell.id))) return null
    let id = cell.id
    if (!id) { do { id = `${table.id}:insert:${next++}` } while (used.has(id)) }
    used.add(id)
    result.push(normalizeTableCell({ ...cell, id }))
  }
  return result
}

function adjustTableMergesForTrackEdit(table: DiagramTable, rows: DiagramTableCell[][], axis: "row" | "column", index: number, operation: "insert" | "delete"): DiagramTableMerge[] | null {
  const result: DiagramTableMerge[] = []
  const oldPositions = new Map<string, { row: number; column: number }>()
  table.cells!.forEach((line, row) => line.forEach((cell, column) => { if (cell.id) oldPositions.set(cell.id, { row, column }) }))
  for (const merge of table.merges ?? []) {
    const oldAnchor = oldPositions.get(merge.anchorCellId)
    if (!oldAnchor) return null
    const start = axis === "row" ? oldAnchor.row : oldAnchor.column
    const span = axis === "row" ? merge.rowSpan : merge.columnSpan
    let nextSpan = span
    let anchorId = merge.anchorCellId
    if (operation === "insert") {
      if (index > start && index < start + span) nextSpan += 1
    } else if (index >= start && index < start + span) {
      nextSpan -= 1
      if (index === start && nextSpan > 0) {
        const nextAnchorRow = axis === "row" ? index : oldAnchor.row
        const nextAnchorColumn = axis === "column" ? index : oldAnchor.column
        const previousAnchor = table.cells![oldAnchor.row]![oldAnchor.column]!
        const target = rows[nextAnchorRow]?.[nextAnchorColumn]
        if (!target) return null
        rows[nextAnchorRow]![nextAnchorColumn] = { ...target, ...previousAnchor }
        anchorId = previousAnchor.id!
      }
    }
    if (nextSpan <= 0) continue
    if (nextSpan === 1 && (axis === "row" ? merge.columnSpan : merge.rowSpan) === 1) continue
    result.push({ anchorCellId: anchorId, rowSpan: axis === "row" ? nextSpan : merge.rowSpan, columnSpan: axis === "column" ? nextSpan : merge.columnSpan })
  }
  return result
}

function isValidCell(cell: DiagramTableCell): boolean {
  return Boolean(cell && Object.keys(cell).every((key) => ["id", "text", "horizontalAlign", "verticalAlign", "metadata", "style"].includes(key)) && (cell.id === undefined || typeof cell.id === "string" && cell.id.length > 0) && typeof cell.text === "string" && (cell.horizontalAlign === undefined || ["left", "center", "right"].includes(cell.horizontalAlign)) && (cell.verticalAlign === undefined || ["top", "middle", "bottom"].includes(cell.verticalAlign)) && isValidDiagramMetadata(cell.metadata) && isValidDiagramTableCellStyle(cell.style))
}

function createUpdateTableCellPatch(state: InternalState, id: DiagramId, row: number, column: number, update: Partial<DiagramTableCell>): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= table.rowCount || column < 0 || column >= table.columnCount) return null
  if (Object.keys(update).some((key) => !["text", "horizontalAlign", "verticalAlign", "metadata", "style"].includes(key))) return null
  if (isTableCoveredPosition(table, row, column)) return null
  const cells = table.cells!.map((line) => [...line])
  const previous = cells[row]![column]!
  const nextCell = { ...previous, ...update, ...(update.style !== undefined ? { style: mergeTableCellStyle(previous.style, update.style) } : {}) }
  if (!isValidCell(nextCell)) return null
  cells[row]![column] = normalizeTableCell(nextCell, id, row, column)
  return createTableSnapshotPatch(id, table, { ...table, cells })
}

function createUpdateTableCellRangePatch(state: InternalState, id: DiagramId, startRow: number, endRow: number, startColumn: number, endColumn: number, update: Partial<DiagramTableCell>): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || ![startRow, endRow, startColumn, endColumn].every(Number.isInteger) || startRow < 0 || startColumn < 0 || endRow < startRow || endColumn < startColumn || endRow >= table.rowCount || endColumn >= table.columnCount || Object.keys(update).some((key) => !["text", "horizontalAlign", "verticalAlign", "metadata", "style"].includes(key))) return null
  const layout = resolveDiagramTableLayout(table)
  const expanded = layout.expandRange({ row: startRow, column: startColumn }, { row: endRow, column: endColumn })
  const cells = table.cells!.map((line) => [...line])
  const anchors = new Set<string>()
  for (let row = expanded.start.row; row <= expanded.end.row; row += 1) for (let column = expanded.start.column; column <= expanded.end.column; column += 1) {
    const anchor = layout.cellAnchors[row]![column]!
    anchors.add(`${anchor.row}:${anchor.column}`)
  }
  for (const value of anchors) {
    const [row, column] = value.split(":").map(Number) as [number, number]
    const previous = cells[row]![column]!
    const next = { ...previous, ...update, ...(update.style !== undefined ? { style: mergeTableCellStyle(previous.style, update.style) } : {}) }
    if (!isValidCell(next)) return null
    cells[row]![column] = normalizeTableCell(next, id, row, column)
  }
  return createTableSnapshotPatch(id, table, { ...table, cells })
}

function createSetTableCellBordersPatch(state: InternalState, id: DiagramId, startRow: number, endRow: number, startColumn: number, endColumn: number, preset: import("./types.js").DiagramTableBorderPreset, border?: import("./types.js").DiagramTableCellBorder): Patch | null {
  const table = state.entities.tablesById.get(id)
  const presets = ["all", "outside", "inside", "top", "right", "bottom", "left", "none", "reset"]
  if (!table || isEntityLockedOrReadOnly(state, id) || !presets.includes(preset) || ![startRow, endRow, startColumn, endColumn].every(Number.isInteger) || startRow < 0 || startColumn < 0 || endRow < startRow || endColumn < startColumn || endRow >= table.rowCount || endColumn >= table.columnCount || (border !== undefined && !isValidDiagramTableCellStyle({ borders: { top: border } }))) return null
  const layout = resolveDiagramTableLayout(table)
  const range = layout.expandRange({ row: startRow, column: startColumn }, { row: endRow, column: endColumn })
  const cells = table.cells!.map((line) => [...line])
  const sides = ["top", "right", "bottom", "left"] as const
  const selected = layout.visibleCells.filter((cell) => cell.row <= range.end.row && cell.row + cell.rowSpan - 1 >= range.start.row && cell.column <= range.end.column && cell.column + cell.columnSpan - 1 >= range.start.column)
  for (const region of selected) {
    const borderSides = sides.filter((side) => {
      if (preset === "all" || preset === "none" || preset === "reset") return true
      if (preset === "top") return side === "top" && region.row === range.start.row
      if (preset === "bottom") return side === "bottom" && region.row + region.rowSpan - 1 === range.end.row
      if (preset === "left") return side === "left" && region.column === range.start.column
      if (preset === "right") return side === "right" && region.column + region.columnSpan - 1 === range.end.column
      if (preset === "outside") return side === "top" ? region.row === range.start.row : side === "bottom" ? region.row + region.rowSpan - 1 === range.end.row : side === "left" ? region.column === range.start.column : region.column + region.columnSpan - 1 === range.end.column
      if (preset === "inside") return side === "top" ? region.row > range.start.row : side === "bottom" ? region.row + region.rowSpan - 1 < range.end.row : side === "left" ? region.column > range.start.column : region.column + region.columnSpan - 1 < range.end.column
      return false
    })
    const previous = cells[region.row]![region.column]!
    const borders = { ...(previous.style?.borders ?? {}) }
    for (const side of borderSides) {
      if (preset === "reset") delete borders[side]
      else if (preset === "none") borders[side] = { visible: false }
      else borders[side] = border ?? { visible: true }
    }
    const nextStyle = { ...(previous.style ?? {}), borders }
    if (!Object.keys(borders).length) delete (nextStyle as { borders?: unknown }).borders
    const style = Object.keys(nextStyle).length ? nextStyle : undefined
    const next = { ...previous, ...(style ? { style } : { style: undefined }) }
    if (!isValidCell(next)) return null
    cells[region.row]![region.column] = normalizeTableCell(next, id, region.row, region.column)
  }
  return createTableSnapshotPatch(id, table, { ...table, cells })
}

function createResizeTableAxisPatch(state: InternalState, id: DiagramId, axis: "row" | "column", index: number, size: number, policy: "fixed" | "flexible" = "flexible"): Patch | null {
  const table = state.entities.tablesById.get(id)
  const count = axis === "row" ? table?.rowCount : table?.columnCount
  if (!table || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(index) || index < 0 || index >= count! || !Number.isFinite(size) || size < 1 || (policy !== "fixed" && policy !== "flexible")) return null
  if (axis === "row") {
    const rowHeights = [...table.rowHeights!]
    if (policy === "fixed") {
      const neighbor = index + 1 < rowHeights.length ? index + 1 : index - 1
      if (neighbor < 0 || rowHeights[neighbor]! - (size - rowHeights[index]!) < 1) return null
      rowHeights[neighbor] = rowHeights[neighbor]! - (size - rowHeights[index]!)
    }
    rowHeights[index] = size
    return createTableSnapshotPatch(id, table, { ...table, rowHeights, height: rowHeights.reduce((sum, value) => sum + value, 0) })
  }
  const columnWidths = [...table.columnWidths!]
  if (policy === "fixed") {
    const neighbor = index + 1 < columnWidths.length ? index + 1 : index - 1
    if (neighbor < 0 || columnWidths[neighbor]! - (size - columnWidths[index]!) < 1) return null
    columnWidths[neighbor] = columnWidths[neighbor]! - (size - columnWidths[index]!)
  }
  columnWidths[index] = size
  return createTableSnapshotPatch(id, table, { ...table, columnWidths, width: columnWidths.reduce((sum, value) => sum + value, 0) })
}

function createSetTableSizePatch(state: InternalState, id: DiagramId, width?: number, height?: number, distribution: "proportional" = "proportional"): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || distribution !== "proportional" || (width !== undefined && (!Number.isFinite(width) || width <= 0)) || (height !== undefined && (!Number.isFinite(height) || height <= 0)) || (width === undefined && height === undefined)) return null
  const columnScale = width === undefined ? 1 : width / table.width
  const rowScale = height === undefined ? 1 : height / table.height
  const resizedTracks = (values: ReadonlyArray<number>, target: number, scale: number) => {
    const result = values.map((value) => value * scale)
    result[result.length - 1] = target - result.slice(0, -1).reduce((sum, value) => sum + value, 0)
    return result
  }
  const columnWidths = width === undefined ? [...table.columnWidths!] : resizedTracks(table.columnWidths!, width, columnScale)
  const rowHeights = height === undefined ? [...table.rowHeights!] : resizedTracks(table.rowHeights!, height, rowScale)
  if (!validSizes(columnWidths, table.columnCount) || !validSizes(rowHeights, table.rowCount)) return null
  return createTableSnapshotPatch(id, table, { ...table, width: width ?? table.width, height: height ?? table.height, columnWidths, rowHeights })
}

function createUpdateTableStylePatch(state: InternalState, id: DiagramId, update: DiagramTableStyleUpdate): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || !validTableStyleUpdateShape(update)) return null
  const baseStyle = normalizeTableStyle(table.style)
  const style = normalizeTableStyle({
    ...baseStyle,
    ...update,
    grid: { ...baseStyle.grid, ...update.grid, stroke: { ...baseStyle.grid.stroke, ...update.grid?.stroke } },
    border: { ...baseStyle.border, ...update.border, stroke: { ...baseStyle.border.stroke, ...update.border?.stroke } },
    ...(update.text ? { text: { ...(baseStyle.text ?? {}), ...update.text } } : {}),
  })
  try { validateDiagramTableStyle(style, id) } catch { return null }
  return createTableSnapshotPatch(id, table, { ...table, style })
}

function createUpdateTableHeaderPatch(state: InternalState, id: DiagramId, header: DiagramTableHeader | null): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || (header !== null && !isValidDiagramTableHeader(header))) return null
  const nextHeader = header === null ? undefined : { ...header }
  if (JSON.stringify(table.header) === JSON.stringify(nextHeader)) return null
  const next = nextHeader ? { ...table, header: nextHeader } : withoutTableHeader(table)
  return createTableSnapshotPatch(id, table, next)
}

function withoutTableHeader(table: DiagramTable): DiagramTable {
  const { header: _header, ...next } = table
  return next
}

function validTableStyleUpdateShape(update: unknown): update is DiagramTableStyleUpdate {
  if (!update || typeof update !== "object") return false
  const value = update as Record<string, unknown>
  const grid = value.grid as Record<string, unknown> | undefined
  const border = value.border as Record<string, unknown> | undefined
  const validStroke = (stroke: unknown) => Boolean(stroke && typeof stroke === "object" && Object.keys(stroke).every((key) => ["color", "width", "style"].includes(key)))
  return Object.keys(value).every((key) => ["grid", "border", "cellPadding", "background", "text", "overflow"].includes(key))
    && (value.grid === undefined || Boolean(grid && Object.keys(grid).every((key) => ["visible", "stroke"].includes(key)) && (grid.stroke === undefined || validStroke(grid.stroke))))
    && (value.border === undefined || Boolean(border && Object.keys(border).every((key) => ["visible", "stroke", "radius"].includes(key)) && (border.stroke === undefined || validStroke(border.stroke))))
    && (value.background === undefined || value.background === null || typeof value.background === "string")
    && (value.text === undefined || Boolean(value.text && typeof value.text === "object" && Object.keys(value.text as object).every((key) => ["fill", "stroke", "strokeWidth", "strokeDasharray", "fillRule", "color", "fontFamily", "fontSize", "fontWeight", "fontStyle"].includes(key))))
    && (value.overflow === undefined || ["clip", "visible", "wrap"].includes(value.overflow as string))
}

function resizeTable(table: DiagramTable, entry: DiagramResizeEntry): DiagramTable {
  const width = entry.width ?? table.width
  const headerHeight = table.header?.height ?? 0
  const previousOuterHeight = table.height + headerHeight
  const outerHeight = entry.height ?? previousOuterHeight
  const sy = outerHeight / previousOuterHeight
  const nextHeaderHeight = headerHeight * sy
  const height = outerHeight - nextHeaderHeight
  const sx = width / table.width
  const nextHeader = table.header ? { ...table.header, height: nextHeaderHeight } : undefined
  return { ...table, x: entry.x ?? table.x, y: (entry.y ?? table.y - headerHeight) + nextHeaderHeight, width, height, ...(nextHeader ? { header: nextHeader } : {}), columnWidths: table.columnWidths!.map((size) => size * sx), rowHeights: table.rowHeights!.map((size) => size * sy) }
}

function createGroupEntitiesPatch(state: InternalState, id: DiagramId, ids: ReadonlyArray<DiagramId>, transformOrigin?: TransformOrigin): Patch | null {
  const childIds = [...ids]
  if (!isUniqueId(state, id) || childIds.length < 2 || new Set(childIds).size !== childIds.length) return null
  const groupableIds = new Set<DiagramId>([
    ...state.entities.groupsById.keys(),
    ...state.entities.nodesById.keys(),
    ...state.entities.edgesById.keys(),
    ...state.entities.textsById.keys(),
    ...state.entities.shapesById.keys(),
    ...state.entities.tablesById.keys(),
  ])
  const alreadyGrouped = new Set([...state.entities.groupsById.values()].flatMap((group) => group.childIds))
  if (childIds.some((childId) => !groupableIds.has(childId) || alreadyGrouped.has(childId))) return null
  if (childIds.some((childId) => {
    const edge = state.entities.edgesById.get(childId)
    return Boolean(edge && (edge.source.kind !== "point" || edge.target.kind !== "point"))
  })) return null

  if (!validTransformOrigin({ transformOrigin })) return null
  const bounds = unionDiagramRects(childIds.map((childId) => createEntityGeometry(childId, state.entities)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect)))
  if (!bounds) return null
  const group: DiagramGroup = { id, kind: "group", childIds, x: bounds.x, y: bounds.y, ...(transformOrigin ? { transformOrigin } : {}) }
  const previousSelection = state.selection
  const nextSelection: DiagramSelection = { ids: [id], primaryId: id }
  const groupPatch: Patch = {
    orderChanged: true,
    apply: (next) => {
      next.entities.groupsById.set(id, group)
      next.order.groupIds.push(id)
      next.versions.set(id, 0)
      next.selection = nextSelection
      return new Set([id, "selection"])
    },
    inverse: {
      orderChanged: true,
      apply: (next) => {
        next.entities.groupsById.delete(id)
        next.order.groupIds = next.order.groupIds.filter((groupId) => groupId !== id)
        next.versions.delete(id)
        next.selection = previousSelection
        return new Set([id, "selection"])
      },
      inverse: undefined as unknown as Patch,
    },
  }
  const localize = new Map(childIds.map((childId) => [childId, { x: -bounds.x, y: -bounds.y }]))
  const localizePatch = createMovePatchUnchecked(childIds, localize)
  const restorePositions = createMovePatchUnchecked(childIds, new Map(childIds.map((childId) => [childId, { x: bounds.x, y: bounds.y }])))
  localizePatch.inverse = restorePositions
  restorePositions.inverse = localizePatch
  return composeUndoablePatches(groupPatch, localizePatch)
}

function createReparentEntityPatch(state: InternalState, id: DiagramId, parentId: DiagramId | null): Patch | null {
  const entity = getDiagramRotationSnapshot(state, id)
  const oldParentId = resolveDiagramParentId(id, state.entities)
  if (!entity || entity.kind === "edge" && parentId === oldParentId || parentId === oldParentId || isEntityLockedOrReadOnly(state, id)) return null
  const targetParent = parentId ? state.entities.groupsById.get(parentId) : null
  if (parentId && (!targetParent || isEntityLockedOrReadOnly(state, parentId) || (targetParent.x === undefined && targetParent.y === undefined))) return null
  if (entity.kind === "group" && (entity.x === undefined && entity.y === undefined || parentId === id || parentId && groupDescendantIds(state, id).includes(parentId))) return null
  const oldParent = oldParentId ? state.entities.groupsById.get(oldParentId) : null
  if (oldParentId && (!oldParent || (oldParent.x === undefined && oldParent.y === undefined))) return null
  if (entity.kind === "edge") {
    const attached = entity.source.kind !== "point" || entity.target.kind !== "point"
    if (entity.routing?.mode === "auto" || attached && (oldParentId || parentId)) return null
  }

  const oldWorld = resolveWorldEntityTransform(id, state.entities)
  const targetWorld = parentId ? resolveWorldEntityTransform(parentId, state.entities) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const inverseTarget = invertDiagramAffine(targetWorld)
  if (!inverseTarget) return null
  const desiredLocal = composeDiagramAffine(inverseTarget, oldWorld)
  const decomposition = decomposeOrthogonalTransform(desiredLocal)
  if (!decomposition) return null
  if (entity.kind === "edge" && (Math.abs(decomposition.rotation % 360) > 1e-8 || decomposition.flipX || decomposition.flipY)) return null

  const nextEntity = entity.kind === "edge"
    ? { ...entity, parentOffset: { x: desiredLocal.e, y: desiredLocal.f } }
    : { ...entity, rotation: decomposition.rotation, flipX: decomposition.flipX, flipY: decomposition.flipY, parentOffset: undefined }
  const temp = cloneDiagramEntities(state.entities)
  setRotationSnapshot(temp, nextEntity)
  if (oldParent) temp.groupsById.set(oldParent.id, { ...oldParent, childIds: oldParent.childIds.filter((childId) => childId !== id) })
  if (targetParent) temp.groupsById.set(targetParent.id, { ...targetParent, childIds: [...targetParent.childIds, id] })

  if (entity.kind !== "edge") {
    const base = resolveLocalEntityTransform(id, temp)
    const offset = { x: desiredLocal.e - base.e, y: desiredLocal.f - base.f }
    const compensated = { ...nextEntity, parentOffset: Math.abs(offset.x) < 1e-10 && Math.abs(offset.y) < 1e-10 ? undefined : offset }
    setRotationSnapshot(temp, compensated)
  }

  // Membership edits can change relative pivots on the old and new ancestor chains.
  // Preserve each affected group's local affine transform from the deepest group outward.
  const affected = new Set<DiagramId>()
  for (const start of [oldParentId, parentId]) {
    let current = start
    while (current && !affected.has(current)) {
      affected.add(current)
      current = resolveDiagramParentId(current, state.entities)
    }
  }
  const depth = (groupId: DiagramId) => {
    let value = 0, current = resolveDiagramParentId(groupId, state.entities)
    const seen = new Set<DiagramId>()
    while (current && !seen.has(current)) { seen.add(current); value += 1; current = resolveDiagramParentId(current, state.entities) }
    return value
  }
  for (const groupId of [...affected].sort((a, b) => depth(b) - depth(a))) {
    const before = state.entities.groupsById.get(groupId)
    const after = temp.groupsById.get(groupId)
    if (!before || !after) continue
    const desired = resolveLocalEntityTransform(groupId, state.entities)
    const withoutOffset = { ...after, parentOffset: undefined }
    temp.groupsById.set(groupId, withoutOffset)
    const base = resolveLocalEntityTransform(groupId, temp)
    temp.groupsById.set(groupId, { ...after, parentOffset: { x: desired.e - base.e, y: desired.f - base.f } })
  }

  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextPorts = new Map<DiagramId, DiagramPort>()
  for (const groupId of affected) {
    const group = temp.groupsById.get(groupId)
    if (!group) continue
    const newBounds = unionDiagramRects(group.childIds.map((childId) => createLocalEntityGeometry(childId, temp)?.bounds).filter((bounds): bounds is DiagramRect => Boolean(bounds)))
    const inverseWorld = invertDiagramAffine(resolveWorldEntityTransform(groupId, temp))
    for (const port of state.entities.portsById.values()) {
      if (diagramPortHostId(port) !== groupId || !("hostId" in port)) continue
      const hostedPort = port as Extract<DiagramPort, { hostId: DiagramId }>
      if (hostedPort.anchor.kind !== "local") continue
      if (!newBounds || !inverseWorld || isEntityLockedOrReadOnly(state, port.id)) return null
      const world = resolvePortPoint(port, state.entities)
      const local = transformDiagramPoint(inverseWorld, world)
      const anchored: Extract<DiagramPort, { hostId: DiagramId }> = { ...hostedPort, anchor: { kind: "local", x: local.x - newBounds.x, y: local.y - newBounds.y } }
      previousPorts.set(port.id, port)
      nextPorts.set(port.id, anchored)
      temp.portsById.set(port.id, anchored)
    }
  }

  const previous = new Map<DiagramId, DiagramRotationSnapshot>([[id, entity]])
  const next = new Map<DiagramId, DiagramRotationSnapshot>([[id, getDiagramRotationSnapshotFromEntities(temp, id)!]])
  for (const groupId of affected) {
    const before = state.entities.groupsById.get(groupId), after = temp.groupsById.get(groupId)
    if (before && after && JSON.stringify(before) !== JSON.stringify(after)) { previous.set(groupId, before); next.set(groupId, after) }
  }
  const ids = [...previous.keys()]
  const entityPatch = createEntitySnapshotPatch(ids, previous, next, (draft, entityId, value) => setRotationSnapshot(draft.entities, value))
  const portPatch = nextPorts.size ? createEntitySnapshotPatch([...nextPorts.keys()], previousPorts, nextPorts, (draft, portId, value) => draft.entities.portsById.set(portId, value)) : null
  return portPatch ? composeUndoablePatches(entityPatch, portPatch) : entityPatch
}

function cloneDiagramEntities(entities: DiagramEntities) {
  return { nodesById: new Map(entities.nodesById), edgesById: new Map(entities.edgesById), textsById: new Map(entities.textsById), shapesById: new Map(entities.shapesById), portsById: new Map(entities.portsById), junctionsById: new Map(entities.junctionsById), groupsById: new Map(entities.groupsById), tablesById: new Map(entities.tablesById) }
}

function setRotationSnapshot(entities: ReturnType<typeof cloneDiagramEntities> | MutableEntities, entity: DiagramRotationSnapshot): void {
  if (entity.kind === "node") entities.nodesById.set(entity.id, entity)
  else if (entity.kind === "edge") entities.edgesById.set(entity.id, entity)
  else if (entity.kind === "text") entities.textsById.set(entity.id, entity)
  else if (entity.kind === "shape") entities.shapesById.set(entity.id, entity)
  else if (entity.kind === "table") entities.tablesById.set(entity.id, entity)
  else entities.groupsById.set(entity.id, entity)
}

function getDiagramRotationSnapshotFromEntities(entities: DiagramEntities, id: DiagramId): DiagramRotationSnapshot | null {
  return entities.nodesById.get(id) ?? entities.edgesById.get(id) ?? entities.textsById.get(id) ?? entities.shapesById.get(id) ?? entities.tablesById.get(id) ?? entities.groupsById.get(id) ?? null
}

function createUngroupEntitiesPatch(state: InternalState, ids: ReadonlyArray<DiagramId>, portRemaps: Readonly<Record<DiagramId, DiagramPortRemap>> = {}): Patch | null {
  const groupIds = [...new Set(ids)]
  if (!groupIds.length || groupIds.some((id) => !state.entities.groupsById.has(id) || isEntityLockedOrReadOnly(state, id))) return null
  if (groupIds.some((id) => groupIds.some((otherId) => id !== otherId && groupDescendantIds(state, id).includes(otherId)))) return null
  const groups = groupIds.map((id) => state.entities.groupsById.get(id)!)
  const previousChildren = new Map<DiagramId, DiagramRotationSnapshot>()
  const nextChildren = new Map<DiagramId, DiagramRotationSnapshot>()
  for (const group of groups) {
    // TODO(next-major): Remove the legacy baked-group ungroup branch after supported legacy scenes migrate.
    if (group.x === undefined && group.y === undefined) continue
    const groupMatrix = resolveLocalEntityTransform(group.id, state.entities)
    for (const childId of group.childIds) {
      const child = getDiagramRotationSnapshot(state, childId)
      if (!child) return null
      previousChildren.set(childId, child)
      if (child.kind === "edge") {
        if (child.source.kind !== "point" || child.target.kind !== "point") return null
        const pointMatrix = composeDiagramAffine(groupMatrix, resolveLocalEntityTransform(childId, state.entities))
        const point = (value: DiagramPoint) => transformDiagramPoint(pointMatrix, value)
        nextChildren.set(childId, {
          ...child,
          source: { kind: "point", point: point(child.source.point) },
          target: { kind: "point", point: point(child.target.point) },
          points: child.points?.map(point),
          ...(child.routing ? { routing: { ...child.routing, ...(child.routing.waypoints ? { waypoints: child.routing.waypoints.map(point) } : {}), ...(child.routing.routeHint ? { routeHint: point(child.routing.routeHint) } : {}) } } : {}),
          parentOffset: undefined,
        })
        continue
      }
      const composed = composeDiagramAffine(groupMatrix, resolveLocalEntityTransform(childId, state.entities))
      const decomposition = decomposeOrthogonalTransform(composed)
      if (!decomposition) return null
      if (child.kind === "group") {
        const candidate = { ...child, rotation: decomposition.rotation, flipX: decomposition.flipX, flipY: decomposition.flipY, parentOffset: undefined }
        const future = cloneDiagramEntities(state.entities)
        setRotationSnapshot(future, candidate)
        const base = resolveLocalEntityTransform(childId, future)
        nextChildren.set(childId, { ...candidate, parentOffset: { x: composed.e - base.e, y: composed.f - base.f } })
        continue
      }
      const candidate = {
        ...child,
        rotation: decomposition.rotation,
        flipX: decomposition.flipX,
        flipY: decomposition.flipY,
        parentOffset: undefined,
      }
      const future = cloneDiagramEntities(state.entities)
      setRotationSnapshot(future, candidate)
      const base = resolveLocalEntityTransform(childId, future)
      nextChildren.set(childId, { ...candidate, parentOffset: { x: composed.e - base.e, y: composed.f - base.f } })
    }
  }
  const hostedPorts = [...state.entities.portsById.values()].filter((port) => groupIds.includes(diagramPortHostId(port)))
  if (hostedPorts.some((port) => isEntityLockedOrReadOnly(state, port.id))) return null
  const remapIds = Object.keys(portRemaps)
  if (remapIds.some((id) => !hostedPorts.some((port) => port.id === id)) || hostedPorts.some((port) => !portRemaps[port.id])) return null
  const nextPorts = new Map<DiagramId, DiagramPort>()
  const previousPorts = new Map<DiagramId, DiagramPort>()
  const nextNodePorts = new Map<DiagramId, DiagramNode>()
  const previousNodePorts = new Map<DiagramId, DiagramNode>()
  for (const port of hostedPorts) {
    const remap = portRemaps[port.id]!
    const group = groups.find((entry) => entry.id === diagramPortHostId(port))!
    if (!group.childIds.includes(remap.hostId) || !hasEntity(state, remap.hostId) || isEntityLockedOrReadOnly(state, remap.hostId) || !isValidDiagramPortAnchor(remap.hostId, remap.anchor, state.entities)) return null
    previousPorts.set(port.id, port)
    const anchoredPort = port as Extract<DiagramPort, { hostId: DiagramId }>
    nextPorts.set(port.id, { ...anchoredPort, hostId: remap.hostId, anchor: remap.anchor })
    const node = state.entities.nodesById.get(remap.hostId)
    if (node) {
      previousNodePorts.set(node.id, node)
      const current = nextNodePorts.get(node.id) ?? node
      nextNodePorts.set(node.id, { ...current, portIds: [...new Set([...(current.portIds ?? []), port.id])] })
    }
  }
  const previousSelection = state.selection
  const childIds = [...new Set(groups.flatMap((group) => group.childIds))]
  const nextSelection: DiagramSelection = { ids: childIds, primaryId: childIds[0] ?? null }
  const positions = new Map(groupIds.map((id) => [id, state.order.groupIds.indexOf(id)]))
  const parentGroups = [...state.entities.groupsById.values()].filter((group) => !groupIds.includes(group.id) && groupIds.some((id) => group.childIds.includes(id)))
  if (parentGroups.length > 1 || parentGroups.some((parent) => groupIds.some((id) => parent.childIds.filter((childId) => childId === id).length !== 1))) return null
  const previousParents = new Map(parentGroups.map((group) => [group.id, group]))
  const nextParents = new Map(parentGroups.map((parent) => [parent.id, {
    ...parent,
    childIds: parent.childIds.flatMap((childId) => {
      const ungrouped = groups.find((group) => group.id === childId)
      return ungrouped ? ungrouped.childIds : [childId]
    }),
  }]))
  const ungroupPatch: Patch = {
    orderChanged: true,
    apply: (next) => {
      for (const id of groupIds) next.entities.groupsById.delete(id)
      for (const [id, parent] of nextParents) next.entities.groupsById.set(id, parent)
      next.order.groupIds = next.order.groupIds.filter((id) => !groupIds.includes(id))
      for (const id of groupIds) next.versions.delete(id)
      for (const [id, port] of nextPorts) next.entities.portsById.set(id, port)
      for (const [id, node] of nextNodePorts) next.entities.nodesById.set(id, node)
      next.selection = nextSelection
      return new Set([...groupIds, ...nextParents.keys(), ...nextPorts.keys(), ...nextNodePorts.keys(), "selection"])
    },
    inverse: {
      orderChanged: true,
      apply: (next) => {
        for (const group of groups) {
          next.entities.groupsById.set(group.id, group)
          const position = positions.get(group.id) ?? next.order.groupIds.length
          next.order.groupIds.splice(Math.max(0, Math.min(position, next.order.groupIds.length)), 0, group.id)
          next.versions.set(group.id, 0)
        }
        for (const [id, group] of previousParents) next.entities.groupsById.set(id, group)
        for (const [id, port] of previousPorts) next.entities.portsById.set(id, port)
        for (const [id, node] of previousNodePorts) next.entities.nodesById.set(id, node)
        next.selection = previousSelection
        return new Set([...groupIds, ...previousParents.keys(), ...previousPorts.keys(), ...previousNodePorts.keys(), "selection"])
      },
      inverse: undefined as unknown as Patch,
    },
  }
  if (!nextChildren.size && !parentGroups.length) return ungroupPatch
  const transformChildrenPatch = createRotatePatchUnchecked([...nextChildren.values()], [...previousChildren.values()])
  return composeUndoablePatches(transformChildrenPatch, ungroupPatch)
}

function createCreatePortPatch(state: InternalState, port: import("./types.js").DiagramPort): Patch | null {
  if (!isValidDiagramMetadata(port.metadata)) return null
  if (port.direction !== undefined && !["north", "east", "south", "west", "auto", "any"].includes(port.direction)) return null
  const safePort = { ...port, ...(port.metadata ? { metadata: cloneDiagramMetadata(port.metadata) } : {}) } as typeof port
  const hostId = diagramPortHostId(port)
  const owner = state.entities.nodesById.get(hostId)
  const validAnchor = "nodeId" in port && port.nodeId
    ? Number.isFinite(port.x) && Number.isFinite(port.y)
    : "hostId" in port && Boolean(port.hostId) && isValidDiagramPortAnchor((port as Extract<DiagramPort, { hostId: DiagramId }>).hostId, (port as Extract<DiagramPort, { hostId: DiagramId }>).anchor, state.entities)
  if (!hostId || !hasEntity(state, hostId) || isEntityLockedOrReadOnly(state, hostId) || !isUniqueId(state, port.id) || !isValidVisualStyle(port.visualStyle) || !validAnchor || (port.radius !== undefined && (!Number.isFinite(port.radius) || port.radius < 0))) return null
  const previousPorts = owner?.portIds ?? []
  const nextPorts = owner ? [...new Set([...previousPorts, port.id])] : null
  return {
    orderChanged: true,
    apply: (next) => {
      next.entities.portsById.set(port.id, safePort)
      if (owner && nextPorts) next.entities.nodesById.set(owner.id, { ...next.entities.nodesById.get(owner.id)!, portIds: nextPorts })
      next.versions.set(port.id, 0)
      return new Set([port.id, hostId, ...(owner ? [owner.id] : [])])
    },
    inverse: {
      orderChanged: true,
      apply: (next) => { next.entities.portsById.delete(port.id); if (owner) next.entities.nodesById.set(owner.id, { ...next.entities.nodesById.get(owner.id)!, portIds: previousPorts }); return new Set([port.id, hostId, ...(owner ? [owner.id] : [])]) },
      inverse: undefined as unknown as Patch,
    },
  }
}

function createSetPortDirectionPatch(state: InternalState, id: DiagramId, direction: import("./types.js").DiagramPortDirection | undefined): Patch | null {
  if (direction !== undefined && !["north", "east", "south", "west", "auto", "any"].includes(direction)) return null
  const port = state.entities.portsById.get(id)
  if (!port || isEntityLockedOrReadOnly(state, id)) return null
  if (port.direction === direction) return null
  const next = { ...port, ...(direction === undefined ? { direction: undefined } : { direction }) }
  return createEntitySnapshotPatch([id], new Map([[id, port]]), new Map([[id, next]]), (draft, portId, value) => draft.entities.portsById.set(portId, value))
}

function createCreateJunctionPatch(state: InternalState, junction: DiagramJunction): Patch | null {
  if (junction.kind !== "junction" || !isUniqueId(state, junction.id) || !state.entities.edgesById.has(junction.hostEdgeId)
    || !isValidVisualStyle(junction.visualStyle) || !isValidJunctionAnchor(junction.anchor) || isEntityLockedOrReadOnly(state, junction.hostEdgeId)) return null
  if (junction.anchor.kind === "fixed") {
    const entities = { ...snapshotEntities(state), junctionsById: new Map(state.entities.junctionsById).set(junction.id, junction) }
    if (fixedJunctionRouteFailure(entities)) return null
  }
  return {
    apply: (next) => { next.entities.junctionsById.set(junction.id, junction); next.versions.set(junction.id, 0); return new Set([junction.id, junction.hostEdgeId]) },
    inverse: { apply: (next) => { next.entities.junctionsById.delete(junction.id); next.versions.delete(junction.id); return new Set([junction.id, junction.hostEdgeId]) }, inverse: undefined as unknown as Patch },
  }
}

function createUpdateJunctionPatch(state: InternalState, id: DiagramId, anchor: DiagramJunction["anchor"]): Patch | null {
  const previous = state.entities.junctionsById.get(id)
  if (!previous || !isValidJunctionAnchor(anchor) || isEntityLockedOrReadOnly(state, id) || isEntityLockedOrReadOnly(state, previous.hostEdgeId)) return null
  const next = { ...previous, anchor }
  const entities = { ...snapshotEntities(state), junctionsById: new Map(state.entities.junctionsById).set(id, next) }
  if (anchor.kind === "fixed" && fixedJunctionRouteFailure(entities)) return null
  if ([...entities.edgesById.values()].some((edge) => hasRouteAttachmentCycle(edge, entities.edgesById, entities.junctionsById, entities.portsById))) return null
  const apply = (value: DiagramJunction): Patch["apply"] => (draft) => { draft.entities.junctionsById.set(id, value); return new Set([id, value.hostEdgeId]) }
  return { apply: apply(next), inverse: { apply: apply(previous), inverse: undefined as unknown as Patch } }
}

function isValidJunctionAnchor(anchor: DiagramJunction["anchor"]): boolean {
  return anchor?.kind === "route"
    ? Number.isFinite(anchor.fraction) && anchor.fraction >= 0 && anchor.fraction <= 1
    : anchor?.kind === "fixed" && Number.isFinite(anchor.point?.x) && Number.isFinite(anchor.point?.y)
}

function createDeleteEntitiesCommandPatch(state: InternalState, ids: ReadonlyArray<DiagramId>): Patch | null {
  if (!ids.length || ids.some((id) => !hasEntity(state, id))) return null
  const cascade = expandDeletedIds(state, ids)
  const deleting = new Set(cascade)
  if (wouldLeaveGroupPortWithoutBounds(state, deleting)) return null
  for (const id of deleting) {
    for (const port of state.entities.portsById.values()) if (diagramPortHostId(port) === id && !deleting.has(port.id)) return null
    for (const edge of state.entities.edgesById.values()) if ((endpointDeleted(edge.source, deleting) || endpointDeleted(edge.target, deleting)) && !deleting.has(edge.id)) return null
  }
  if (cascade.length !== new Set(cascade).size || cascade.some((id) => isEntityNonDeletable(state, id) || isEntityLockedOrReadOnly(state, id))) return null
  if (ids.some((id) => isEntityNonDeletable(state, id) || isEntityLockedOrReadOnly(state, id))) return null
  return createDeleteEntitiesPatch(cascade)
}

function wouldLeaveGroupPortWithoutBounds(state: InternalState, deleting: ReadonlySet<DiagramId>): boolean {
  return [...state.entities.groupsById.values()].some((group) => !deleting.has(group.id)
    && group.childIds.length > 0
    && group.childIds.every((childId) => deleting.has(childId))
    && [...state.entities.portsById.values()].some((port) => diagramPortHostId(port) === group.id && !deleting.has(port.id)))
}

function createReconnectEdgeEndpointPatch(state: InternalState, id: DiagramId, endpoint: "source" | "target", connection: DiagramEdgeEndpoint): Patch | null {
  const edge = state.entities.edgesById.get(id)
  if (!edge || isEntityLockedOrReadOnly(state, id) || !isValidEndpoint(state, connection)) return null
  const previous = edge[endpoint]
  if (JSON.stringify(previous) === JSON.stringify(connection)) return null
  if (hasRouteAttachmentCycle({ ...edge, [endpoint]: connection }, state.entities.edgesById, state.entities.junctionsById, state.entities.portsById)) return null
  return {
    apply: (next) => { const current = next.entities.edgesById.get(id); if (!current) return new Set(); next.entities.edgesById.set(id, { ...current, [endpoint]: connection }); return new Set([id]) },
    inverse: { apply: (next) => { const current = next.entities.edgesById.get(id); if (!current) return new Set(); next.entities.edgesById.set(id, { ...current, [endpoint]: previous }); return new Set([id]) }, inverse: undefined as unknown as Patch },
  }
}

function isUniqueId(state: InternalState, id: DiagramId): boolean { return typeof id === "string" && id.length > 0 && !hasEntity(state, id) }
function groupMembers(state: InternalState, id: DiagramId): ReadonlyArray<DiagramId> { return state.entities.groupsById.get(id)?.childIds ?? [] }
function groupDescendantIds(state: InternalState, id: DiagramId): DiagramId[] {
  const result: DiagramId[] = []
  const pending = [...groupMembers(state, id)]
  const seen = new Set<DiagramId>()
  while (pending.length) {
    const childId = pending.pop()!
    if (seen.has(childId)) continue
    seen.add(childId)
    result.push(childId)
    pending.push(...groupMembers(state, childId))
  }
  return result
}
function normalizeGroupSelectionIds(state: InternalState, ids: ReadonlyArray<DiagramId>): DiagramId[] {
  const selected = new Set(ids)
  const parents = new Map<DiagramId, DiagramId>()
  for (const group of state.entities.groupsById.values()) for (const childId of group.childIds) parents.set(childId, group.id)
  return ids.filter((id) => {
    let parent = parents.get(id)
    const seen = new Set<DiagramId>()
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return false
      seen.add(parent)
      parent = parents.get(parent)
    }
    return true
  })
}
function expandGroupEntityIds(state: InternalState, ids: ReadonlyArray<DiagramId>, includeGroups: boolean): DiagramId[] {
  const expanded = new Set<DiagramId>()
  for (const id of ids) {
    const group = state.entities.groupsById.get(id)
    if (!group) { expanded.add(id); continue }
    if (includeGroups) expanded.add(id)
    for (const childId of group.childIds) expanded.add(childId)
  }
  return [...expanded]
}
function isGroupMovable(state: InternalState, id: DiagramId): boolean {
  const children = groupMembers(state, id)
  const movable = (childId: DiagramId) => state.entities.groupsById.has(childId) || isEntityTranslatable(state.entities, childId) || state.entities.edgesById.has(childId)
  return children.length > 0
    && children.every((childId) => !isEntityLockedOrReadOnly(state, childId) && movable(childId))
    && children.some(movable)
}
function isGroupRotatable(state: InternalState, id: DiagramId): boolean {
  const children = groupMembers(state, id)
  const supported = (childId: DiagramId) => state.entities.groupsById.has(childId)
    || state.entities.nodesById.has(childId)
    || state.entities.shapesById.has(childId)
    || state.entities.textsById.has(childId)
    || state.entities.tablesById.has(childId)
    || state.entities.edgesById.has(childId)
  const hasRotatableGeometry = (childId: DiagramId) => !state.entities.edgesById.has(childId)
    || isEdgeTranslatable(state.entities.edgesById.get(childId))
  return !isEntityLockedOrReadOnly(state, id)
    && children.length > 0
    && children.every((childId) => supported(childId) && !isEntityLockedOrReadOnly(state, childId))
    && children.some(hasRotatableGeometry)
}
function isGroupResizableEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.shapesById.has(id) || state.entities.textsById.has(id) || state.entities.edgesById.has(id) || state.entities.tablesById.has(id)
}

function isEntityTranslatable(entities: MutableEntities, id: DiagramId): boolean {
  if (entities.nodesById.has(id) || entities.textsById.has(id) || entities.shapesById.has(id) || entities.tablesById.has(id)) return true
  const edge = entities.edgesById.get(id)
  return Boolean(edge && (edge.source.kind === "point" || edge.target.kind === "point" || edge.points?.length))
}

function createEntitySnapshotPatch<Entity>(
  ids: ReadonlyArray<DiagramId>,
  previous: ReadonlyMap<DiagramId, Entity>,
  nextValues: ReadonlyMap<DiagramId, Entity>,
  setValue: (state: InternalState, id: DiagramId, entity: Entity) => void,
): Patch {
  const applyValues = (state: InternalState, values: ReadonlyMap<DiagramId, Entity>) => {
    for (const id of ids) {
      const value = values.get(id)
      if (value !== undefined) setValue(state, id, value)
    }
    return new Set(ids)
  }
  return {
    apply: (state) => applyValues(state, nextValues),
    inverse: { apply: (state) => applyValues(state, previous), inverse: undefined as unknown as Patch },
  }
}

function diagramEdgesEqual(first: DiagramEdge, second: DiagramEdge): boolean {
  return JSON.stringify(first.source) === JSON.stringify(second.source)
    && JSON.stringify(first.target) === JSON.stringify(second.target)
    && JSON.stringify(first.points ?? []) === JSON.stringify(second.points ?? [])
}

function isValidEndpoint(state: InternalState, endpoint: DiagramEdgeEndpoint): boolean {
  if (endpoint.kind === "point") return Number.isFinite(endpoint.point.x) && Number.isFinite(endpoint.point.y)
  if (endpoint.kind === "node") return state.entities.nodesById.has(endpoint.nodeId)
  if (endpoint.kind === "junction") return state.entities.junctionsById.has(endpoint.junctionId)
  const port = state.entities.portsById.get(endpoint.portId)
  return Boolean(port && hasEntity(state, diagramPortHostId(port)))
}
function isValidEdge(state: InternalState, edge: DiagramEdge): boolean {
  return isValidVisualStyle(edge.visualStyle) && isValidEndpoint(state, edge.source) && isValidEndpoint(state, edge.target)
    && (edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    && (edge.routing?.mode !== "manual" || normalizeOrthogonalRoute([resolveEndpoint(edge.source, state.entities), ...(edge.points ?? []), resolveEndpoint(edge.target, state.entities)]) !== null)
    && (edge.routing === undefined || isValidEdgeRouting(edge.routing))
}

function hasRouteAttachmentCycle(
  candidate: DiagramEdge,
  edges: ReadonlyMap<DiagramId, DiagramEdge>,
  junctions: ReadonlyMap<DiagramId, DiagramJunction>,
  ports: ReadonlyMap<DiagramId, DiagramPort>,
): boolean {
  const visiting = new Set<DiagramId>()
  const visited = new Set<DiagramId>()
  const edgeFor = (id: DiagramId) => id === candidate.id ? candidate : edges.get(id)
  const hostEdge = (endpoint: DiagramEdgeEndpoint): DiagramId | null => {
    if (endpoint.kind === "junction") {
      const junction = junctions.get(endpoint.junctionId)
      return junction?.anchor.kind === "route" ? junction.hostEdgeId : null
    }
    if (endpoint.kind !== "port") return null
    const port = ports.get(endpoint.portId)
    if (!port || !("hostId" in port) || typeof port.hostId !== "string") return null
    return edges.has(port.hostId) ? port.hostId : null
  }
  const visit = (id: DiagramId): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    const edge = edgeFor(id)
    if (!edge) return false
    visiting.add(id)
    for (const endpoint of [edge.source, edge.target]) {
      const host = hostEdge(endpoint)
      if (host && visit(host)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return visit(candidate.id)
}
function commandIds(command: DiagramCommand): DiagramId[] {
  if (command.type === "reparentEntity") return [command.id, ...(command.parentId ? [command.parentId] : [])]
  if (command.type === "setTransformOrigin") return [command.id]
  if (command.type === "updateJunction") return [command.id]
  if (command.type === "createTable") return [command.table.id]
  if (command.type === "groupEntities") return [command.id, ...(command.ids ?? [])]
  if (command.type === "ungroupEntities") return [...command.ids, ...Object.keys(command.portRemaps ?? {})]
  if ("id" in command) return [command.id]
  if ("ids" in command) return [...(command.ids ?? [])]
  if (command.type === "createEdge") return [command.edge.id]
  if (command.type === "createNode") return [command.node.id]
  if (command.type === "createShape") return [command.shape.id]
  if (command.type === "createPath") return [command.path.id]
  if (command.type === "createPort") return [command.port.id, diagramPortHostId(command.port)]
  if (command.type === "createJunction") return [command.junction.id, command.junction.hostEdgeId]
  if (command.type === "updateEntities") return command.updates.map((update) => update.id)
  return []
}

function createDeleteSelectionPatch(state: InternalState): Patch | null {
  const candidates = state.selection.ids.filter((id) => hasEntity(state, id) && !isEntityNonDeletable(state, id) && !isEntityLockedOrReadOnly(state, id))
  const safe = candidates.filter((id) => {
    const group = state.entities.groupsById.get(id)
    const groupedIds = group ? groupMembers(state, id) : []
    if (group && groupedIds.some((childId) => isEntityNonDeletable(state, childId) || isEntityLockedOrReadOnly(state, childId))) return false
    const ownerGroup = [...state.entities.groupsById.values()].find((candidate) => candidate.childIds.includes(id))
    if (ownerGroup && groupMembers(state, ownerGroup.id).some((childId) => isEntityNonDeletable(state, childId) || isEntityLockedOrReadOnly(state, childId))) return false
    const hostIds = new Set([id, ...groupedIds])
    if ([...state.entities.portsById.values()].some((port) => hostIds.has(diagramPortHostId(port)) && (isEntityNonDeletable(state, port.id) || isEntityLockedOrReadOnly(state, port.id)))) return false
    const hostPortIds = new Set([...state.entities.portsById.values()].filter((port) => hostIds.has(diagramPortHostId(port))).map((port) => port.id))
    if ([...state.entities.edgesById.values()].some((edge) => (endpointDeleted(edge.source, hostIds) || endpointDeleted(edge.target, hostIds) || (edge.source.kind === "port" && hostPortIds.has(edge.source.portId)) || (edge.target.kind === "port" && hostPortIds.has(edge.target.portId))) && (isEntityNonDeletable(state, edge.id) || isEntityLockedOrReadOnly(state, edge.id)))) return false
    const hostJunctionIds = new Set([...state.entities.junctionsById.values()].filter((junction) => hostIds.has(junction.hostEdgeId)).map((junction) => junction.id))
    if ([...state.entities.edgesById.values()].some((edge) => (edge.source.kind === "junction" && hostJunctionIds.has(edge.source.junctionId) || edge.target.kind === "junction" && hostJunctionIds.has(edge.target.junctionId)) && (isEntityNonDeletable(state, edge.id) || isEntityLockedOrReadOnly(state, edge.id)))) return false
    if ([...hostJunctionIds].some((junctionId) => isEntityNonDeletable(state, junctionId) || isEntityLockedOrReadOnly(state, junctionId))) return false
    return true
  })
  const deleted = expandDeletedIds(state, safe)
  const deletedSet = new Set(deleted)
  if (wouldLeaveGroupPortWithoutBounds(state, deletedSet)) return null
  for (const id of deleted) {
    if ([...state.entities.portsById.values()].some((port) => diagramPortHostId(port) === id && !deletedSet.has(port.id))) return null
    if ([...state.entities.edgesById.values()].some((edge) => (endpointDeleted(edge.source, deletedSet) || endpointDeleted(edge.target, deletedSet)) && !deletedSet.has(edge.id))) return null
  }
  return deleted.length ? createDeleteEntitiesPatch(deleted) : null
}

function createDeleteEntitiesPatch(ids: ReadonlyArray<DiagramId>): Patch {
  let deleted: SerializedDiagramScene | null = null
  let deletedOrder: MutableOrder | null = null
  let deletedPortOrder: DiagramId[] | null = null
  let deletedPortOwners = new Map<DiagramId, import("./types.js").DiagramNode>()
  let detachedParents = new Map<DiagramId, DiagramGroup>()
  let adjustedGroupPorts = new Map<DiagramId, DiagramPort>()
  const patch: Patch = {
    orderChanged: true,
    apply: (next) => {
      const changed = new Set<DiagramId>()
      deletedOrder = cloneOrder(next.order)
      deletedPortOrder = [...next.entities.portsById.keys()]
      deletedPortOwners = new Map()
      detachedParents = new Map()
      const deleting = new Set(ids)
      const affectedParents = new Set<DiagramId>()
      for (const group of next.entities.groupsById.values()) {
        if (deleting.has(group.id) || !group.childIds.some((childId) => deleting.has(childId))) continue
        let parent: DiagramId | null = group.id
        while (parent && !affectedParents.has(parent)) {
          affectedParents.add(parent)
          parent = resolveDiagramParentId(parent, next.entities)
        }
      }
      const oldTransforms = new Map([...affectedParents].map((id) => [id, resolveLocalEntityTransform(id, next.entities)]))
      const groupPortWorlds = new Map<DiagramId, DiagramPoint>()
      for (const port of next.entities.portsById.values()) if (affectedParents.has(diagramPortHostId(port))) groupPortWorlds.set(port.id, resolvePortPoint(port, next.entities))
      for (const groupId of affectedParents) {
        const group = next.entities.groupsById.get(groupId)
        if (!group || deleting.has(groupId)) continue
        detachedParents.set(groupId, group)
        if (group.childIds.some((childId) => deleting.has(childId))) next.entities.groupsById.set(groupId, { ...group, childIds: group.childIds.filter((childId) => !deleting.has(childId)) })
      }
      const depth = (groupId: DiagramId) => {
        let result = 0, parent = resolveDiagramParentId(groupId, next.entities)
        const seen = new Set<DiagramId>()
        while (parent && !seen.has(parent)) { seen.add(parent); result += 1; parent = resolveDiagramParentId(parent, next.entities) }
        return result
      }
      for (const groupId of [...affectedParents].sort((a, b) => depth(b) - depth(a))) {
        const group = next.entities.groupsById.get(groupId)
        const desired = oldTransforms.get(groupId)
        if (!group || !desired || deleting.has(groupId)) continue
        next.entities.groupsById.set(groupId, { ...group, parentOffset: undefined })
        const base = resolveLocalEntityTransform(groupId, next.entities)
        next.entities.groupsById.set(groupId, { ...group, parentOffset: { x: desired.e - base.e, y: desired.f - base.f } })
        changed.add(groupId)
      }
      adjustedGroupPorts = new Map()
      for (const port of next.entities.portsById.values()) {
        const hostId = diagramPortHostId(port)
        const world = groupPortWorlds.get(port.id)
        if (!world || !affectedParents.has(hostId) || !("hostId" in port)) continue
        const hostedPort = port as Extract<DiagramPort, { hostId: DiagramId }>
        if (hostedPort.anchor.kind !== "local") continue
        const group = next.entities.groupsById.get(hostId)
        const bounds = group && unionDiagramRects(group.childIds.map((childId) => createLocalEntityGeometry(childId, next.entities)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect)))
        const inverseWorld = group ? invertDiagramAffine(resolveWorldEntityTransform(hostId, next.entities)) : null
        if (!bounds || !inverseWorld) continue
        adjustedGroupPorts.set(port.id, port)
        const local = transformDiagramPoint(inverseWorld, world)
        const adjusted: Extract<DiagramPort, { hostId: DiagramId }> = { ...hostedPort, anchor: { kind: "local", x: local.x - bounds.x, y: local.y - bounds.y } }
        next.entities.portsById.set(port.id, adjusted)
        changed.add(port.id)
      }
      for (const id of ids) {
        const port = next.entities.portsById.get(id)
        const owner = port && next.entities.nodesById.get(diagramPortHostId(port))
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
          junctionsById: pick(next.entities.junctionsById, ids),
          groupsById: pick(next.entities.groupsById, ids),
          tablesById: pick(next.entities.tablesById, ids),
        },
        order: {
          nodeIds: next.order.nodeIds.filter((id) => ids.includes(id)),
          edgeIds: next.order.edgeIds.filter((id) => ids.includes(id)),
          textIds: next.order.textIds.filter((id) => ids.includes(id)),
          shapeIds: next.order.shapeIds.filter((id) => ids.includes(id)),
          groupIds: next.order.groupIds.filter((id) => ids.includes(id)),
          tableIds: next.order.tableIds.filter((id) => ids.includes(id)),
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
        for (const [id, group] of detachedParents) {
          next.entities.groupsById.set(id, group)
          restored.add(id)
        }
        for (const [id, port] of adjustedGroupPorts) {
          next.entities.portsById.set(id, port)
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
        ...replacement.entities.junctionsById.keys(),
        ...replacement.order.groupIds,
        ...replacement.order.tableIds,
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
          ...replacement.entities.junctionsById.keys(),
          ...replacement.order.groupIds,
          ...replacement.order.tableIds,
        ])
      },
      inverse: undefined as unknown as Patch,
    },
  }
}

function expandDeletedIds(state: InternalState, ids: ReadonlyArray<DiagramId>): DiagramId[] {
  const deleted = new Set(ids.filter((id) => !isEntityNonDeletable(state, id) && !isEntityLockedOrReadOnly(state, id)))
  let changed = true
  while (changed) {
    changed = false
    for (const group of state.entities.groupsById.values()) {
      if (!deleted.has(group.id)) continue
      for (const id of group.childIds) {
        if (!deleted.has(id)) {
          deleted.add(id)
          changed = true
        }
      }
    }
    for (const id of [...deleted]) {
      for (const junction of state.entities.junctionsById.values()) {
        if (junction.hostEdgeId === id && !deleted.has(junction.id) && !isEntityNonDeletable(state, junction.id) && !isEntityLockedOrReadOnly(state, junction.id)) { deleted.add(junction.id); changed = true }
      }
      for (const port of state.entities.portsById.values()) {
        if (diagramPortHostId(port) === id && !deleted.has(port.id) && !isEntityNonDeletable(state, port.id) && !isEntityLockedOrReadOnly(state, port.id)) { deleted.add(port.id); changed = true }
      }
    }
    for (const edge of state.entities.edgesById.values()) {
      if (deleted.has(edge.id) || !(endpointDeleted(edge.source, deleted) || endpointDeleted(edge.target, deleted))) continue
      if (!isEntityNonDeletable(state, edge.id) && !isEntityLockedOrReadOnly(state, edge.id)) { deleted.add(edge.id); changed = true }
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
  return endpoint.kind === "port" ? deleted.has(endpoint.portId) : deleted.has(endpoint.junctionId)
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
      for (const step of steps) for (const id of step.apply(state)) changed.add(id)
      return changed
    },
    inverse: undefined as unknown as Patch,
    steps,
  }
}

function composeUndoablePatches(first: Patch, second: Patch): Patch {
  const combined = composePatches(first, second)
  const inverse = composePatches(second.inverse, first.inverse)
  combined.inverse = inverse
  inverse.inverse = combined
  return combined
}

function cloneOrder(order: MutableOrder): MutableOrder {
  return { nodeIds: [...order.nodeIds], edgeIds: [...order.edgeIds], textIds: [...order.textIds], shapeIds: [...order.shapeIds], groupIds: [...order.groupIds], tableIds: [...order.tableIds] }
}

function ordersEqual(a: MutableOrder, b: MutableOrder): boolean {
  return sameIds(a.nodeIds, b.nodeIds) && sameIds(a.edgeIds, b.edgeIds) && sameIds(a.textIds, b.textIds) && sameIds(a.shapeIds, b.shapeIds) && sameIds(a.groupIds, b.groupIds) && sameIds(a.tableIds, b.tableIds)
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
  const junction = state.entities.junctionsById.get(id)
  if (junction) state.entities.junctionsById.set(id, { ...junction, metadata })
  const group = state.entities.groupsById.get(id)
  if (group) state.entities.groupsById.set(id, { ...group, metadata })
  const table = state.entities.tablesById.get(id)
  if (table) state.entities.tablesById.set(id, { ...table, metadata })
}

function getEntityMetadata(state: InternalState, id: DiagramId): Readonly<Record<string, unknown>> | undefined {
  return state.entities.nodesById.get(id)?.metadata
    ?? state.entities.edgesById.get(id)?.metadata
    ?? state.entities.textsById.get(id)?.metadata
    ?? state.entities.shapesById.get(id)?.metadata
    ?? state.entities.portsById.get(id)?.metadata
    ?? state.entities.junctionsById.get(id)?.metadata
    ?? state.entities.groupsById.get(id)?.metadata
    ?? state.entities.tablesById.get(id)?.metadata
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
    ...state.entities.junctionsById.keys(),
    ...state.entities.groupsById.keys(),
    ...state.entities.tablesById.keys(),
  ]
}

function hasEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.edgesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id) || state.entities.portsById.has(id) || state.entities.junctionsById.has(id) || state.entities.groupsById.has(id) || state.entities.tablesById.has(id)
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
  for (const junction of scene.junctions ?? []) {
    state.entities.junctionsById.set(junction.id, junction)
    state.versions.set(junction.id, 0)
    changed.add(junction.id)
  }
  for (const group of scene.groups ?? []) {
    state.entities.groupsById.set(group.id, group)
    pushUnique(state.order.groupIds, group.id)
    state.versions.set(group.id, 0)
    changed.add(group.id)
  }
  for (const table of scene.tables ?? []) {
    state.entities.tablesById.set(table.id, table)
    pushUnique(state.order.tableIds, table.id)
    state.versions.set(table.id, 0)
    changed.add(table.id)
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
  deleted = state.entities.junctionsById.delete(id) || deleted
  deleted = state.entities.groupsById.delete(id) || deleted
  deleted = state.entities.tablesById.delete(id) || deleted
  state.order.nodeIds = state.order.nodeIds.filter((value) => value !== id)
  state.order.edgeIds = state.order.edgeIds.filter((value) => value !== id)
  state.order.textIds = state.order.textIds.filter((value) => value !== id)
  state.order.shapeIds = state.order.shapeIds.filter((value) => value !== id)
  state.order.groupIds = state.order.groupIds.filter((value) => value !== id)
  state.order.tableIds = state.order.tableIds.filter((value) => value !== id)
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
  if (geometry.pathContours?.length) {
    let inside = false
    let best = Number.POSITIVE_INFINITY
    for (const contour of geometry.pathContours) {
      const path = flattenPathContour(contour)
      if (contour.closed && pointInPolygon(point, path)) inside = !inside
      best = Math.min(best, distanceToPath(point, path))
    }
    if (inside) return 0
    return best <= radius ? best : null
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

function closestPointOnSegment(point: DiagramPoint, start: DiagramPoint, end: DiagramPoint): DiagramPoint {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return start
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return { x: start.x + t * dx, y: start.y + t * dy }
}

function midpoint(a: DiagramPoint, b: DiagramPoint): DiagramPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function segmentIntersection(a: DiagramPoint, b: DiagramPoint, c: DiagramPoint, d: DiagramPoint): DiagramPoint | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const denominator = rx * sy - ry * sx
  if (Math.abs(denominator) < 1e-10) return null
  const qpx = c.x - a.x
  const qpy = c.y - a.y
  const t = (qpx * sy - qpy * sx) / denominator
  const u = (qpx * ry - qpy * rx) / denominator
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * rx, y: a.y + t * ry } : null
}

function constrainAngleFromOrigin(point: DiagramPoint, origin: DiagramPoint, increment: number, additionalAngles: ReadonlyArray<number> = []): DiagramPoint {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const radius = Math.hypot(dx, dy)
  if (radius === 0) return point
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const candidates = [...(Number.isFinite(increment) && increment > 0 && increment < 360 ? [Math.round(angle / increment) * increment] : []), ...additionalAngles.filter(Number.isFinite)]
  if (!candidates.length) return point
  let bestAngle = candidates[0]!
  const difference = (value: number) => Math.abs(((value - angle + 540) % 360) - 180)
  for (const candidate of candidates.slice(1)) if (difference(candidate) < difference(bestAngle)) bestAngle = candidate
  const radians = bestAngle * Math.PI / 180
  return { x: origin.x + Math.cos(radians) * radius, y: origin.y + Math.sin(radians) * radius }
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

function constrainSnapPoint(point: DiagramPoint, origin: DiagramPoint, axisConstraint?: "x" | "y"): DiagramPoint {
  if (axisConstraint === "x") return { x: point.x, y: origin.y }
  if (axisConstraint === "y") return { x: origin.x, y: point.y }
  return point
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
