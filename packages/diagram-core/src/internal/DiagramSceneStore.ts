import type { DiagramChange, DiagramId, DiagramScene, DiagramSceneInput, DiagramSelection, DiagramSubscriber } from "../types.js"
import { DEFAULT_VIEWPORT } from "./model.js"
import type { InternalState, MutableEntities } from "./model.js"

const EMPTY_SELECTION: DiagramSelection = Object.freeze({ ids: Object.freeze([]), primaryId: null })

export class DiagramSceneStore {
  readonly state: InternalState
  private snapshot: DiagramScene
  private readonly frozenEntityCache = new WeakMap<object, unknown>()
  private subscribers = new Set<DiagramSubscriber>()
  private lastChange: DiagramChange = {
    revision: 0,
    changedIds: createReadonlySet([]),
    invalidatedIds: createReadonlySet([]),
  }

  constructor(initialScene: DiagramSceneInput = {}) {
    this.state = createInternalState(initialScene)
    this.snapshot = this.createSnapshot(null)
  }

  getSnapshot(): DiagramScene {
    return this.snapshot
  }

  getLastChange(): DiagramChange {
    return this.lastChange
  }

  publish(changedIds: ReadonlySet<DiagramId>, invalidatedIds: ReadonlySet<DiagramId>): void {
    this.snapshot = this.createSnapshot(changedIds)
    this.lastChange = {
      revision: this.state.revision,
      changedIds: createReadonlySet(changedIds),
      invalidatedIds: createReadonlySet(invalidatedIds),
    }
    for (const listener of this.subscribers) {
      listener(this.snapshot, this.lastChange)
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

  private createSnapshot(changedIds: ReadonlySet<DiagramId> | null): DiagramScene {
    return deepFreeze({
      entities: {
        nodesById: this.createReadonlyMap(this.state.entities.nodesById, this.snapshot?.entities.nodesById, changedIds),
        edgesById: this.createReadonlyMap(this.state.entities.edgesById, this.snapshot?.entities.edgesById, changedIds),
        textsById: this.createReadonlyMap(this.state.entities.textsById, this.snapshot?.entities.textsById, changedIds),
        shapesById: this.createReadonlyMap(this.state.entities.shapesById, this.snapshot?.entities.shapesById, changedIds),
        portsById: this.createReadonlyMap(this.state.entities.portsById, this.snapshot?.entities.portsById, changedIds),
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

  private createReadonlyMap<Entity>(
    source: ReadonlyMap<DiagramId, Entity>,
    previous: ReadonlyMap<DiagramId, Entity> | undefined,
    changedIds: ReadonlySet<DiagramId> | null,
  ): ReadonlyMap<DiagramId, Entity> {
    return createReadonlyMap(source, this.frozenEntityCache, previous, changedIds)
  }
}

export function createInternalState(input: DiagramSceneInput): InternalState {
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

function normalizeSelection(selection: Partial<DiagramSelection> | undefined): DiagramSelection {
  if (!selection?.ids?.length) return EMPTY_SELECTION
  const ids = [...new Set(selection.ids)]
  return { ids, primaryId: selection.primaryId && ids.includes(selection.primaryId) ? selection.primaryId : ids[0] ?? null }
}

function toMap<Entity extends { id: DiagramId }>(entities: ReadonlyArray<Entity>): Map<DiagramId, Entity> {
  return new Map(entities.map((entity) => [entity.id, cloneValue(entity)]))
}

function createReadonlyMap<Entity>(
  source: ReadonlyMap<DiagramId, Entity>,
  cache: WeakMap<object, unknown>,
  previous: ReadonlyMap<DiagramId, Entity> | undefined,
  changedIds: ReadonlySet<DiagramId> | null,
): ReadonlyMap<DiagramId, Entity> {
  if (previous && changedIds && !Array.from(changedIds).some((id) => source.has(id) || previous.has(id))) {
    return previous
  }
  if (previous && changedIds) {
    const updates = new Map<DiagramId, Entity>()
    const deleted = new Set<DiagramId>()
    for (const id of changedIds) {
      if (source.has(id)) {
        const entity = source.get(id) as Entity
        updates.set(id, freezeEntity(entity, cache))
      } else if (previous.has(id)) {
        deleted.add(id)
      }
    }
    return Object.freeze(new PersistentReadonlyMap(previous, updates, deleted))
  }
  const target = new Map<DiagramId, Entity>() as Map<DiagramId, Entity> & { set: never; delete: never; clear: never }
  for (const [id, entity] of source) {
    Map.prototype.set.call(target, id, freezeEntity(entity, cache))
  }
  Object.defineProperties(target, {
    set: { value: readonlyMapMutation, writable: false },
    delete: { value: readonlyMapMutation, writable: false },
    clear: { value: readonlyMapMutation, writable: false },
  })
  return Object.freeze(target)
}

function freezeEntity<Entity>(entity: Entity, cache: WeakMap<object, unknown>): Entity {
  const cached = entity && typeof entity === "object" ? cache.get(entity) : undefined
  if (cached !== undefined) {
    return cached as Entity
  }
  const frozen = deepFreeze(cloneValue(entity))
  if (entity && typeof entity === "object") {
    cache.set(entity, frozen)
  }
  return frozen
}

class PersistentReadonlyMap<Entity> implements ReadonlyMap<DiagramId, Entity> {
  readonly size: number

  constructor(
    private readonly base: ReadonlyMap<DiagramId, Entity>,
    private readonly updates: ReadonlyMap<DiagramId, Entity>,
    private readonly deleted: ReadonlySet<DiagramId>,
  ) {
    let size = base.size
    for (const id of deleted) {
      if (base.has(id)) size -= 1
    }
    for (const id of updates.keys()) {
      if (!base.has(id) || deleted.has(id)) size += 1
    }
    this.size = size
  }

  get(id: DiagramId): Entity | undefined {
    if (this.deleted.has(id)) return undefined
    return this.updates.has(id) ? this.updates.get(id) : this.base.get(id)
  }

  has(id: DiagramId): boolean {
    return !this.deleted.has(id) && (this.updates.has(id) || this.base.has(id))
  }

  *entries(): IterableIterator<[DiagramId, Entity]> {
    for (const [id, entity] of this.base) {
      if (this.deleted.has(id)) continue
      yield [id, this.updates.get(id) ?? entity]
    }
    for (const [id, entity] of this.updates) {
      if (!this.base.has(id)) yield [id, entity]
    }
  }

  *keys(): IterableIterator<DiagramId> {
    for (const [id] of this.entries()) yield id
  }

  *values(): IterableIterator<Entity> {
    for (const [, entity] of this.entries()) yield entity
  }

  forEach(callback: (value: Entity, key: DiagramId, map: ReadonlyMap<DiagramId, Entity>) => void): void {
    for (const [id, entity] of this.entries()) callback(entity, id, this)
  }

  [Symbol.iterator](): IterableIterator<[DiagramId, Entity]> {
    return this.entries()
  }
}

function readonlyMapMutation(): never {
  throw new TypeError("Diagram snapshots are readonly")
}

function createReadonlySet<Value>(values: Iterable<Value>): ReadonlySet<Value> {
  const set = new Set(values)
  Object.defineProperties(set, {
    add: { value: readonlySetMutation, writable: false },
    delete: { value: readonlySetMutation, writable: false },
    clear: { value: readonlySetMutation, writable: false },
  })
  return Object.freeze(set)
}

function readonlySetMutation(): never {
  throw new TypeError("Diagram change sets are readonly")
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

function deepFreeze<Value>(value: Value): Value {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child)
  }
  return value
}
