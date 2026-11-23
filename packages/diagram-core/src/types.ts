export type DiagramId = string

export type DiagramEntityKind = "node" | "edge" | "text" | "shape" | "port" | "group" | "table"

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

/** Horizontal reflects X (left/right); vertical reflects Y (top/bottom). */
export type DiagramFlipAxis = "horizontal" | "vertical"

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

/** World-space rectangle allowed for the visible viewport, expanded by an optional world-unit margin. */
export type DiagramViewportConstraints = Readonly<{
  bounds: DiagramRect
  margin?: number
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
  flipX?: boolean
  flipY?: boolean
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
  flipX?: boolean
  flipY?: boolean
}>

export type DiagramShape = DiagramEntityBase & Readonly<{
  kind: "shape"
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  flipX?: boolean
  flipY?: boolean
  shape: "rect" | "ellipse" | "line" | string
}>

export type DiagramTableHorizontalAlignment = "left" | "center" | "right"
export type DiagramTableVerticalAlignment = "top" | "middle" | "bottom"
export type DiagramTableLineStyle = "solid" | "dashed" | "dotted"
export type DiagramTableCell = Readonly<{
  text: string
  horizontalAlign?: DiagramTableHorizontalAlignment
  verticalAlign?: DiagramTableVerticalAlignment
}>
export type DiagramTableStroke = Readonly<{ color: string; width: number; style: DiagramTableLineStyle }>
export type DiagramTableStyle = Readonly<{
  grid: Readonly<{ visible: boolean; stroke: DiagramTableStroke }>
  border: Readonly<{ visible: boolean; stroke: DiagramTableStroke; radius: number }>
  cellPadding?: number
}>
export type DiagramTableStyleUpdate = Readonly<{
  grid?: Readonly<{ visible?: boolean; stroke?: Partial<DiagramTableStroke> }>
  border?: Readonly<{ visible?: boolean; stroke?: Partial<DiagramTableStroke>; radius?: number }>
  cellPadding?: number
}>
export type DiagramTable = DiagramEntityBase & Readonly<{
  kind: "table"
  x: number
  y: number
  width: number
  height: number
  rowCount: number
  columnCount: number
  cells?: ReadonlyArray<ReadonlyArray<DiagramTableCell>>
  rowHeights?: ReadonlyArray<number>
  columnWidths?: ReadonlyArray<number>
  defaultCell?: DiagramTableCell
  style?: DiagramTableStyle
  rotation?: number
  flipX?: boolean
  flipY?: boolean
}>
export type DiagramTableCellPosition = Readonly<{ row: number; column: number }>

export type DiagramGroup = DiagramEntityBase & Readonly<{
  kind: "group"
  childIds: ReadonlyArray<DiagramId>
  /** Absolute group rotation in degrees; children are transformed when it changes. */
  rotation?: number
}>

export type DiagramEntities = Readonly<{
  nodesById: ReadonlyMap<DiagramId, DiagramNode>
  edgesById: ReadonlyMap<DiagramId, DiagramEdge>
  textsById: ReadonlyMap<DiagramId, DiagramText>
  shapesById: ReadonlyMap<DiagramId, DiagramShape>
  portsById: ReadonlyMap<DiagramId, DiagramPort>
  groupsById: ReadonlyMap<DiagramId, DiagramGroup>
  tablesById: ReadonlyMap<DiagramId, DiagramTable>
}>

export type DiagramOrder = Readonly<{
  nodeIds: ReadonlyArray<DiagramId>
  edgeIds: ReadonlyArray<DiagramId>
  textIds: ReadonlyArray<DiagramId>
  shapeIds: ReadonlyArray<DiagramId>
  groupIds: ReadonlyArray<DiagramId>
  tableIds: ReadonlyArray<DiagramId>
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
  spatialIndexRebuildCount: number
  spatialIndexUpdateCount: number
  dependencyIndexRebuildCount: number
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
  groups?: ReadonlyArray<DiagramGroup>
  tables?: ReadonlyArray<DiagramTable>
  selection?: Partial<DiagramSelection>
  viewport?: Partial<DiagramViewport>
}>

export type DiagramHistoryOptions = Readonly<{
  /** Maximum number of undo entries retained. Infinity keeps the legacy unbounded policy. */
  maxEntries?: number
}>

export type DiagramEngineOptions = Readonly<{
  history?: DiagramHistoryOptions
}>

export type SerializedDiagramScene = Readonly<{
  nodes: ReadonlyArray<DiagramNode>
  edges: ReadonlyArray<DiagramEdge>
  texts: ReadonlyArray<DiagramText>
  shapes: ReadonlyArray<DiagramShape>
  ports: ReadonlyArray<DiagramPort>
  groups?: ReadonlyArray<DiagramGroup>
  tables?: ReadonlyArray<DiagramTable>
  selection: DiagramSelection
  viewport: DiagramViewport
}>

export type DiagramDocument = Readonly<{
  format: "affino-diagram"
  version: 1
  content: Readonly<Omit<SerializedDiagramScene, "selection" | "viewport">>
  view?: Readonly<{ viewport?: DiagramViewport; selection?: DiagramSelection }>
}>

export type DiagramGeometry = Readonly<{
  id: DiagramId
  kind: DiagramEntityKind
  bounds: DiagramRect
  hitBounds: DiagramRect
  unrotatedBounds?: DiagramRect
  corners?: ReadonlyArray<DiagramPoint>
  rotation?: number
  flipX?: boolean
  flipY?: boolean
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
  documentRevision: number
  changedIds: ReadonlySet<DiagramId>
  invalidatedIds: ReadonlySet<DiagramId>
}>

