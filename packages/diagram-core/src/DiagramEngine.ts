import { createEntityGeometry, distance, rectContainsPoint, rectIntersects } from "./geometry.js"
import { UniformGridIndex } from "./spatialIndex.js"
import type {
  DiagramChange,
  DiagramCommand,
  DiagramCommandResult,
  DiagramEdge,
  DiagramEdgeEndpoint,
  DiagramEntityKind,
  DiagramGeometry,
  DiagramHit,
  DiagramHitTestOptions,
  DiagramId,
  DiagramNode,
  DiagramPoint,
  DiagramPort,
  DiagramRect,
  DiagramScene,
  DiagramSceneInput,
  DiagramSelection,
  DiagramShape,
  DiagramSnapContext,
  DiagramSnapResult,
  DiagramSubscriber,
  DiagramText,
  DiagramViewport,
  SerializedDiagramScene,
} from "./types.js"

type MutableEntities = {
  nodesById: Map<DiagramId, DiagramNode>
  edgesById: Map<DiagramId, DiagramEdge>
  textsById: Map<DiagramId, DiagramText>
  shapesById: Map<DiagramId, DiagramShape>
  portsById: Map<DiagramId, DiagramPort>
}

type MutableOrder = {
  nodeIds: DiagramId[]
  edgeIds: DiagramId[]
  textIds: DiagramId[]
  shapeIds: DiagramId[]
}

type InternalState = {
  entities: MutableEntities
  order: MutableOrder
  selection: DiagramSelection
  viewport: DiagramViewport
  revision: number
  versions: Map<DiagramId, number>
}

type Patch = {
  apply: (state: InternalState) => Set<DiagramId>
  inverse: Patch
}

type HistoryEntry = {
  patch: Patch
  inverse: Patch
  key: string | null
}

type GeometryCacheEntry = {
  version: number
  geometry: DiagramGeometry
}

type TransactionResult = {
  changedIds: Set<DiagramId>
  invalidatedIds: Set<DiagramId>
}

const DEFAULT_VIEWPORT: DiagramViewport = Object.freeze({ x: 0, y: 0, width: 0, height: 0, zoom: 1 })
const EMPTY_SELECTION: DiagramSelection = Object.freeze({ ids: Object.freeze([]), primaryId: null })

export class DiagramEngine {
  private state: InternalState
  private snapshot: DiagramScene
  private subscribers = new Set<DiagramSubscriber>()
  private geometryCache = new Map<DiagramId, GeometryCacheEntry>()
  private visualBoundsIndex = new UniformGridIndex()
  private hitBoundsIndex = new UniformGridIndex()
  private portIndex = new UniformGridIndex(128)
  private indexesDirty = true
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private lastChange: DiagramChange = {
    revision: 0,
    changedIds: Object.freeze(new Set<DiagramId>()),
    invalidatedIds: Object.freeze(new Set<DiagramId>()),
  }
  private geometryReadCount = 0

  constructor(initialScene: DiagramSceneInput = {}) {
    this.state = createInternalState(initialScene)
    this.snapshot = this.createSnapshot()
    this.rebuildIndexes()
  }

  getScene(): DiagramScene {
    return this.snapshot
  }

  getLastChange(): DiagramChange {
    return this.lastChange
  }

  getEntityVersion(id: DiagramId): number {
    return this.state.versions.get(id) ?? 0
  }

  getGeometryReadCount(): number {
    return this.geometryReadCount
  }

