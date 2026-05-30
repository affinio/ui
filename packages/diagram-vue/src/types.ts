import type { DiagramEntityKind, DiagramGeometry, DiagramId, DiagramPoint, DiagramRect } from "@affino/diagram-core"

export type DiagramRenderLayer = "svg" | "dom"

export type DiagramRenderEntity = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  layer: DiagramRenderLayer
  geometry: DiagramGeometry
  selected: boolean
}>

export type DiagramHandle = Readonly<{
  id: string
  ownerId: DiagramId
  kind: "resize" | "port" | "edge-endpoint"
  point: DiagramPoint
}>

export type DiagramOverlayAnchor = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  rect: DiagramRect
}>

export type DiagramVisibleProjection = Readonly<{
  ids: ReadonlyArray<DiagramId>
  nodes: ReadonlyArray<DiagramRenderEntity>
  edges: ReadonlyArray<DiagramRenderEntity>
  texts: ReadonlyArray<DiagramRenderEntity>
  shapes: ReadonlyArray<DiagramRenderEntity>
  ports: ReadonlyArray<DiagramRenderEntity>
  activeHandles: ReadonlyArray<DiagramHandle>
  overlayAnchors: ReadonlyArray<DiagramOverlayAnchor>
}>