export type DiagramSubscriber = (scene: DiagramScene, change: DiagramChange) => void

export type DiagramCommand =
  | Readonly<{ type: "createNode"; node: DiagramNode; historyKey?: string }>
  | Readonly<{ type: "createTable"; table: DiagramTable; historyKey?: string }>
  | Readonly<{ type: "insertTableRow"; id: DiagramId; index: number; cells?: ReadonlyArray<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "deleteTableRow"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "insertTableColumn"; id: DiagramId; index: number; cells?: ReadonlyArray<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "deleteTableColumn"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "resizeTableRow"; id: DiagramId; index: number; height: number; historyKey?: string }>
  | Readonly<{ type: "resizeTableColumn"; id: DiagramId; index: number; width: number; historyKey?: string }>
  | Readonly<{ type: "updateTableCell"; id: DiagramId; row: number; column: number; cell: Partial<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "updateTableStyle"; id: DiagramId; style: DiagramTableStyleUpdate; historyKey?: string }>
  | Readonly<{ type: "groupEntities"; id: DiagramId; ids?: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "ungroupEntities"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "createPort"; port: DiagramPort; historyKey?: string }>
  | Readonly<{ type: "deleteEntities"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "reconnectEdgeEndpoint"; id: DiagramId; endpoint: "source" | "target"; connection: DiagramEdgeEndpoint; historyKey?: string }>
  | Readonly<{ type: "updateEntities"; updates: ReadonlyArray<DiagramEntityUpdate>; historyKey?: string }>
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
  | Readonly<{ type: "flipEntities"; ids?: ReadonlyArray<DiagramId>; axis: DiagramFlipAxis; historyKey?: string }>
  | Readonly<{ type: "alignEntities"; ids: ReadonlyArray<DiagramId>; edge: DiagramAlignEdge; historyKey?: string }>
  | Readonly<{ type: "bringForward"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "sendBackward"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "bringToFront"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "sendToBack"; ids: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "setLayer"; ids: ReadonlyArray<DiagramId>; layer?: string; layerRole?: DiagramLayerRole; historyKey?: string }>
  | Readonly<{ type: "setEntityMetadata"; id: DiagramId; metadata?: DiagramMetadata; historyKey?: string }>
  | Readonly<{ type: "keyboard"; command: DiagramKeyboardCommand; options?: DiagramKeyboardOptions; historyKey?: string }>
  | Readonly<{ type: "setSelection"; selection: DiagramSelection; mode?: "replace" | "add" | "toggle"; historyKey?: string }>
  | Readonly<{ type: "editText"; id: DiagramId; text: string; historyKey?: string }>
  | Readonly<{ type: "setViewport"; viewport: Partial<DiagramViewport>; historyKey?: string }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>

/** Metadata values are merged by key. Omitted keys are preserved; keys cannot be removed by this command. */
export type DiagramEntityUpdate = Readonly<{
  id: DiagramId
  metadata?: Readonly<Record<string, unknown>>
}>

export type DiagramCommandResult = Readonly<{
  changed: boolean
  revision: number
}>

export type DiagramBatchFailureReason = "revision-mismatch" | "invalid-command" | "unsupported-command"
export type DiagramBatchResult = Readonly<{
  ok: boolean
  changed: boolean
  revision: number
  documentRevision: number
  failedCommandIndex: number | null
  reason: DiagramBatchFailureReason | null
  affectedIds: ReadonlyArray<DiagramId>
}>
export type DiagramBatchOptions = Readonly<{ expectedRevision?: number }>

export type DiagramInteractionTool = "pan" | "select" | "marquee" | "drag-selection" | "resize-selection" | "drag-edge-endpoint" | "connect-edge" | "edit-text"

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
  resizePreviewEntries: ReadonlyArray<DiagramResizeEntry>
  edgeEndpointPreview: DiagramEdgeEndpointPreview | null
  snapGuides: ReadonlyArray<DiagramSnapGuide>
  marquee: DiagramRect | null
}>

export type DiagramEdgeEndpointPreview = Readonly<{
  id: DiagramId
  endpoint: "source" | "target"
  point: DiagramPoint
}>

export type DiagramSnapContext = Readonly<{
  gridSize?: number
  radius?: number
  /** Restrict point or translation snapping to this movement axis. */
  axisConstraint?: "x" | "y"
  snapToPorts?: boolean
  snapToAlignment?: boolean
  snapToEqualSpacing?: boolean
  excludeIds?: ReadonlySet<DiagramId>
  angleConstraint?: number
  custom?: (point: DiagramPoint) => DiagramPoint | null
}>

export type DiagramSnapResult = Readonly<{
  point: DiagramPoint
  snapped: boolean
  source: "grid" | "port" | "alignment" | "equal-spacing" | "angle" | "custom" | null
}>

export type DiagramTranslationSnapResult = DiagramSnapResult & Readonly<{
  guides: ReadonlyArray<DiagramSnapGuide>
}>

export type DiagramSnapGuide = Readonly<{
  kind: "alignment" | "equal-spacing"
  axis: "x" | "y"
  start: DiagramPoint
  end: DiagramPoint
}>

export type DiagramInteractionSnapOptions = Readonly<{
  enabled?: boolean
  /** Pointer tolerance in screen pixels. Converted to world units using the current zoom. */
  tolerancePx?: number
  /** Grid spacing in world units. Omit to disable grid snapping. */
  gridSize?: number
  snapToPorts?: boolean
  snapToAlignment?: boolean
  snapToEqualSpacing?: boolean
}>
