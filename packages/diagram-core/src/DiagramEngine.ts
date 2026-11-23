import { createEntityGeometry, distance, inflateRect, rectContainsPoint, rectIntersects, rotatePoint } from "./geometry.js"
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
  DiagramNode,
  DiagramText,
  DiagramShape,
  DiagramFlipAxis,
  DiagramGroup,
  DiagramTable,
  DiagramTableCell,
  DiagramTableStyle,
  DiagramTableStyleUpdate,
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
      return { point: constrainSnapPoint(custom, point, context.axisConstraint), snapped: true, source: "custom" }
    }
    const port = context.snapToPorts === false ? null : this.nearestPort(point, context.radius ?? 12, context.excludeIds ?? new Set())
    if (port) {
      const geometry = this.getGeometry(port.id)
      if (geometry?.point) {
        return { point: constrainSnapPoint(geometry.point, point, context.axisConstraint), snapped: true, source: "port" }
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
      return {
        point: {
          x: context.axisConstraint === "y" ? point.x : Math.round(point.x / context.gridSize) * context.gridSize,
          y: context.axisConstraint === "x" ? point.y : Math.round(point.y / context.gridSize) * context.gridSize,
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
    const proposed = context.axisConstraint === "x"
      ? { x: origin.x + delta.x, y: origin.y }
      : context.axisConstraint === "y"
        ? { x: origin.x, y: origin.y + delta.y }
        : { x: origin.x + delta.x, y: origin.y + delta.y }
    const guides: DiagramSnapGuide[] = []
    let point = proposed
    let source: DiagramSnapResult["source"] = null
    let prioritySnap = false
    const portSnap = context.snapToPorts === false && !context.custom
      ? { point, snapped: false, source: null as DiagramSnapResult["source"] }
      : this.snapPoint(point, { ...context, gridSize: undefined, radius, excludeIds, snapToAlignment: false })
    if (portSnap.source === "port" || portSnap.source === "custom") {
      point = constrainSnapPoint(portSnap.point, origin, context.axisConstraint)
      source = portSnap.source
      prioritySnap = true
    }
    if (!prioritySnap && context.snapToAlignment !== false && geometry) {
      const aligned = this.findTranslationAlignment(geometry.bounds, point, radius, excludeIds, context.axisConstraint)
      if (aligned) {
        point = { x: point.x + aligned.dx, y: point.y + aligned.dy }
        guides.push(...aligned.guides)
        source ??= "alignment"
      }
    }
    if (!prioritySnap && context.snapToEqualSpacing && geometry) {
      const alignedAxes = new Set(guides.filter((guide) => guide.kind === "alignment").map((guide) => guide.axis))
      if (context.axisConstraint === "x") alignedAxes.add("y")
      if (context.axisConstraint === "y") alignedAxes.add("x")
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
      if (group) return group.childIds.length > 0 && group.childIds.every((childId) => this.isEntityResizable(childId) && !this.isEntityLockedOrReadOnly(childId))
      return this.isEntityResizable(id) && !this.isEntityLockedOrReadOnly(id)
    })
  }

  canRotate(ids: ReadonlyArray<DiagramId> = this.state.selection.ids): boolean {
    return ids.some((id) => {
      if (this.isEntityLockedOrReadOnly(id)) return false
      if (this.state.entities.groupsById.has(id)) return isGroupRotatable(this.state, id)
      return this.state.entities.nodesById.has(id) || this.state.entities.shapesById.has(id) || this.state.entities.textsById.has(id) || this.state.entities.tablesById.has(id)
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
      content: { nodes: scene.nodes, edges: scene.edges, texts: scene.texts, shapes: scene.shapes, ports: scene.ports, groups: scene.groups ?? [], tables: scene.tables ?? [] },
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
      for (const group of this.state.entities.groupsById.values()) {
        if (group.childIds.includes(id)) invalidated.add(group.id)
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
      ...this.state.order.groupIds,
      ...this.state.order.tableIds,
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
      case "createTable":
        return createCreateTablePatch(this.state, command.table)
      case "insertTableRow":
        return createTableStructurePatch(this.state, command.id, "row", command.index, "insert", command.cells)
      case "deleteTableRow":
        return createTableStructurePatch(this.state, command.id, "row", command.index, "delete")
      case "insertTableColumn":
        return createTableStructurePatch(this.state, command.id, "column", command.index, "insert", command.cells)
      case "deleteTableColumn":
        return createTableStructurePatch(this.state, command.id, "column", command.index, "delete")
      case "resizeTableRow":
        return createResizeTableAxisPatch(this.state, command.id, "row", command.index, command.height)
      case "resizeTableColumn":
        return createResizeTableAxisPatch(this.state, command.id, "column", command.index, command.width)
      case "updateTableCell":
        return createUpdateTableCellPatch(this.state, command.id, command.row, command.column, command.cell)
      case "updateTableStyle":
        return createUpdateTableStylePatch(this.state, command.id, command.style)
      case "groupEntities":
        return createGroupEntitiesPatch(this.state, command.id, command.ids ?? this.state.selection.ids)
      case "ungroupEntities":
        return createUngroupEntitiesPatch(this.state, command.ids)
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
    const searchBounds = inflateRect(moving, radius)
    for (const fixedId of this.queryEntities({ bounds: searchBounds, kinds: ["node", "shape", "text"] })) {
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
    edges: scene.order.edgeIds.map((id) => scene.entities.edgesById.get(id)).filter(isDefined),
    texts: scene.order.textIds.map((id) => scene.entities.textsById.get(id)).filter(isDefined),
    shapes: scene.order.shapeIds.map((id) => scene.entities.shapesById.get(id)).filter(isDefined),
    ports: [...scene.entities.portsById.values()],
    groups: scene.order.groupIds.map((id) => scene.entities.groupsById.get(id)).filter(isDefined),
    tables: scene.order.tableIds.map((id) => scene.entities.tablesById.get(id)).filter(isDefined),
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
    if (input.format !== "affino-diagram" || input.version !== 1 || !input.content || ![input.content.nodes, input.content.edges, input.content.texts, input.content.shapes, input.content.ports].every(Array.isArray) || (input.content.groups !== undefined && !Array.isArray(input.content.groups)) || (input.content.tables !== undefined && !Array.isArray(input.content.tables))) {
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
}

function normalizeTable(table: DiagramTable): DiagramTable {
  const defaultCell = normalizeTableCell(table.defaultCell ?? { text: "" })
  const cells = Array.from({ length: table.rowCount }, (_, row) => Array.from({ length: table.columnCount }, (_, column) => normalizeTableCell(table.cells?.[row]?.[column] ?? defaultCell)))
  const rowHeights = table.rowHeights ? [...table.rowHeights] : Array(table.rowCount).fill(table.height / table.rowCount) as number[]
  const columnWidths = table.columnWidths ? [...table.columnWidths] : Array(table.columnCount).fill(table.width / table.columnCount) as number[]
  return { ...table, cells, rowHeights, columnWidths, defaultCell, style: normalizeTableStyle(table.style) }
}

function normalizeTableCell(cell: DiagramTableCell): DiagramTableCell { return { text: cell.text, ...(cell.horizontalAlign ? { horizontalAlign: cell.horizontalAlign } : {}), ...(cell.verticalAlign ? { verticalAlign: cell.verticalAlign } : {}) } }
function normalizeTableStyle(style?: DiagramTableStyle): DiagramTableStyle {
  return {
    grid: { ...DEFAULT_TABLE_STYLE.grid, ...style?.grid, stroke: { ...DEFAULT_TABLE_STYLE.grid.stroke, ...style?.grid?.stroke } },
    border: { ...DEFAULT_TABLE_STYLE.border, ...style?.border, stroke: { ...DEFAULT_TABLE_STYLE.border.stroke, ...style?.border?.stroke } },
    cellPadding: style?.cellPadding ?? DEFAULT_TABLE_STYLE.cellPadding,
  }
}

function validateDiagramTable(source: DiagramTable): void {
  if (!source || source.kind !== "table" || ![source.x, source.y, source.width, source.height, source.rotation ?? 0].every(Number.isFinite) || source.width <= 0 || source.height <= 0 || !validFlipFlags(source)) throw new TypeError(`Invalid geometry for table ${source?.id ?? ""}`)
  if (!Number.isInteger(source.rowCount) || source.rowCount < 1 || !Number.isInteger(source.columnCount) || source.columnCount < 1) throw new TypeError(`Invalid dimensions for table ${source.id}: at least one row and column are required`)
  if (source.cells !== undefined && (!Array.isArray(source.cells) || source.cells.length !== source.rowCount || source.cells.some((row) => !Array.isArray(row) || row.length !== source.columnCount))) throw new TypeError(`Invalid cell matrix for table ${source.id}`)
  for (const row of source.cells ?? []) for (const cell of row) validateTableCell(cell, source.id)
  if (source.defaultCell) validateTableCell(source.defaultCell, source.id)
  if (source.rowHeights && (!validSizes(source.rowHeights, source.rowCount) || !sizesMatch(source.rowHeights, source.height))) throw new TypeError(`Invalid row heights for table ${source.id}`)
  if (source.columnWidths && (!validSizes(source.columnWidths, source.columnCount) || !sizesMatch(source.columnWidths, source.width))) throw new TypeError(`Invalid column widths for table ${source.id}`)
  if (source.style && !validTableStyleShape(source.style)) throw new TypeError(`Invalid style for table ${source.id}`)
  validateDiagramTableStyle(normalizeTableStyle(source.style), source.id)
}

function validFlipFlags(entity: { flipX?: unknown; flipY?: unknown }): boolean {
  return (entity.flipX === undefined || typeof entity.flipX === "boolean")
    && (entity.flipY === undefined || typeof entity.flipY === "boolean")
}

function validateTableCell(cell: DiagramTableCell, id: DiagramId): void {
  if (!cell || Object.keys(cell).some((key) => !["text", "horizontalAlign", "verticalAlign"].includes(key)) || typeof cell.text !== "string" || (cell.horizontalAlign !== undefined && !["left", "center", "right"].includes(cell.horizontalAlign)) || (cell.verticalAlign !== undefined && !["top", "middle", "bottom"].includes(cell.verticalAlign))) throw new TypeError(`Invalid cell in table ${id}`)
}
function validTableStyleShape(style: unknown): style is DiagramTableStyle {
  if (!style || typeof style !== "object") return false
  const value = style as Record<string, unknown>
  const grid = value.grid as Record<string, unknown> | undefined
  const border = value.border as Record<string, unknown> | undefined
  const validStrokeShape = (stroke: unknown) => Boolean(stroke && typeof stroke === "object" && Object.keys(stroke).every((key) => ["color", "width", "style"].includes(key)))
  return Object.keys(value).every((key) => ["grid", "border", "cellPadding"].includes(key))
    && Boolean(grid && Object.keys(grid).every((key) => ["visible", "stroke"].includes(key)) && (grid.stroke === undefined || validStrokeShape(grid.stroke)))
    && Boolean(border && Object.keys(border).every((key) => ["visible", "stroke", "radius"].includes(key)) && (border.stroke === undefined || validStrokeShape(border.stroke)))
}
function validateDiagramTableStyle(style: DiagramTableStyle, id: DiagramId): void {
  const validStroke = (stroke: DiagramTableStyle["grid"]["stroke"]) => typeof stroke.color === "string" && stroke.color.trim().length > 0 && Number.isFinite(stroke.width) && stroke.width >= 0 && ["solid", "dashed", "dotted"].includes(stroke.style)
  if (typeof style.grid.visible !== "boolean" || typeof style.border.visible !== "boolean" || !validStroke(style.grid.stroke) || !validStroke(style.border.stroke) || !Number.isFinite(style.border.radius) || style.border.radius < 0 || !Number.isFinite(style.cellPadding ?? NaN) || (style.cellPadding ?? -1) < 0) throw new TypeError(`Invalid style for table ${id}`)
}
function validSizes(values: ReadonlyArray<number>, expectedLength: number): boolean { return values.length === expectedLength && values.every((value) => Number.isFinite(value) && value > 0) }
function sizesMatch(values: ReadonlyArray<number>, total: number): boolean { return Math.abs(values.reduce((sum, value) => sum + value, 0) - total) <= Math.max(0.01, total * 1e-6) }

function validateSceneInput(scene: DiagramSceneInput): DiagramSceneInput {
  const nodesInput = scene.nodes ?? []
  const edgesInput = scene.edges ?? []
  const textsInput = scene.texts ?? []
  const shapesInput = scene.shapes ?? []
  const portsInput = scene.ports ?? []
  const groupsInput = scene.groups ?? []
  const tablesInput = scene.tables ?? []
  if (![nodesInput, edgesInput, textsInput, shapesInput, portsInput, groupsInput, tablesInput].every(Array.isArray)) throw new TypeError("Invalid diagram scene collections")
  const ids = new Set<string>()
  for (const entity of [...nodesInput, ...edgesInput, ...textsInput, ...shapesInput, ...portsInput, ...groupsInput, ...tablesInput]) {
    if (!entity || typeof entity.id !== "string" || !entity.id || ids.has(entity.id)) throw new TypeError("Diagram entity IDs must be non-empty and globally unique")
    ids.add(entity.id)
  }
  const nodes = new Set(nodesInput.map((node) => node.id))
  const ports = new Map(portsInput.map((port) => [port.id, port]))
  for (const node of nodesInput) if (![node.x, node.y, node.width, node.height, node.rotation ?? 0].every(Number.isFinite) || node.width < 0 || node.height < 0 || !validFlipFlags(node)) throw new TypeError(`Invalid geometry for node ${node.id}`)
  for (const port of portsInput) if (!nodes.has(port.nodeId) || ![port.x, port.y, port.radius ?? 0].every(Number.isFinite)) throw new TypeError(`Invalid port ${port.id}`)
  for (const node of nodesInput) if ((node.portIds ?? []).some((id) => ports.get(id)?.nodeId !== node.id)) throw new TypeError(`Invalid port reference on node ${node.id}`)
  for (const text of textsInput) if (![text.x, text.y, text.width ?? 0, text.height ?? 0, text.fontSize ?? 0, text.rotation ?? 0].every(Number.isFinite) || !validFlipFlags(text)) throw new TypeError(`Invalid geometry for text ${text.id}`)
  for (const shape of shapesInput) if (![shape.x, shape.y, shape.width, shape.height, shape.rotation ?? 0].every(Number.isFinite) || shape.width < 0 || shape.height < 0 || !validFlipFlags(shape)) throw new TypeError(`Invalid geometry for shape ${shape.id}`)
  for (const table of tablesInput) validateDiagramTable(table)
  for (const edge of edgesInput) {
    const validEndpoint = (endpoint: DiagramEdgeEndpoint) => endpoint.kind === "point" ? Number.isFinite(endpoint.point.x) && Number.isFinite(endpoint.point.y) : endpoint.kind === "node" ? nodes.has(endpoint.nodeId) : endpoint.kind === "port" && ports.has(endpoint.portId)
    if (!validEndpoint(edge.source) || !validEndpoint(edge.target) || !(edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) throw new TypeError(`Invalid edge ${edge.id}`)
  }
  const groupedChildren = new Set<DiagramId>()
  const groupable = new Set<DiagramId>([...nodesInput, ...edgesInput, ...textsInput, ...shapesInput, ...tablesInput].map((entity) => entity.id))
  for (const group of groupsInput) {
    if (group.kind !== "group" || !Array.isArray(group.childIds) || group.childIds.length < 2 || new Set(group.childIds).size !== group.childIds.length || !Number.isFinite(group.rotation ?? 0)) throw new TypeError(`Invalid group ${group.id}: groups require at least two unique, non-nested children and finite rotation`)
    for (const childId of group.childIds) {
      if (!groupable.has(childId) || groupedChildren.has(childId)) throw new TypeError(`Invalid group ${group.id}: nested, port, unknown, or already grouped child ${childId}`)
      groupedChildren.add(childId)
    }
  }
  if (scene.viewport && (![scene.viewport.x, scene.viewport.y, scene.viewport.width, scene.viewport.height, scene.viewport.zoom].filter((value) => value !== undefined).every(Number.isFinite) || (scene.viewport.zoom !== undefined && scene.viewport.zoom <= 0))) throw new TypeError("Invalid diagram viewport")
  const selectionIds = scene.selection?.ids ?? []
  if (selectionIds.some((id) => !ids.has(id))) throw new TypeError("Diagram selection contains an unknown entity")
  return { ...scene, nodes: nodesInput, edges: edgesInput, texts: textsInput, shapes: shapesInput, ports: portsInput, groups: groupsInput, tables: tablesInput.map(normalizeTable) }
}

function createMovePatch(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch | null {
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  const groupIds = ids.filter((id) => state.entities.groupsById.has(id))
  const expandedIds = [
    ...ids.filter((id) => !state.entities.groupsById.has(id)),
    ...groupIds.filter((id) => !isEntityLockedOrReadOnly(state, id) && isGroupMovable(state, id)).flatMap((id) => groupMembers(state, id)),
  ]
  const movableIds = [...new Set(expandedIds)].filter((id) => !isEntityLockedOrReadOnly(state, id) && (
    state.entities.nodesById.has(id)
    || isEdgeTranslatable(state.entities.edgesById.get(id))
    || state.entities.textsById.has(id)
    || state.entities.shapesById.has(id)
    || state.entities.tablesById.has(id)
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
      continue
    }
    const table = state.entities.tablesById.get(id)
    if (table) {
      state.entities.tablesById.set(id, { ...table, x: table.x + delta.x, y: table.y + delta.y })
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
  const groupEntries = entries.filter((entry) => state.entities.groupsById.has(entry.id))
  if (!groupEntries.length) return createResizePatchForEntities(state, entries)
  if (groupEntries.some((entry) => {
    const group = state.entities.groupsById.get(entry.id)!
    return isEntityLockedOrReadOnly(state, entry.id)
      || group.childIds.some((id) => isEntityLockedOrReadOnly(state, id) || !isGroupResizableEntity(state, id))
  })) return null

  const groupedChildren = new Set(groupEntries.flatMap((entry) => groupMembers(state, entry.id)))
  const regularPatch = createResizePatchForEntities(state, entries.filter((entry) => !state.entities.groupsById.has(entry.id) && !groupedChildren.has(entry.id)))
  const rectEntries: DiagramResizeEntry[] = []
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
    for (const id of groupMembers(state, entry.id)) {
      const edge = state.entities.edgesById.get(id)
      if (edge) {
        const nextEdge: DiagramEdge = {
          ...edge,
          source: edge.source.kind === "point" ? { kind: "point", point: transform(edge.source.point) } : edge.source,
          target: edge.target.kind === "point" ? { kind: "point", point: transform(edge.target.point) } : edge.target,
          points: edge.points?.map(transform),
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
  const childRectPatch = createResizePatchForEntities(state, rectEntries)
  const changedEdges = [...nextEdges].filter(([id, next]) => !diagramEdgesEqual(previousEdges.get(id)!, next))
  const edgePatch = changedEdges.length ? createEntitySnapshotPatch(
    changedEdges.map(([id]) => id),
    previousEdges,
    new Map(changedEdges),
    (next, id, value) => next.entities.edgesById.set(id, value as DiagramEdge),
  ) : null
  const groupPatch = [childRectPatch, edgePatch].filter((patch): patch is Patch => patch !== null).reduce<Patch | null>((current, patch) => current ? composePatches(current, patch) : patch, null)
  return [regularPatch, groupPatch].filter((patch): patch is Patch => patch !== null).reduce<Patch | null>((current, patch) => current ? composePatches(current, patch) : patch, null)
}

function createResizePatchForEntities(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>): Patch | null {
  const tableEntries = entries.filter((entry) => state.entities.tablesById.has(entry.id))
  const otherEntries = entries.filter((entry) => !state.entities.tablesById.has(entry.id))
  const patches: Patch[] = []
  const otherPatch = createResizePatchForNonTableEntities(state, otherEntries)
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
  }
  if (next.size) patches.push(createEntitySnapshotPatch([...next.keys()], previous, next, (draft, id, value) => draft.entities.tablesById.set(id, value as DiagramTable)))
  return patches.reduce<Patch | null>((current, patch) => current ? composePatches(current, patch) : patch, null)
}

function createResizePatchForNonTableEntities(state: InternalState, entries: ReadonlyArray<DiagramResizeEntry>): Patch | null {
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
  const previous = new Map<DiagramId, DiagramRotationSnapshot>()
  const next = new Map<DiagramId, DiagramRotationSnapshot>()
  const groupChildren = new Set<DiagramId>()
  for (const entry of entries) {
    const group = state.entities.groupsById.get(entry.id)
    if (!group || !Number.isFinite(entry.rotation) || !isGroupRotatable(state, entry.id)) continue
    const targetRotation = normalizeRotation(entry.rotation)
    const delta = normalizeRotation(targetRotation - (group.rotation ?? 0))
    if (delta === 0) continue
    const groupGeometry = createEntityGeometry(group.id, snapshotEntities(state))
    if (!groupGeometry) continue
    const center = { x: groupGeometry.bounds.x + groupGeometry.bounds.width / 2, y: groupGeometry.bounds.y + groupGeometry.bounds.height / 2 }
    previous.set(group.id, group)
    next.set(group.id, { ...group, rotation: targetRotation })
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
  for (const entry of entries) {
    if (groupChildren.has(entry.id) || state.entities.groupsById.has(entry.id) || !Number.isFinite(entry.rotation) || isEntityLockedOrReadOnly(state, entry.id)) continue
    const entity = getDiagramRotationSnapshot(state, entry.id)
    if (!entity || entity.kind === "edge" || entity.kind === "group") continue
    const rotation = normalizeRotation(entry.rotation)
    if ((entity.rotation ?? 0) === rotation) continue
    previous.set(entry.id, { ...entity, rotation: entity.rotation ?? 0 })
    next.set(entry.id, { ...entity, rotation })
  }
  if (!next.size) return null
  return createRotatePatchUnchecked([...next.values()], [...previous.values()])
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

function rotateGroupChild(entity: DiagramRotationSnapshot, geometry: DiagramGeometry, center: DiagramPoint, delta: number): DiagramRotationSnapshot | null {
  if (entity.kind === "edge") {
    const hasPointGeometry = entity.source.kind === "point" || entity.target.kind === "point" || Boolean(entity.points?.length)
    if (!hasPointGeometry) return null
    const rotate = (point: DiagramPoint) => cleanRotatedPoint(rotatePoint(point, center, delta))
    const endpoint = (value: DiagramEdgeEndpoint): DiagramEdgeEndpoint => value.kind === "point" ? { kind: "point", point: rotate(value.point) } : value
    return { ...entity, source: endpoint(entity.source), target: endpoint(entity.target), points: entity.points?.map(rotate) }
  }
  if (entity.kind === "group") return null
  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const currentCenter = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const nextCenter = cleanRotatedPoint(rotatePoint(currentCenter, center, delta))
  const x = cleanRotatedValue(nextCenter.x - bounds.width / 2)
  const y = cleanRotatedValue(nextCenter.y - bounds.height / 2)
  const rotation = normalizeRotation((entity.rotation ?? 0) + delta)
  return { ...entity, x, y, rotation }
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
    groupsById: state.entities.groupsById,
    tablesById: state.entities.tablesById,
  }
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function createFlipPatch(state: InternalState, requestedIds: ReadonlyArray<DiagramId>, axis: DiagramFlipAxis): Patch | null {
  if (axis !== "horizontal" && axis !== "vertical") return null
  const expanded = new Set<DiagramId>()
  for (const id of requestedIds) {
    const group = state.entities.groupsById.get(id)
    if (group) {
      if (isEntityLockedOrReadOnly(state, id)) continue
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
  if (!geometries.length) return null
  const bounds = unionDiagramRects(geometries.map((geometry) => geometry.bounds))
  if (!bounds) return null
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const previous = candidates.map((id) => getDiagramFlipSnapshot(state, id)).filter((entity): entity is DiagramFlipSnapshot => entity !== null)
  const next = previous.map((entity) => reflectDiagramEntity(entity, createEntityGeometry(entity.id, entities)!, center, axis))
  return createFlipPatchUnchecked(next, previous)
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
  return { ...entity, x, y, flipX, flipY }
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

function createTableSnapshotPatch(id: DiagramId, previous: DiagramTable, next: DiagramTable, orderChanged = false): Patch | null {
  if (JSON.stringify(previous) === JSON.stringify(next)) return null
  const apply = (value: DiagramTable): Patch["apply"] => (state) => { state.entities.tablesById.set(id, value); return new Set([id]) }
  return { orderChanged, apply: apply(next), inverse: { orderChanged, apply: apply(previous), inverse: undefined as unknown as Patch } }
}

function createCreateTablePatch(state: InternalState, input: DiagramTable): Patch | null {
  let table: DiagramTable
  try { validateDiagramTable(input); table = normalizeTable(input) } catch { return null }
  if (!isUniqueId(state, table.id)) return null
  return {
    orderChanged: true,
    apply: (next) => { next.entities.tablesById.set(table.id, table); next.order.tableIds.push(table.id); next.versions.set(table.id, 0); return new Set([table.id]) },
    inverse: createDeleteEntitiesPatch([table.id]),
  }
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
      rows.splice(index, 0, cells.map(normalizeTableCell))
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
      rows.forEach((row, rowIndex) => row.splice(index, 0, normalizeTableCell(cells[rowIndex]!)))
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
  return createTableSnapshotPatch(id, table, { ...table, rowCount, columnCount, cells: rows, rowHeights, columnWidths })
}

function isValidCell(cell: DiagramTableCell): boolean {
  return Boolean(cell && Object.keys(cell).every((key) => ["text", "horizontalAlign", "verticalAlign"].includes(key)) && typeof cell.text === "string" && (cell.horizontalAlign === undefined || ["left", "center", "right"].includes(cell.horizontalAlign)) && (cell.verticalAlign === undefined || ["top", "middle", "bottom"].includes(cell.verticalAlign)))
}

function createUpdateTableCellPatch(state: InternalState, id: DiagramId, row: number, column: number, update: Partial<DiagramTableCell>): Patch | null {
  const table = state.entities.tablesById.get(id)
  if (!table || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= table.rowCount || column < 0 || column >= table.columnCount) return null
  if (Object.keys(update).some((key) => !["text", "horizontalAlign", "verticalAlign"].includes(key))) return null
  const cells = table.cells!.map((line) => [...line])
  const previous = cells[row]![column]!
  const nextCell = { ...previous, ...update }
  if (!isValidCell(nextCell)) return null
  cells[row]![column] = nextCell
  return createTableSnapshotPatch(id, table, { ...table, cells })
}

function createResizeTableAxisPatch(state: InternalState, id: DiagramId, axis: "row" | "column", index: number, size: number): Patch | null {
  const table = state.entities.tablesById.get(id)
  const count = axis === "row" ? table?.rowCount : table?.columnCount
  if (!table || isEntityLockedOrReadOnly(state, id) || !Number.isInteger(index) || index < 0 || index >= count! || !Number.isFinite(size) || size <= 0) return null
  if (axis === "row") {
    const rowHeights = [...table.rowHeights!]
    rowHeights[index] = size
    return createTableSnapshotPatch(id, table, { ...table, rowHeights, height: rowHeights.reduce((sum, value) => sum + value, 0) })
  }
  const columnWidths = [...table.columnWidths!]
  columnWidths[index] = size
  return createTableSnapshotPatch(id, table, { ...table, columnWidths, width: columnWidths.reduce((sum, value) => sum + value, 0) })
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
  })
  try { validateDiagramTableStyle(style, id) } catch { return null }
  return createTableSnapshotPatch(id, table, { ...table, style })
}

function validTableStyleUpdateShape(update: unknown): update is DiagramTableStyleUpdate {
  if (!update || typeof update !== "object") return false
  const value = update as Record<string, unknown>
  const grid = value.grid as Record<string, unknown> | undefined
  const border = value.border as Record<string, unknown> | undefined
  const validStroke = (stroke: unknown) => Boolean(stroke && typeof stroke === "object" && Object.keys(stroke).every((key) => ["color", "width", "style"].includes(key)))
  return Object.keys(value).every((key) => ["grid", "border", "cellPadding"].includes(key))
    && (value.grid === undefined || Boolean(grid && Object.keys(grid).every((key) => ["visible", "stroke"].includes(key)) && (grid.stroke === undefined || validStroke(grid.stroke))))
    && (value.border === undefined || Boolean(border && Object.keys(border).every((key) => ["visible", "stroke", "radius"].includes(key)) && (border.stroke === undefined || validStroke(border.stroke))))
}

function resizeTable(table: DiagramTable, entry: DiagramResizeEntry): DiagramTable {
  const width = entry.width ?? table.width
  const height = entry.height ?? table.height
  const sx = width / table.width
  const sy = height / table.height
  return { ...table, x: entry.x ?? table.x, y: entry.y ?? table.y, width, height, columnWidths: table.columnWidths!.map((size) => size * sx), rowHeights: table.rowHeights!.map((size) => size * sy) }
}

function createGroupEntitiesPatch(state: InternalState, id: DiagramId, ids: ReadonlyArray<DiagramId>): Patch | null {
  const childIds = [...ids]
  if (!isUniqueId(state, id) || childIds.length < 2 || new Set(childIds).size !== childIds.length) return null
  const groupableIds = new Set<DiagramId>([
    ...state.entities.nodesById.keys(),
    ...state.entities.edgesById.keys(),
    ...state.entities.textsById.keys(),
    ...state.entities.shapesById.keys(),
    ...state.entities.tablesById.keys(),
  ])
  const alreadyGrouped = new Set([...state.entities.groupsById.values()].flatMap((group) => group.childIds))
  if (childIds.some((childId) => !groupableIds.has(childId) || alreadyGrouped.has(childId))) return null

  const group: DiagramGroup = { id, kind: "group", childIds }
  const previousSelection = state.selection
  const nextSelection: DiagramSelection = { ids: [id], primaryId: id }
  return {
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
}

function createUngroupEntitiesPatch(state: InternalState, ids: ReadonlyArray<DiagramId>): Patch | null {
  const groupIds = [...new Set(ids)]
  if (!groupIds.length || groupIds.some((id) => !state.entities.groupsById.has(id) || isEntityLockedOrReadOnly(state, id))) return null
  const groups = groupIds.map((id) => state.entities.groupsById.get(id)!)
  const previousSelection = state.selection
  const childIds = [...new Set(groups.flatMap((group) => group.childIds))]
  const nextSelection: DiagramSelection = { ids: childIds, primaryId: childIds[0] ?? null }
  const positions = new Map(groupIds.map((id) => [id, state.order.groupIds.indexOf(id)]))
  return {
    orderChanged: true,
    apply: (next) => {
      for (const id of groupIds) next.entities.groupsById.delete(id)
      next.order.groupIds = next.order.groupIds.filter((id) => !groupIds.includes(id))
      for (const id of groupIds) next.versions.delete(id)
      next.selection = nextSelection
      return new Set([...groupIds, "selection"])
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
        next.selection = previousSelection
        return new Set([...groupIds, "selection"])
      },
      inverse: undefined as unknown as Patch,
    },
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
function groupMembers(state: InternalState, id: DiagramId): ReadonlyArray<DiagramId> { return state.entities.groupsById.get(id)?.childIds ?? [] }
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
  return children.length > 0
    && children.every((childId) => !isEntityLockedOrReadOnly(state, childId) && (isEntityTranslatable(state.entities, childId) || state.entities.edgesById.has(childId)))
    && children.some((childId) => isEntityTranslatable(state.entities, childId))
}
function isGroupRotatable(state: InternalState, id: DiagramId): boolean {
  const children = groupMembers(state, id)
  const supported = (childId: DiagramId) => state.entities.nodesById.has(childId)
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
  const port = state.entities.portsById.get(endpoint.portId)
  return Boolean(port && state.entities.nodesById.has(port.nodeId))
}
function isValidEdge(state: InternalState, edge: DiagramEdge): boolean {
  return isValidEndpoint(state, edge.source) && isValidEndpoint(state, edge.target) && (edge.points ?? []).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}
function commandIds(command: DiagramCommand): DiagramId[] {
  if (command.type === "createTable") return [command.table.id]
  if (command.type === "groupEntities") return [command.id, ...(command.ids ?? [])]
  if (command.type === "ungroupEntities") return [...command.ids]
  if ("id" in command) return [command.id]
  if ("ids" in command) return [...(command.ids ?? [])]
  if (command.type === "createEdge") return [command.edge.id]
  if (command.type === "createNode") return [command.node.id]
  if (command.type === "createPort") return [command.port.id, command.port.nodeId]
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
    const nodeIds = new Set([id, ...groupedIds].filter((nodeId) => state.entities.nodesById.has(nodeId)))
    if (nodeIds.size) {
      if ([...state.entities.portsById.values()].some((port) => nodeIds.has(port.nodeId) && (isEntityNonDeletable(state, port.id) || isEntityLockedOrReadOnly(state, port.id)))) return false
      if ([...state.entities.edgesById.values()].some((edge) => (endpointDeleted(edge.source, nodeIds) || endpointDeleted(edge.target, nodeIds)) && (isEntityNonDeletable(state, edge.id) || isEntityLockedOrReadOnly(state, edge.id)))) return false
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
  let groupsChanged = true
  while (groupsChanged) {
    groupsChanged = false
    for (const group of state.entities.groupsById.values()) {
      if (!deleted.has(group.id) && !group.childIds.some((childId) => deleted.has(childId))) continue
      for (const id of [group.id, ...group.childIds]) {
        if (!deleted.has(id)) {
          deleted.add(id)
          groupsChanged = true
        }
      }
    }
  }
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
    ...state.entities.groupsById.keys(),
    ...state.entities.tablesById.keys(),
  ]
}

function hasEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.edgesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id) || state.entities.portsById.has(id) || state.entities.groupsById.has(id) || state.entities.tablesById.has(id)
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