  dispatch(command: DiagramCommand): DiagramCommandResult {
    if (command.type === "undo") {
      return this.undo()
    }
    if (command.type === "redo") {
      return this.redo()
    }
    const patch = this.createPatch(command)
    if (!patch) {
      return { changed: false, revision: this.state.revision }
    }
    const result = this.commitPatch(patch, true, "historyKey" in command ? command.historyKey ?? null : null)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  transact(mutator: (draft: DiagramScene) => DiagramSceneInput): DiagramCommandResult {
    const next = mutator(this.snapshot)
    const patch = createReplaceScenePatch(next, serializeScene(this.snapshot))
    const result = this.commitPatch(patch, false, null)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  queryVisible(bounds: DiagramRect): DiagramId[] {
    this.ensureIndexes()
    const ids = this.visualBoundsIndex.query(bounds)
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

  hitTest(point: DiagramPoint, options: DiagramHitTestOptions = {}): DiagramHit | null {
    this.ensureIndexes()
    const radius = options.radius ?? 0
    const kinds = options.kinds ? new Set<DiagramEntityKind>(options.kinds) : null
    const rect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    const candidates = this.hitBoundsIndex.query(rect)
    let best: DiagramHit | null = null
    for (const id of candidates) {
      const geometry = this.getGeometry(id)
      if (!geometry || (kinds && !kinds.has(geometry.kind)) || !rectContainsPoint(geometry.hitBounds, point, radius)) {
        continue
      }
      const hitDistance = distance(point, rectPoint(geometry.hitBounds, point))
      if (!best || hitDistance < best.distance) {
        best = { id, kind: geometry.kind, distance: hitDistance }
      }
    }
    return best
  }

  nearestPort(point: DiagramPoint, radius: number, exclude: ReadonlySet<DiagramId> = new Set()): DiagramHit | null {
    this.ensureIndexes()
    const rect = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    let best: DiagramHit | null = null
    for (const id of this.portIndex.query(rect)) {
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
    const aligned = this.snapToAlignment(point, context.radius ?? 6)
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

  subscribe(listener: DiagramSubscriber): { unsubscribe: () => void } {
    this.subscribers.add(listener)
    listener(this.snapshot, this.lastChange)
    return {
      unsubscribe: () => {
        this.subscribers.delete(listener)
      },
    }
  }

  serialize(): SerializedDiagramScene {
    return serializeScene(this.snapshot)
  }

  private undo(): DiagramCommandResult {
    const entry = this.undoStack.pop()
    if (!entry) {
      return { changed: false, revision: this.state.revision }
    }
    const result = this.commitPatch(entry.inverse, false, null)
    this.redoStack.push(entry)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  private redo(): DiagramCommandResult {
    const entry = this.redoStack.pop()
    if (!entry) {
      return { changed: false, revision: this.state.revision }
    }
    const result = this.commitPatch(entry.patch, false, null)
    this.undoStack.push(entry)
    return { changed: result.changedIds.size > 0, revision: this.state.revision }
  }

  private commitPatch(patch: Patch, recordHistory: boolean, historyKey: string | null): TransactionResult {
    const changedIds = patch.apply(this.state)
    if (!changedIds.size) {
      return { changedIds, invalidatedIds: new Set() }
    }
    const invalidatedIds = this.collectInvalidatedIds(changedIds)
    for (const id of invalidatedIds) {
      this.geometryCache.delete(id)
      this.state.versions.set(id, (this.state.versions.get(id) ?? 0) + 1)
    }
    this.state.revision += 1
    this.indexesDirty = true
    this.snapshot = this.createSnapshot()
    this.lastChange = {
      revision: this.state.revision,
      changedIds: Object.freeze(new Set(changedIds)),
      invalidatedIds: Object.freeze(new Set(invalidatedIds)),
    }
    if (recordHistory) {
      const previous = historyKey ? this.undoStack[this.undoStack.length - 1] : null
      if (previous?.key === historyKey) {
        previous.patch = composePatches(previous.patch, patch)
        previous.inverse = composePatches(patch.inverse, previous.inverse)
      } else {
        this.undoStack.push({ patch, inverse: patch.inverse, key: historyKey })
      }
      this.redoStack = []
    }
    this.emit()
    return { changedIds, invalidatedIds }
  }

  private collectInvalidatedIds(changedIds: ReadonlySet<DiagramId>): Set<DiagramId> {
    const invalidated = new Set(changedIds)
    for (const id of changedIds) {
      if (this.state.entities.nodesById.has(id)) {
        for (const port of this.state.entities.portsById.values()) {
          if (port.nodeId === id) {
            invalidated.add(port.id)
          }
        }
        for (const edge of this.state.entities.edgesById.values()) {
          if (edgeReferencesNode(edge, id, this.state.entities.portsById)) {
            invalidated.add(edge.id)
          }
        }
      }
      if (this.state.entities.portsById.has(id)) {
        for (const edge of this.state.entities.edgesById.values()) {
          if (edge.source.kind === "port" && edge.source.portId === id) {
            invalidated.add(edge.id)
          }
          if (edge.target.kind === "port" && edge.target.portId === id) {
            invalidated.add(edge.id)
          }
        }
      }
    }
    return invalidated
  }

  private getGeometry(id: DiagramId): DiagramGeometry | null {
    const version = this.state.versions.get(id) ?? 0
    const cached = this.geometryCache.get(id)
    if (cached?.version === version) {
      return cached.geometry
    }
    const geometry = createEntityGeometry(id, this.snapshot.entities)
    if (!geometry) {
      return null
    }
    this.geometryReadCount += 1
    this.geometryCache.set(id, { version, geometry })
    return geometry
  }

  private rebuildIndexes(): void {
    const geometries = this.createOrderedIds()
      .map((id) => this.getGeometry(id))
      .filter((geometry): geometry is DiagramGeometry => geometry !== null)
    this.visualBoundsIndex.rebuild(geometries)
    this.hitBoundsIndex.rebuild(geometries, true)
    this.portIndex.rebuild(geometries.filter((geometry) => geometry.kind === "port"), true)
    this.indexesDirty = false
  }

  private ensureIndexes(): void {
    if (this.indexesDirty) {
      this.rebuildIndexes()
    }
  }

  private createPatch(command: Exclude<DiagramCommand, { type: "undo" } | { type: "redo" }>): Patch | null {
    switch (command.type) {
      case "moveEntities":
        return createMovePatch(this.state, command.ids, command.delta)
      case "moveNode":
        return createMovePatch(this.state, [command.id], command.delta)
      case "moveEdgeEndpoint":
        return createMoveEdgeEndpointPatch(this.state, command.id, command.endpoint, command.point)
      case "createEdge":
        return createCreateEdgePatch(this.state, command.edge)
      case "deleteSelection":
        return createDeleteSelectionPatch(this.state)
      case "setSelection":
        return createSelectionPatch(this.state.selection, command.selection)
      case "editText":
        return createEditTextPatch(this.state, command.id, command.text)
      case "setViewport":
        return createViewportPatch(this.state.viewport, command.viewport)
    }
  }

  private snapToAlignment(point: DiagramPoint, radius: number): DiagramPoint | null {
    for (const id of this.state.order.nodeIds) {
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

  private createSnapshot(): DiagramScene {
    return deepFreeze({
      entities: {
        nodesById: createReadonlyMap(this.state.entities.nodesById),
        edgesById: createReadonlyMap(this.state.entities.edgesById),
        textsById: createReadonlyMap(this.state.entities.textsById),
        shapesById: createReadonlyMap(this.state.entities.shapesById),
        portsById: createReadonlyMap(this.state.entities.portsById),
      },
      order: {
        nodeIds: [...this.state.order.nodeIds],
        edgeIds: [...this.state.order.edgeIds],
        textIds: [...this.state.order.textIds],
        shapeIds: [...this.state.order.shapeIds],
      },
      selection: {
        ids: [...this.state.selection.ids],
        primaryId: this.state.selection.primaryId,
      },
      viewport: { ...this.state.viewport },
      revision: this.state.revision,
    })
  }

  private createOrderedIds(): DiagramId[] {
    return [
      ...this.state.order.edgeIds,
      ...this.state.order.shapeIds,
      ...this.state.order.nodeIds,
      ...this.state.order.textIds,
      ...this.state.entities.portsById.keys(),
    ]
  }

  private createOrderIndex(): Map<DiagramId, number> {
    return new Map(this.createOrderedIds().map((id, index) => [id, index]))
  }

  private emit(): void {
    for (const listener of this.subscribers) {
      listener(this.snapshot, this.lastChange)
    }
  }
}

export function createDiagramEngine(initialScene: DiagramSceneInput = {}): DiagramEngine {
  return new DiagramEngine(initialScene)
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

function createInternalState(input: DiagramSceneInput): InternalState {
  const entities: MutableEntities = {
    nodesById: toMap(input.nodes ?? []),
    edgesById: toMap(input.edges ?? []),
    textsById: toMap(input.texts ?? []),
    shapesById: toMap(input.shapes ?? []),
    portsById: toMap(input.ports ?? []),
  }
  const ids = [
    ...entities.nodesById.keys(),
    ...entities.edgesById.keys(),
    ...entities.textsById.keys(),
    ...entities.shapesById.keys(),
    ...entities.portsById.keys(),
  ]
  return {
    entities,
    order: {
      nodeIds: [...entities.nodesById.keys()],
      edgeIds: [...entities.edgesById.keys()],
      textIds: [...entities.textsById.keys()],
      shapeIds: [...entities.shapesById.keys()],
    },
    selection: normalizeSelection(input.selection),
    viewport: { ...DEFAULT_VIEWPORT, ...input.viewport },
    revision: 0,
    versions: new Map(ids.map((id) => [id, 0])),
  }
}

function createMovePatch(state: InternalState, ids: ReadonlyArray<DiagramId>, delta: DiagramPoint): Patch | null {
  if (delta.x === 0 && delta.y === 0) {
    return null
  }
  const movableIds = ids.filter((id) => state.entities.nodesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id))
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

function createSelectionPatch(previous: DiagramSelection, selection: DiagramSelection): Patch | null {
  if (sameIds(previous.ids, selection.ids) && previous.primaryId === selection.primaryId) {
    return null
  }
  return {
    apply: (next) => {
      next.selection = normalizeSelection(selection)
      return new Set([...previous.ids, ...selection.ids, "selection"])
    },
    inverse: {
      apply: (next) => {
        next.selection = previous
        return new Set([...previous.ids, ...selection.ids, "selection"])
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
      const replacement = createInternalState(next)
      state.entities = replacement.entities
      state.order = replacement.order
      state.selection = replacement.selection
      state.viewport = replacement.viewport
      state.versions = replacement.versions
      return new Set([
        ...replacement.order.nodeIds,
        ...replacement.order.edgeIds,
        ...replacement.order.textIds,
        ...replacement.order.shapeIds,
        ...replacement.entities.portsById.keys(),
      ])
    },
    inverse: {
      apply: (state) => {
        const replacement = createInternalState(previous)
        state.entities = replacement.entities
        state.order = replacement.order
        state.selection = replacement.selection
        state.viewport = replacement.viewport
        state.versions = replacement.versions
        return new Set([
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
  const deleted = new Set(ids)
  for (const id of ids) {
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
  return {
    apply: (state) => {
      const changed = first.apply(state)
      for (const id of second.apply(state)) {
        changed.add(id)
      }
      return changed
    },
    inverse: undefined as unknown as Patch,
  }
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

function edgeReferencesNode(edge: DiagramEdge, id: DiagramId, ports: ReadonlyMap<DiagramId, DiagramPort>): boolean {
  for (const endpoint of [edge.source, edge.target]) {
    if (endpoint.kind === "node" && endpoint.nodeId === id) {
      return true
    }
    if (endpoint.kind === "port" && ports.get(endpoint.portId)?.nodeId === id) {
      return true
    }
  }
  return false
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

function normalizeSelection(selection: Partial<DiagramSelection> | undefined): DiagramSelection {
  const ids = [...new Set(selection?.ids ?? [])]
  return {
    ids,
    primaryId: selection?.primaryId && ids.includes(selection.primaryId) ? selection.primaryId : ids[0] ?? null,
  }
}

function toMap<Entity extends { id: DiagramId }>(entities: ReadonlyArray<Entity>): Map<DiagramId, Entity> {
  return new Map(entities.map((entity) => [entity.id, { ...entity }]))
}

function createReadonlyMap<Entity>(source: ReadonlyMap<DiagramId, Entity>): ReadonlyMap<DiagramId, Entity> {
  const map = new Map<DiagramId, Entity>() as Map<DiagramId, Entity> & {
    set: never
    delete: never
    clear: never
  }
  for (const [id, entity] of source) {
    Map.prototype.set.call(map, id, deepFreeze(cloneValue(entity)))
  }
  Object.defineProperties(map, {
    set: { value: readonlyMapMutation, writable: false },
    delete: { value: readonlyMapMutation, writable: false },
    clear: { value: readonlyMapMutation, writable: false },
  })
  return Object.freeze(map)
}

function readonlyMapMutation(): never {
  throw new TypeError("Diagram snapshots are immutable")
}

function cloneValue<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as Value
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)])) as Value
  }
  return value
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

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object") {
    Object.freeze(value)
    if (value instanceof Map || value instanceof Set) {
      return value
    }
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }
  }
  return value
}
