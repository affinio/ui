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

export type DiagramPathSegment = Readonly<{ kind: "line"; start: DiagramPoint; end: DiagramPoint }>
  | Readonly<{ kind: "arc"; center: DiagramPoint; radius: number; startAngle: number; sweepAngle: number }>
  | Readonly<{ kind: "cubic"; start: DiagramPoint; control1: DiagramPoint; control2: DiagramPoint; end: DiagramPoint }>
export type DiagramPathContour = Readonly<{ segments: ReadonlyArray<DiagramPathSegment>; closed?: boolean; hole?: boolean; name?: string }>

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

/** A host-local point is measured from the host's unrotated top-left and scales with it on resize. */
export type DiagramPortAnchor = Readonly<{ kind: "local"; x: number; y: number }>
  /** Vertex indices address DiagramShape.points, or the implicit endpoints of a line shape. */
  | Readonly<{ kind: "vertex"; index: number }>

export type DiagramPortHost = Readonly<{ hostId: DiagramId; anchor: DiagramPortAnchor }>
export type DiagramPort = DiagramEntityBase & Readonly<{ kind: "port"; radius?: number }> & (
  /** Legacy node ports keep their existing node-local x/y contract. */
  Readonly<{ nodeId: DiagramId; x: number; y: number; hostId?: never; anchor?: never }>
  | DiagramPortHost & Readonly<{ nodeId?: never; x?: never; y?: never }>
)

export type DiagramPortRemap = DiagramPortHost

export type DiagramEdgeEndpoint =
  | Readonly<{ kind: "point"; point: DiagramPoint }>
  | Readonly<{ kind: "node"; nodeId: DiagramId }>
  | Readonly<{ kind: "port"; portId: DiagramId }>

export type DiagramEdge = DiagramEntityBase & Readonly<{
  kind: "edge"
  source: DiagramEdgeEndpoint
  target: DiagramEdgeEndpoint
  points?: ReadonlyArray<DiagramPoint>
  /** Cumulative rotation applied to a free edge route; omitted for legacy/unrotated edges. */
  rotation?: number
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
  /** Rectangle-only corner radius in world units; omitted means zero. */
  cornerRadius?: number
  /** Optional local-coordinate vertices for a free polyline shape. Never creates connectivity. */
  points?: ReadonlyArray<DiagramPoint>
  /** Exact line/circular-arc contours in shape-local coordinates. */
  pathContours?: ReadonlyArray<DiagramPathContour>
  shape: "rect" | "ellipse" | "line" | string
}>

/** Free, non-electrical polyline defined by world-space vertices. */
export type DiagramPath = DiagramEntityBase & Readonly<{ kind: "path"; points?: ReadonlyArray<DiagramPoint>; contours?: ReadonlyArray<DiagramPathContour>; metadata?: DiagramMetadata }>

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
export type DiagramTableHeader = Readonly<{
  text: string
  /** Header band height in world units; it extends above the grid. */
  height: number
  horizontalAlign?: DiagramTableHorizontalAlignment
  verticalAlign?: DiagramTableVerticalAlignment
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
  /** Optional title band above the grid. rowCount and height continue to describe data rows only. */
  header?: DiagramTableHeader
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
  snapCandidateQueryCount: number
  snapCandidateCount: number
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
  cornerRadius?: number
  path?: ReadonlyArray<DiagramPoint>
  pathContours?: ReadonlyArray<DiagramPathContour>
  point?: DiagramPoint
  /** Present for port geometry; the point's resolved world position is `point`. */
  hostId?: DiagramId
  anchor?: DiagramPortAnchor
}>

/** Transient rendering settings for connectors. Values are world units and are never serialized. */
export type DiagramConnectorRenderOptions = Readonly<{
  /** Radius used to round route corners. Omit or pass 0 to preserve straight segments. */
  cornerRadius?: number
  /** Add a bridge to the higher-render-order connector at strict unconnected crossings. */
  crossingBridge?: Readonly<{ radius?: number }>
}>

export type DiagramConnectorPathCommand =
  | Readonly<{ kind: "moveTo"; point: DiagramPoint }>
  | Readonly<{ kind: "lineTo"; point: DiagramPoint }>
  | Readonly<{ kind: "quadraticTo"; control: DiagramPoint; point: DiagramPoint }>
  | Readonly<{ kind: "cubicTo"; control1: DiagramPoint; control2: DiagramPoint; point: DiagramPoint }>

