import type { DiagramConnectorBridge, DiagramEntityKind, DiagramGeometry, DiagramId, DiagramPoint, DiagramRect, DiagramResizeHandle } from "@affino/diagram-core"

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
  kind: "resize" | "port" | "edge-endpoint" | "waypoint" | "edge-segment" | "path-vertex" | "bezier-anchor" | "bezier-incoming" | "bezier-outgoing"
  point: DiagramPoint
  resizeHandle?: DiagramResizeHandle
  segmentIndex?: number
  contourIndex?: number
  bezierHandle?: "anchor" | "incoming" | "outgoing"
  anchorSide?: "start" | "end"
}>

export type DiagramOverlayAnchor = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  rect: DiagramRect
  /** Present for free straight edges; the four world-space selection-frame corners follow the line direction. */
  corners?: ReadonlyArray<DiagramPoint>
}>

export type DiagramVisibleProjection = Readonly<{
  ids: ReadonlyArray<DiagramId>
  nodes: ReadonlyArray<DiagramRenderEntity>
  edges: ReadonlyArray<DiagramRenderEntity>
  texts: ReadonlyArray<DiagramRenderEntity>
  shapes: ReadonlyArray<DiagramRenderEntity>
  tables: ReadonlyArray<DiagramRenderEntity>
  ports: ReadonlyArray<DiagramRenderEntity>
  activeHandles: ReadonlyArray<DiagramHandle>
  overlayAnchors: ReadonlyArray<DiagramOverlayAnchor>
}>

export type DiagramConnectorRenderEntity = Readonly<{
  id: DiagramId
  pathData: string
  bridges: ReadonlyArray<DiagramConnectorBridge>
  selected: boolean
}>
