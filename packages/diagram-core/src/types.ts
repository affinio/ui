export type DiagramId = string

export type DiagramEntityKind = "node" | "edge" | "text" | "shape" | "port"

export type DiagramMetadata = Readonly<Record<string, unknown>>

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
}>

export type DiagramShape = DiagramEntityBase & Readonly<{
  kind: "shape"
  x: number
  y: number
  width: number
  height: number
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
  | Readonly<{ type: "createEdge"; edge: DiagramEdge; historyKey?: string }>
  | Readonly<{ type: "deleteSelection"; historyKey?: string }>
  | Readonly<{ type: "setSelection"; selection: DiagramSelection; historyKey?: string }>
  | Readonly<{ type: "editText"; id: DiagramId; text: string; historyKey?: string }>
  | Readonly<{ type: "setViewport"; viewport: Partial<DiagramViewport>; historyKey?: string }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>

export type DiagramCommandResult = Readonly<{
  changed: boolean
  revision: number
}>

export type DiagramInteractionTool = "pan" | "select" | "marquee" | "drag-selection" | "connect-edge" | "edit-text"

export type DiagramPointerEvent = Readonly<{
  id: number
  point: DiagramPoint
  shiftKey?: boolean
}>

export type DiagramInteractionSnapshot = Readonly<{
  tool: DiagramInteractionTool
  active: boolean
  previewDelta: DiagramPoint | null
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