export type DiagramConnectorBridge = Readonly<{ point: DiagramPoint; overId: DiagramId; underId: DiagramId; radius: number }>

export type DiagramConnectorRenderGeometry = Readonly<{
  id: DiagramId
  commands: ReadonlyArray<DiagramConnectorPathCommand>
  bridges: ReadonlyArray<DiagramConnectorBridge>
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
  | Readonly<{ type: "createShape"; shape: DiagramShape; historyKey?: string }>
  | Readonly<{ type: "createPath"; path: DiagramPath; historyKey?: string }>
  | Readonly<{ type: "createArc"; id: DiagramId; start: DiagramPoint; through: DiagramPoint; end: DiagramPoint; metadata?: DiagramMetadata; historyKey?: string }>
  | Readonly<{ type: "updateShapePath"; id: DiagramId; points?: ReadonlyArray<DiagramPoint>; pathContours?: ReadonlyArray<DiagramPathContour>; /** Treat pathContours as world-space and canonicalize the resulting shape without rotation/flips. */ worldSpace?: boolean; historyKey?: string }>
  | Readonly<{ type: "insertPathVertex"; id: DiagramId; index: number; point: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "movePathVertex"; id: DiagramId; index: number; point: DiagramPoint; historyKey?: string }>
  | Readonly<{ type: "removePathVertex"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "updateShape"; id: DiagramId; cornerRadius: number; historyKey?: string }>
  | Readonly<{ type: "createTable"; table: DiagramTable; historyKey?: string }>
  | Readonly<{ type: "insertTableRow"; id: DiagramId; index: number; cells?: ReadonlyArray<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "deleteTableRow"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "insertTableColumn"; id: DiagramId; index: number; cells?: ReadonlyArray<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "deleteTableColumn"; id: DiagramId; index: number; historyKey?: string }>
  | Readonly<{ type: "resizeTableRow"; id: DiagramId; index: number; height: number; historyKey?: string }>
  | Readonly<{ type: "resizeTableColumn"; id: DiagramId; index: number; width: number; historyKey?: string }>
  | Readonly<{ type: "updateTableCell"; id: DiagramId; row: number; column: number; cell: Partial<DiagramTableCell>; historyKey?: string }>
  | Readonly<{ type: "updateTableStyle"; id: DiagramId; style: DiagramTableStyleUpdate; historyKey?: string }>
  | Readonly<{ type: "updateTableHeader"; id: DiagramId; header: DiagramTableHeader | null; historyKey?: string }>
  | Readonly<{ type: "groupEntities"; id: DiagramId; ids?: ReadonlyArray<DiagramId>; historyKey?: string }>
  | Readonly<{ type: "ungroupEntities"; ids: ReadonlyArray<DiagramId>; portRemaps?: Readonly<Record<DiagramId, DiagramPortRemap>>; historyKey?: string }>
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
  reason?: "scene-locked"
}>

export type DiagramSweepTrimFindingCode = "invalid-input" | "no-intersection" | "no-boundary" | "ambiguous-boundary" | "unsupported-boundary" | "ambiguous-intersection" | "self-intersecting-stroke" | "topology-ambiguous" | "unsupported-target" | "unsupported-geometry" | "connected-edge" | "locked-target" | "anchored-host"
export type DiagramSweepTrimFinding = Readonly<{
  code: DiagramSweepTrimFindingCode
  targetId?: DiagramId
  message: string
}>
/** World-space path replacement; pass directly to dispatchBatch() to commit one stroke atomically. */
export type DiagramSweepTrimUpdate = Readonly<{
  type: "updateShapePath"
  id: DiagramId
  pathContours: ReadonlyArray<DiagramPathContour>
  worldSpace: true
}>
export type DiagramSweepTrimTargetResult = Readonly<{
  id: DiagramId
  changed: boolean
  /** Exact retained contours in world coordinates, also used to construct preview. */
  retained: ReadonlyArray<DiagramPathContour>
  /** Points where the freehand stroke crossed this target. Kept separately from resolved boundaries. */
  sweepCrossings: ReadonlyArray<DiagramPoint>
  /** Boundary crossings chosen along the target from each sweep crossing. */
  boundaryIntersections: ReadonlyArray<Readonly<{ point: DiagramPoint; boundaryId: DiagramId }>>
  /** @deprecated Use sweepCrossings. */
  cutPoints: ReadonlyArray<DiagramPoint>
  /** Renderer-ready canonical shape matching the result of `update`. */
  preview: DiagramShape | null
  update?: DiagramSweepTrimUpdate
  finding?: DiagramSweepTrimFinding
}>
export type DiagramSweepTrimResult = Readonly<{
  ok: boolean
  targets: ReadonlyArray<DiagramSweepTrimTargetResult>
  updates: ReadonlyArray<DiagramSweepTrimUpdate>
  findings: ReadonlyArray<DiagramSweepTrimFinding>
}>

