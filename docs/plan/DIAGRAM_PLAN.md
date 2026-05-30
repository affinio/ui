Цель
  Собрать два пакета:

  - @unitlab/diagram-core: headless TypeScript core, без Vue, DOM, SLD, stores.
  - @unitlab/diagram-vue: Vue adapter/rendering layer над core.

  SLD editor потом становится thin feature package: импортирует SCD/SLD, маппит в generic diagram
  scene, подключает toolbar/domain actions.

  Target Architecture

  scd-sld-core
    SCD/SLD domain parsing, generated SLD document

  switchgear-sld-adapter
    SldDocument <-> DiagramScene
    switchgear bindings <-> diagram metadata

  diagram-core
    scene model
    commands
    selection
    viewport
    spatial index
    hit testing
    snapping
    undo/redo
    serialization

  diagram-vue
    composables
    SVG/Canvas/DOM render adapters
    pointer/keyboard event bridge
    overlays/handles/context menu anchors

  SwitchgearSingleLineDiagram.vue
    feature orchestration only

  Implementation status

  - Slice 0: implemented for core-level baseline in `scripts/bench-diagram-core.mjs`; writes 1k/5k/10k model metrics to `artifacts/performance/bench-diagram-core.json`. Browser profile notes remain for the Vue/editor migration slices.
  - Slices 1-7: implemented in `packages/diagram-core` as a headless package with normalized scene state, geometry cache, uniform-grid spatial indexes, command/history engine, interaction controller, and snapping APIs.
  - Slices 8-10: implemented in `packages/diagram-vue` as Vue lifecycle/composable bindings, SVG/DOM render projection helpers, pointer bridge, viewport resize bridge, and visible projection lists driven by core viewport queries.
  - Package naming follows the current monorepo scope: `@affino/diagram-core` and `@affino/diagram-vue`.
  - Editor must-have slice: implemented in core and the Vue demo with clipboard import/export/duplicate, id remapping, z-order/layer commands, resize commands, rotation-aware resize-handle previews, waypoint edits, keyboard helpers, additive/toggle/containment selection modes, lock constraints, fit helpers, capability checks, query/search primitives, and diagnostics/perf counters.

  Slice 0: Baseline
  Сначала зафиксировать текущую боль, иначе легко “улучшить” архитектуру без доказательства.

  Deliverables:

  - lightweight perf harness for 1k, 5k, 10k entities;
  - metrics: initial render, visible/entity query latency, pan FPS, drag latency, selection latency, memory, Vue component count;
  - one reproducible fixture.

  Validation:

  - Vitest benchmark-like unit for model ops;
  - manual browser profile notes.

  Slice 1: Core Package Skeleton
  Создать diagram-core без UI.

  Public API:

  createDiagramEngine(initialScene)
  engine.getScene()
  engine.dispatch(command)
  engine.queryVisible(bounds)
  engine.hitTest(point)
  engine.subscribe(listener)

  Core entities:

  DiagramNode
  DiagramEdge
  DiagramText
  DiagramShape
  DiagramPort
  DiagramGroup
  DiagramSelection
  DiagramViewport

  Rules:

  - ids are stable;
  - normalized maps, not arrays as source of truth;
  - metadata bag allowed, but typed domain adapter owns domain meaning.

  Validation:

  - scene create/load/serialize tests;
  - no Vue dependency.

  Slice 2: Normalized Scene Store
  Replace array-first mental model with indexed scene state.

  Core state:

  entities: {
    nodesById
    edgesById
    textsById
    shapesById
    portsById
  }
  order: {
    nodeIds
    edgeIds
    textIds
    shapeIds
  }

  Deliverables:

  - immutable snapshot reads;
  - transactional mutation API;
  - changed id tracking.

  Why:

  - dragging one edge must not recreate all edges;
  - selection must not rebuild all rendered objects.

  Validation:

  - update one entity changes only one version stamp;
  - serialize/deserialize roundtrip.

  Slice 3: Geometry Cache
  Add cached bounds and resolved geometry.

  Cache examples:

  - node bounds;
  - text bounds;
  - shape bounds;
  - edge endpoints;
  - edge path;
  - port positions.

  Invalidation:

  - node move invalidates node bounds, ports, connected edges;
  - text edit invalidates text bounds;
  - viewport move invalidates no entity geometry.

  This directly attacks current resolvedEdgePoints() and collectBindablePorts() cost.

  Validation:

  - moving one node invalidates only connected edges;
  - repeated reads return cached geometry.

  Slice 4: Spatial Index
  Add viewport and hit-test index.

  Use either:

  - simple uniform grid index first;
  - rbush later if measured better.

  Indexes:

  - visualBoundsIndex;
  - hitBoundsIndex;
  - portIndex.

  Queries:

  queryVisible(worldRect)
  hitTest(point, options)
  nearestPort(point, radius, exclude)

  Validation:

  - visible query returns same result as brute force;
  - nearest port matches brute force;
  - benchmark 1k/10k entities.

  Slice 5: Command Engine
  Introduce explicit commands with inverse patches.

  Commands:

  - moveEntities;
  - moveNode;
  - moveEdgeEndpoint;
  - createEdge;
  - deleteSelection;
  - setSelection;
  - editText;
  - setViewport.

  Undo/redo:

  - store inverse patches, not full snapshots;
  - group pointer drag into one history command.

  Validation:

  - undo/redo exact roundtrip;
  - drag command produces one history entry;
  - delete restores all affected entities.

  Slice 6: Interaction State Machine
  Move tools out of Vue component.

  Tools:

  - pan;
  - select;
  - marquee;
  - drag selection;
  - connect edge;
  - edit text.

  Important:

  - pointermove is batched through requestAnimationFrame;
  - transient drag preview does not commit model on every raw event;
  - final pointerup commits command.

  Validation:

  - simulated pointer stream commits bounded updates;
  - drag preview state clears on cancel;
  - selection semantics covered.

  Slice 7: Snapping Core
  Make snapping index-backed.

  Snap providers:

  - grid snap;
  - port snap;
  - alignment guides;
  - angle constraint;
  - custom domain snap hooks.

  API:

  engine.snapPoint(point, context)
  engine.snapTranslation(selection, delta, context)

  Validation:

  - nearest port is O(log/indexed) or grid-bucket bounded;
  - excludes moving selection;
  - deterministic tie-breaking.

  Slice 8: Vue Package Skeleton
  Create diagram-vue.

  Core composables:

  useDiagramEngine()
  useDiagramViewport()
  useDiagramSelection()
  useDiagramVisibleEntities()
  useDiagramPointerController()

  Vue package must not implement business rules. It only bridges:

  - refs;
  - lifecycle;
  - DOM events;
  - render lists;
  - overlays.

  Validation:

  - composables mount/unmount cleanly;
  - no leaked window listeners;
  - viewport resize updates engine.

  Slice 9: Renderer Adapter
  Start with SVG/DOM hybrid, not full Canvas rewrite.

  Recommended first split:

  - SVG for edges, shapes, ports, marquee;
  - static text renders as SVG `<text>`/`<tspan>`; DOM overlay only for the single active text input, menus, selected controls;
  - one context menu instance, not one per node.

  Later option:

  - Canvas/WebGL renderer for large static background;
  - SVG/DOM for selected/editable foreground.

  Validation:

  - 1k elements render with bounded Vue components;
  - selected handles update without rerendering all entities.

  Slice 10: Vue Virtual Scene Projection
  Expose visible render model from core.

  visibleNodes
  visibleEdges
  visibleTexts
  visibleShapes
  activeHandles
  overlayAnchors

  Requirements:

  - viewport pan must query spatial index;
  - selection always included even if outside viewport when needed;
  - no full scene map/filter in Vue computed.

  Validation:

  - panning does not rebuild all entity view models;
  - visible list stable across small viewport movements;
  - no blank viewport.

  Slice 11: SLD Adapter
  Only now wire existing SLD.

  Package/module:
  switchgear-sld-adapter

  Responsibilities:

  - SldDocument -> DiagramScene;
  - current StoredDiagramState -> DiagramScene;
  - DiagramScene -> StoredDiagramState;
  - switchgear/domain metadata mapping.

  Do not put these in core:

  - switchgear ids;
  - IEC 61850 paths;
  - device/channel allocation;
  - report/runtime state.

  Validation:

  - existing import adapter tests migrate;
  - old saved diagrams load;
  - generated SLD overlay roundtrips.

  Slice 12: Switchgear Editor Migration
  Replace internals of SwitchgearSingleLineDiagram.vue.

  Keep UI shell:

  - toolbar;
  - import modal;
  - switchgear control toolbar;
  - route integration;
  - stores/toasts.

  Remove from component:

  - geometry math;
  - snapping;
  - hit testing;
  - undo/redo;
  - full scene arrays;
  - pointer drag logic.

  Validation:

  - existing workflows: pan, zoom, select, drag, connect, edit text, import, save, undo/redo.

  Slice 13: Performance Gate
  Add CI-ish guard for editor core.

  Minimum benchmarks:

  - create 10k entities;
  - query viewport;
  - drag one node with 20 connected edges;
  - marquee select over 10k;
  - nearest port lookup;
  - serialize scene.

  Report thresholds should be loose at first, then tightened.

  Migration Order

  1. Build core with tests beside current editor.
  2. Add adapter and render a read-only preview from current SLD state.
  3. Add selection/hit testing.
  4. Add drag/pan/zoom.
  5. Add editing/commands/undo.
  6. Switch production editor to new engine.
  7. Delete old editor internals.

  Do Not Do First

  - Do not start by moving everything to Canvas.
  - Do not make SLD concepts first-class in diagram core.
  - Do not keep Vue reactive arrays as source of truth.
  - Do not use full snapshots for drag history.
  - Do not create one Vue menu/control subtree per rendered entity.

  First Concrete PR
  feat(diagram-core): add normalized scene and geometry cache

  Scope:

  - new package;
  - entity types;
  - scene create/update;
  - geometry cache;
  - unit tests;
  - no Vue, no SLD migration yet.