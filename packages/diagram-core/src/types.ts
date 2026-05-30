export type DiagramId = string

export type DiagramEntityKind = "node" | "edge" | "text" | "shape" | "port"

export type DiagramLayerRole = "background" | "normal" | "foreground"

export type DiagramMetadata = Readonly<Record<string, unknown> & {
  locked?: boolean
  readOnly?: boolean
  nonDeletable?: boolean
  layer?: string
  layerRole?: DiagramLayerRole
}>

export type DiagramPoint = Readonly<{
  x: number
  y: number
}>

export type DiagramRect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type DiagramViewport = Readonly<{
  x: number
  y: number
  width: number
  height: number
  zoom: number
}>

export type DiagramSelection = Readonly<{
  ids: ReadonlyArray<DiagramId>
  primaryId: DiagramId | null
}>

export type DiagramEntityBase = Readonly<{
  id: DiagramId
  metadata?: DiagramMetadata
}>

export type DiagramNode = DiagramEntityBase & Readonly<{
  kind: "node"
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  portIds?: ReadonlyArray<DiagramId>
}>

export type DiagramPort = DiagramEntityBase & Readonly<{
  kind: "port"
  nodeId: DiagramId
  x: number
  y: number
  radius?: number
}>

export type DiagramEdgeEndpoint =
  | Readonly<{ kind: "point"; point: DiagramPoint }>
  | Readonly<{ kind: "node"; nodeId: DiagramId }>
  | Readonly<{ kind: "port"; portId: DiagramId }>

export type DiagramEdge = DiagramEntityBase & Readonly<{
  kind: "edge"
  source: DiagramEdgeEndpoint
  target: DiagramEdgeEndpoint
  points?: ReadonlyArray<DiagramPoint>
}>

export type DiagramText = DiagramEntityBase & Readonly<{
  kind: "text"
  x: number
  y: number
  text: string
  width?: number
  height?: number
  fontSize?: number
  rotation?: number
}>

export type DiagramShape = DiagramEntityBase & Readonly<{
  kind: "shape"
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  shape: "rect" | "ellipse" | "line" | string
}>

export type DiagramGroup = DiagramEntityBase & Readonly<{
  kind: "group"
  childIds: ReadonlyArray<DiagramId>
}>

export type DiagramEntities = Readonly<{
  nodesById: ReadonlyMap<DiagramId, DiagramNode>
  edgesById: ReadonlyMap<DiagramId, DiagramEdge>
  textsById: ReadonlyMap<DiagramId, DiagramText>
  shapesById: ReadonlyMap<DiagramId, DiagramShape>
  portsById: ReadonlyMap<DiagramId, DiagramPort>
}>

export type DiagramOrder = Readonly<{
  nodeIds: ReadonlyArray<DiagramId>
  edgeIds: ReadonlyArray<DiagramId>
  textIds: ReadonlyArray<DiagramId>
  shapeIds: ReadonlyArray<DiagramId>
}>

export type DiagramScene = Readonly<{
  entities: DiagramEntities
  order: DiagramOrder
  selection: DiagramSelection
  viewport: DiagramViewport
  revision: number
}>

export type DiagramClipboard = SerializedDiagramScene

export type DiagramResizeEntry = Readonly<{
  id: DiagramId
  x?: number
  y?: number
  width?: number
  height?: number
}>

export type DiagramRotateEntry = Readonly<{
  id: DiagramId
  rotation: number
}>

export type DiagramAlignEdge = "left" | "centerX" | "right" | "top" | "centerY" | "bottom"

export type DiagramKeyboardCommand =
  | "nudge-left"
  | "nudge-right"
  | "nudge-up"
  | "nudge-down"
  | "delete"
  | "escape"
  | "undo"
  | "redo"

export type DiagramKeyboardOptions = Readonly<{
  shiftKey?: boolean
  step?: number
  largeStep?: number
}>

export type DiagramDiagnostics = Readonly<{
  revision: number
  visibleQueryCount: number
  entityQueryCount: number
  hitTestCount: number
  geometryRecomputeCount: number
  lastCommandMs: number
  undoDepth: number
  redoDepth: number
}>

export type DiagramRenderOrderOptions = Readonly<{
  includePorts?: boolean
}>

export type DiagramQueryBoundsMode = "intersects" | "contains"

export type DiagramQueryOptions = Readonly<{
  kinds?: ReadonlyArray<DiagramEntityKind>
  bounds?: DiagramRect
  boundsMode?: DiagramQueryBoundsMode
  text?: string
  metadata?: Readonly<Record<string, unknown>>
  includePorts?: boolean
  limit?: number
}>