export type DiagramBatchFailureReason = "revision-mismatch" | "invalid-command" | "unsupported-command" | "operation-id-conflict" | "scene-locked"
export type DiagramBatchResult = Readonly<{
  ok: boolean
  changed: boolean
  revision: number
  documentRevision: number
  failedCommandIndex: number | null
  reason: DiagramBatchFailureReason | null
  affectedIds: ReadonlyArray<DiagramId>
}>
export type DiagramBatchOptions = Readonly<{ expectedRevision?: number; operationId?: string }>
export type DiagramBatchPreviewResult = DiagramBatchResult & Readonly<{ scene?: SerializedDiagramScene }>
export type DiagramValidationIssue = Readonly<{ code: string; severity: "error" | "warning"; entityIds: ReadonlyArray<DiagramId>; message: string }>

export type DiagramInteractionTool = "pan" | "select" | "marquee" | "drag-selection" | "resize-selection" | "resize-table-axis" | "drag-edge-endpoint" | "drag-path-vertex" | "drag-edge-segment" | "connect-edge" | "draw-line" | "draw-path" | "draw-bezier" | "create-port" | "edit-text"

export type DiagramBezierAnchor = Readonly<{ point: DiagramPoint; incoming: DiagramPoint; outgoing: DiagramPoint }>
export type DiagramBezierCreationOptions = Readonly<{ /** Screen-pixel radius for closing onto the first anchor. Defaults to snap tolerance (or 8px). */ closeTolerancePx?: number }>
export type DiagramBezierCreationPreview = Readonly<{
  id: DiagramId
  contour: DiagramPathContour
  anchors: ReadonlyArray<DiagramBezierAnchor>
  activeAnchor: DiagramBezierAnchor | null
  closed: boolean
}>
export type DiagramBezierHandleKind = "anchor" | "incoming" | "outgoing"
export type DiagramBezierHandlePreview = Readonly<{ id: DiagramId; contourIndex: number; segmentIndex: number; handle: DiagramBezierHandleKind; anchorSide?: "start" | "end"; point: DiagramPoint; contours: ReadonlyArray<DiagramPathContour> }>

export type DiagramPortCreationOptions = Readonly<{
  /** Restrict placement to this host; useful when an inspector has already selected it. */
  hostId?: DiagramId
  /** Screen-pixel radius for preferring an existing line/path vertex. Defaults to interaction snap tolerance. */
  vertexTolerancePx?: number
}>
export type DiagramPortCreationPreview = Readonly<{
  id: DiagramId
  hostId: DiagramId
  anchor: DiagramPortAnchor
  point: DiagramPoint
  snapResult?: DiagramSnapResult
}>

export type DiagramResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export type DiagramPointerEvent = Readonly<{
  id: number
  point: DiagramPoint
  shiftKey?: boolean
  /** Native click detail; a value >= 2 completes click-to-place paths. */
  clickCount?: number
}>

export type DiagramTableResizeAxis = "row" | "column"
export type DiagramTableResizePreview = Readonly<{
  id: DiagramId
  axis: DiagramTableResizeAxis
  index: number
  size: number
  width: number
  height: number
  rowHeights: ReadonlyArray<number>
  columnWidths: ReadonlyArray<number>
}>

export type DiagramMarqueeMode = "intersect" | "contain"

