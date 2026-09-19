import type { DiagramChange, DiagramId, DiagramScene, DiagramSceneInput, DiagramSelection, DiagramSubscriber } from "../types.js"
import { DEFAULT_VIEWPORT } from "./model.js"
import type { InternalState, MutableEntities } from "./model.js"

const EMPTY_SELECTION: DiagramSelection = Object.freeze({ ids: Object.freeze([]), primaryId: null })

export class DiagramSceneStore {
  readonly state: InternalState
  private snapshot: DiagramScene
  private subscribers = new Set<DiagramSubscriber>()
  private lastChange: DiagramChange = {
    revision: 0,
    changedIds: Object.freeze(new Set<DiagramId>()),
    invalidatedIds: Object.freeze(new Set<DiagramId>()),
  }

  constructor(initialScene: DiagramSceneInput = {}) {
    this.state = createInternalState(initialScene)
    this.snapshot = this.createSnapshot()
  }

  getSnapshot(): DiagramScene {
    return this.snapshot
  }

  getLastChange(): DiagramChange {
    return this.lastChange
  }

  publish(changedIds: ReadonlySet<DiagramId>, invalidatedIds: ReadonlySet<DiagramId>): void {
    this.snapshot = this.createSnapshot()
    this.lastChange = {
      revision: this.state.revision,
      changedIds: Object.freeze(new Set(changedIds)),
      invalidatedIds: Object.freeze(new Set(invalidatedIds)),
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

function createReadonlyMap<Entity>(source: ReadonlyMap<DiagramId, Entity>): ReadonlyMap<DiagramId, Entity> {
  const target = new Map<DiagramId, Entity>() as Map<DiagramId, Entity> & { set: never; delete: never; clear: never }
  for (const [id, entity] of source) {
    Map.prototype.set.call(target, id, deepFreeze(cloneValue(entity)))
  }
  Object.defineProperties(target, {
    set: { value: readonlyMapMutation, writable: false },
    delete: { value: readonlyMapMutation, writable: false },
    clear: { value: readonlyMapMutation, writable: false },
  })
  return Object.freeze(target)
}

function readonlyMapMutation(): never {
  throw new TypeError("Diagram snapshots are readonly")
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
