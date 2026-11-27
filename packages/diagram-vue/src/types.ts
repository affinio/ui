import type { DiagramConnectorBridge, DiagramContentOverrides, DiagramEntityKind, DiagramGeometry, DiagramId, DiagramJunctionRenderGeometry, DiagramPoint, DiagramRect, DiagramResizeHandle, DiagramResolvedStyle } from "@affino/diagram-core"

export type DiagramRenderLayer = "svg" | "dom"
export type InteractionPreviewMode = "live" | "ghost" | "outline"
export type DiagramInteractionPreviewMode = InteractionPreviewMode
/** @deprecated Use `DiagramInteractionPreviewMode`; removed in next major (TODO(next-major)). */
export type DiagramDragPreviewMode = DiagramInteractionPreviewMode

export type DiagramRenderEntity = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  layer: DiagramRenderLayer
  geometry: DiagramGeometry
  selected: boolean
  style?: DiagramResolvedStyle
  /** Display-only text resolved for this presentation; editing still targets authoritative scene text. */
  displayText?: string
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
  /** Presentation used for any active interaction candidate geometry. */
  interactionPreviewMode: DiagramInteractionPreviewMode
  /** Core-resolved transient candidate geometry for any active edit; never scene entities or hit-test targets. */
  interactionPreview: ReadonlyArray<DiagramRenderEntity>
  /** @deprecated Use `interactionPreviewMode`; removed in next major (TODO(next-major)). */
  dragPreviewMode: DiagramDragPreviewMode
  /** @deprecated Use `interactionPreview`; removed in next major (TODO(next-major)). */
  dragPreview: ReadonlyArray<DiagramRenderEntity>
  /** Unified Core render order across entity kinds. */
  ordered: ReadonlyArray<DiagramRenderEntity>
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
  style?: DiagramResolvedStyle
  bridges: ReadonlyArray<DiagramConnectorBridge>
  junctions: ReadonlyArray<DiagramJunctionRenderGeometry>
  selected: boolean
}>