export type DiagramInteractionSnapshot = Readonly<{
  tool: DiagramInteractionTool
  active: boolean
  editingLocked: boolean
  previewDelta: DiagramPoint | null
  resizePreview: DiagramResizeEntry | null
  resizePreviewEntries: ReadonlyArray<DiagramResizeEntry>
  tableResizePreview: DiagramTableResizePreview | null
  edgeEndpointPreview: DiagramEdgeEndpointPreview | null
  edgeSegmentPreview: DiagramEdgeSegmentPreview | null
  snapGuides: ReadonlyArray<DiagramSnapGuide>
  snapResult: DiagramSnapResult | null
  snapMarkers: ReadonlyArray<DiagramSnapCandidate>
  constraint: Readonly<{ kind: "axis" | "angle" | "ortho"; axis?: "x" | "y"; angle?: number }> | null
  dynamicInput: DiagramDynamicInputState | null
  edgeCreationPreview: DiagramEdgeCreationPreview | null
  shapeCreationPreview: DiagramShape | null
  pathCreationPreview: Readonly<{ id: DiagramId; vertices: ReadonlyArray<DiagramPoint>; current: DiagramPoint }> | null
  bezierCreationPreview: DiagramBezierCreationPreview | null
  bezierHandlePreview: DiagramBezierHandlePreview | null
  portCreationPreview: DiagramPortCreationPreview | null
  edgeWaypointPreview: Readonly<{ id: DiagramId; points: ReadonlyArray<DiagramPoint> }> | null
  pathVertexPreview: Readonly<{ id: DiagramId; index: number; point: DiagramPoint }> | null
  marquee: DiagramRect | null
}>

export type DiagramEdgeSegmentPreview = Readonly<{
  id: DiagramId
  segmentIndex: number
  axis: "horizontal" | "vertical"
  path: ReadonlyArray<DiagramPoint>
  points: ReadonlyArray<DiagramPoint>
  source: DiagramEdgeEndpoint
  target: DiagramEdgeEndpoint
}>

export type DiagramDynamicInputState = Readonly<{ x: number; y: number; dx: number; dy: number; length: number; angle: number }>
export type DiagramEdgeCreationPreview = Readonly<{
  id: DiagramId
  source: DiagramEdgeEndpoint
  target: DiagramEdgeEndpoint
  points: ReadonlyArray<DiagramPoint>
  path: ReadonlyArray<DiagramPoint>
}>
export type DiagramOrthogonalRouteOptions = Readonly<{ terminalLead?: number; firstAxis?: "horizontal" | "vertical" }>
export type DiagramOrthogonalRouteResult = Readonly<{
  points: ReadonlyArray<DiagramPoint>
  path: ReadonlyArray<DiagramPoint>
  firstAxis: "horizontal" | "vertical"
  diagnostics: ReadonlyArray<Readonly<{ code: "terminal-leads-overlap"; message: string }>>
}>

export type DiagramEdgeEndpointPreview = Readonly<{
  id: DiagramId
  endpoint: "source" | "target"
  point: DiagramPoint
  connection?: DiagramEdgeEndpoint
}>

export type DiagramSnapContext = Readonly<{
  gridSize?: number
  radius?: number
  /** Screen-space snap radius; takes precedence over legacy world-unit radius. */
  tolerancePx?: number
  kinds?: ReadonlyArray<DiagramSnapKind>
  origin?: DiagramPoint
  angleIncrement?: number
  additionalAngles?: ReadonlyArray<number>
  ortho?: boolean
  /** Internal/adaptor opt-in for candidate diagnostics while preserving legacy result shapes. */
  includeCandidates?: boolean
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
  source: DiagramSnapKind | "angle" | "custom" | null
  targetId?: DiagramId
  candidate?: DiagramSnapCandidate
  candidates?: ReadonlyArray<DiagramSnapCandidate>
}>

export type DiagramSnapKind = "grid" | "port" | "endpoint" | "midpoint" | "center" | "intersection" | "perpendicular" | "nearest" | "alignment" | "equal-spacing"

export type DiagramSnapCandidate = Readonly<{
  kind: DiagramSnapKind
  point: DiagramPoint
  targetId?: DiagramId
  distancePx: number
}>

export type DiagramSnapOptions = Readonly<{
  tolerancePx?: number
  gridSize?: number
  kinds?: ReadonlyArray<DiagramSnapKind>
  excludeIds?: ReadonlySet<DiagramId>
  origin?: DiagramPoint
  angleIncrement?: number
  additionalAngles?: ReadonlyArray<number>
  ortho?: boolean
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
  /** Connector endpoint capture radius for ports, in screen pixels. Defaults to tolerancePx. */
  portTolerancePx?: number
  /** Grid spacing in world units. Omit to disable grid snapping. */
  gridSize?: number
  snapToPorts?: boolean
  snapToAlignment?: boolean
  snapToEqualSpacing?: boolean
  kinds?: ReadonlyArray<DiagramSnapKind>
  angleIncrement?: number
  additionalAngles?: ReadonlyArray<number>
  ortho?: boolean
  /** Endpoint drags reattach only when explicitly enabled; default keeps legacy free-point behavior. */
  endpointMode?: "free" | "reattach"
}>