export type DiagramSceneInput = Readonly<{
  nodes?: ReadonlyArray<DiagramNode>
  edges?: ReadonlyArray<DiagramEdge>
  texts?: ReadonlyArray<DiagramText>
  shapes?: ReadonlyArray<DiagramShape>
  ports?: ReadonlyArray<DiagramPort>
  selection?: Partial<DiagramSelection>
  viewport?: Partial<DiagramViewport>
}>

export type SerializedDiagramScene = Readonly<{
  nodes: ReadonlyArray<DiagramNode>
  edges: ReadonlyArray<DiagramEdge>
  texts: ReadonlyArray<DiagramText>
  shapes: ReadonlyArray<DiagramShape>
  ports: ReadonlyArray<DiagramPort>
  selection: DiagramSelection
  viewport: DiagramViewport
}>

export type DiagramGeometry = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  bounds: DiagramRect
  hitBounds: DiagramRect
  unrotatedBounds?: DiagramRect
  corners?: ReadonlyArray<DiagramPoint>
  rotation?: number
  path?: ReadonlyArray<DiagramPoint>
  point?: DiagramPoint
}>

export type DiagramHitTestOptions = Readonly<{
  kinds?: ReadonlyArray<DiagramEntityKind>
  radius?: number
}>

export type DiagramHit = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  distance: number
}>

export type DiagramChange = Readonly<{
  revision: number
  changedIds: ReadonlySet<DiagramId>
  invalidatedIds: ReadonlySet<DiagramId>
}>

export type DiagramSubscriber = (scene: DiagramScene, change: DiagramChange) => void

export type DiagramCommand =
  | Readonly<{ type: "moveEntities"; ids: ReadonlyArray<DiagramId>; delta: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "moveNode"; id: DiagramId; delta: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "moveEdgeEndpoint"; id: DiagramId; endpoint: "source" | "target"; point: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "insertEdgeWaypoint"; id: DiagramId; index: number; point: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "moveEdgeWaypoint"; id: DiagramId; index: number; point: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "removeEdgeWaypoint"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "createEdge"; edge: DiagramEdge; historyKey?: string }>
  | Readonly<{ type: "deleteSelection"; historyKey?: string }>
  | Readonly<{ type: "duplicateSelection"; offset?: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "pasteClipboard"; clipboard: DiagramClipboard; offset?: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "resizeEntities"; entries: ReadonlyArray<DiagramResizeEntry>; historyKey?: string }>
  | Readonly<{ type: "rotateEntities"; entries: ReadonlyArray<DiagramRotateEntry>; historyKey?: string }>
  | Readonly<{ type: "alignEntities"; ids: ReadonlyArray<DiagramId>; edge: DiagramAlignEdge; historyKey?: string }>
  | Readonly<{ type: "bringForward"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "sendBackward"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "bringToFront"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "sendToBack"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "setLayer"; ids: ReadonlyArray<DiagramId>; layer?: string; layerRole?: DiagramLayerRole; historyKey?: string }>
  | Readonly<{ type: "keyboard"; command: DiagramKeyboardCommand; options?: DiagramKeyboardOptions; historyKey?: string }>
  | Readonly<{ type: "setSelection"; selection: DiagramSelection; mode?: "replace" | "add" | "toggle"; historyKey?: string }>
  | Readonly<{ type: "editText"; id: DiagramId; text: string; historyKey?: string }>
  | Readonly<{ type: "setViewport"; viewport: Partial<DiagramViewport>; historyKey?: string }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>

export type DiagramCommandResult = Readonly<{
  changed: boolean
  revision: number
}>

export type DiagramInteractionTool = "pan" | "select" | "marquee" | "drag-selection" | "resize-selection" | "connect-edge" | "edit-text"

export type DiagramResizeHandle = "nw" | "ne" | "se" | "sw"

export type DiagramPointerEvent = Readonly<{
  id: number
  point: DiagramPoint
  shiftKey?: boolean
}>

export type DiagramMarqueeMode = "intersect" | "contain"

export type DiagramInteractionSnapshot = Readonly<{
  tool: DiagramInteractionTool
  active: boolean
  previewDelta: DiagramPoint | null
  resizePreview: DiagramResizeEntry | null
  marquee: DiagramRect | null
}>

export type DiagramSnapContext = Readonly<{
  gridSize?: number
  radius?: number
  excludeIds?: ReadonlySet<DiagramId>
  angleConstraint?: number
  custom?: (point: DiagramPoint) => DiagramPoint | null
}>

export type DiagramSnapResult = Readonly<{
  point: DiagramPoint
  snapped: boolean
  source: "grid" | "port" | "alignment" | "angle" | "custom" | null
}>
