import type { DiagramChange, DiagramEdge, DiagramGeometry, DiagramId, DiagramNode, DiagramPort, DiagramSceneInput, DiagramSelection, DiagramShape, DiagramText, DiagramViewport } from "../types.js"

export type MutableEntities = {
  nodesById: Map<DiagramId, DiagramNode>
  edgesById: Map<DiagramId, DiagramEdge>
  textsById: Map<DiagramId, DiagramText>
  shapesById: Map<DiagramId, DiagramShape>
  portsById: Map<DiagramId, DiagramPort>
}

export type MutableOrder = {
  nodeIds: DiagramId[]
  edgeIds: DiagramId[]
  textIds: DiagramId[]
  shapeIds: DiagramId[]
}

export type InternalState = {
  entities: MutableEntities
  order: MutableOrder
  selection: DiagramSelection
  viewport: DiagramViewport
  revision: number
  versions: Map<DiagramId, number>
}

export type Patch = {
  apply: (state: InternalState) => Set<DiagramId>
  inverse: Patch
}

export type HistoryEntry = {
  patch: Patch
  inverse: Patch
  key: string | null
}

export type GeometryCacheEntry = {
  version: number
  geometry: DiagramGeometry
}

export type TransactionResult = {
  changedIds: Set<DiagramId>
  invalidatedIds: Set<DiagramId>
}

export const DEFAULT_VIEWPORT: DiagramViewport = Object.freeze({ x: 0, y: 0, width: 0, height: 0, zoom: 1 })
export const EMPTY_SELECTION: DiagramSelection = Object.freeze({ ids: Object.freeze([]), primaryId: null })

export type DiagramSceneStoreInput = DiagramSceneInput
