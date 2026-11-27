# Diagram Core: Orthogonal Connector Routing Audit

**Status:** audit and proposal; no production routing changes made.
**Scope:** `@affino/diagram-core`, `@affino/diagram-vue`, and the current demo/benchmark support.
**Evidence basis:** current working-tree source, existing tests, and the existing `bench-diagram-core.mjs` run against the repository's prebuilt `packages/diagram-core/dist/index.js` on 2026-11-26. The repository already had unrelated working-tree edits when this report was prepared; no such files were changed for this audit.

## Executive assessment

Affino already has a substantial orthogonal-routing foundation: a framework-neutral route function, an exact rectilinear visibility grid, axis-aware search state, obstacle bounds and clearance, directional constraints, ordered waypoints, deterministic tie-breaking, crossing preferences, route diagnostics, and segment/endpoint editing in Core. Vue consumes Core geometry; it does not implement a second routing algorithm.

The main problem is not absence of an algorithm. It is that route construction, endpoint policy, obstacle discovery, edit semantics, and route validity are distributed across `geometry.ts`, `interaction.ts`, and `DiagramEngine.ts`, with different inputs and failure paths. The persisted contract only models `auto`; point arrays otherwise double as legacy/manual geometry. There is no per-port direction, no structured hybrid constraint model, no obstacle-provider policy, and no stable route-validity result associated with an edge. A particularly serious confirmed defect is that source and target host objects are removed from obstacle checking entirely. That permits a route to cross an attached object's interior when its port is interior or its lead points through the object.

Recommendation: evolve the existing Core subsystem incrementally. Keep `routeOrthogonalConnector` as the pure solver boundary initially, extract endpoint/obstacle/constraint preparation and route result normalization around it, and replace the current dense Cartesian-product visibility grid with a sparse rectilinear visibility graph or a proven orthogonal router behind the same Core contract. First fix endpoint escape semantics and explicit failure handling; then add constraints/modes and local manipulation. Do not create another package or any SES-specific concepts.

## 1. Existing model and contracts

### Connector and endpoint data

`DiagramEdge` in [`types.ts`](../packages/diagram-core/src/types.ts) holds stable `id`, `source`, `target`, optional `points`, optional free-edge `rotation`, and optional `routing`. Endpoint variants are free `{kind:"point", point}`, node-bound `{kind:"node", nodeId}`, port-bound `{kind:"port", portId}`, or junction-bound `{kind:"junction", junctionId}`. Edges can therefore attach to ports, object centers, free positions, or existing junctions. There is no separate object-bound endpoint location or direction field.

`DiagramPort` supports legacy node-local coordinates and a host/anchor form. Anchors may be local, shape vertex, or route fraction. `resolvePortPoint` transforms local points through the host's rotation, reflections, and transform origin. The engine's current group contract rejects nested groups (documented in `packages/diagram-core/README.md`); transformation support should not be proposed as if nested-group routing already works.

`DiagramEdgeRouting` currently has only `mode:"auto"`. It stores optional grid behavior, clearance, terminal lead, first axis, connector-level source/target cardinal directions, ordered world-space waypoints, one route hint, bend bounds, and tie-break preference. There is no route mode value for manual or hybrid, no per-port direction, and no typed locked segment/corridor constraints. Legacy edges with no `routing` field use endpoint + stored `points` geometry, which is effectively manual but not explicitly named. In auto mode `points` are not solver input; `serializeScene` writes the currently resolved auto route points into the serialized edge as a derived compatibility/cache value.

### Geometry and rendering ownership

`resolveEndpoint` and `resolvePortPoint` in `geometry.ts` resolve world coordinates. `resolveEdgePath` obtains auto edge route geometry; for non-auto edges it joins endpoints to stored points without enforcing orthogonality. `createEntityGeometry` consumes that result. `connectorRendering.ts` formats resolved paths into render-neutral commands and optional rounded corners/crossing bridges. The Vue `useDiagramConnectorRendering` adapter calls `engine.getConnectorRenderGeometry`; `useDiagramVisibleEntities` creates handles from Core edge geometry. No routing solver exists in Vue.

The core geometry cache is keyed by entity version, and `DiagramSpatialIndex` has uniform-grid indexes for visible/hit/port bounds. Neither is a routing graph or an obstacle/route cache. Route geometry is nevertheless recomputed in `resolveEdgePath` on geometry reads; automatic paths are not persisted as authoritative model state.

## 2. Current algorithm

`routeOrthogonalConnector` in [`geometry.ts`](../packages/diagram-core/src/geometry.ts#L51) is a deterministic rectilinear visibility-grid search, not raster-grid A*. For each leg between source stub, ordered waypoints/hint, and target stub, it:

1. Keeps endpoint coordinates exact; optionally rounds waypoint coordinates to `gridSize` and expands obstacle bounds to strict-grid boundaries. It inflates bounds by `clearance`.
2. Chooses source/target directions (or infers an axis from endpoint delta), then creates terminal stubs of `terminalLead` length.
3. Builds x coordinates from start/end and every obstacle's left/right boundary, and y coordinates from start/end and every obstacle's top/bottom boundary.
4. Creates every Cartesian intersection of those x and y sets that is not inside an obstacle. It connects adjacent visible vertices on each row and column.
5. Searches states keyed by vertex and incoming axis. Candidate ordering is lexicographic: fewer bends, shorter length, fewer crossings, then stable direction/coordinate tie breaks. Crossings are counted against supplied existing manual routes. This means bend count is the primary objective, not a weighted geometric shortest path.
6. Concatenates the leg paths, removes adjacent duplicates and collinear points, and returns the path plus diagnostics. Obstacle boundary touching is allowed; only strict interior intersection is rejected.

Pseudocode:

```text
inflate obstacles by clearance
sourceStub = source + sourceDirection * terminalLead
targetStub = target - targetDirection * terminalLead
for each ordered leg (sourceStub, waypoints..., targetStub):
    X = {leg endpoints x} + {inflated obstacle left/right}
    Y = {leg endpoints y} + {inflated obstacle top/bottom}
    V = {(x,y) for x in X, y in Y if outside all obstacle interiors}
    E = adjacent visible pairs along each row and column
    search (vertex, incoming axis), minimizing bends, then length,
      then crossings, then stable tie-break
join all leg paths, normalize duplicates/collinear points
```

The graph construction is the key scaling risk: with `n` relevant obstacles, each axis has O(n) coordinates, so it materializes O(n²) candidate intersections and checks them against obstacles. Edges are also checked against obstacles by scanning the obstacle list. This is materially different from a sparse visibility graph and can become costly in dense routing regions.

## 3. Lifecycle and editing behavior

### Creation and preview

`DiagramInteractionController.updateEdgeCreationPreview` resolves/captures endpoint geometry, queries the spatial index for nearby node/shape/text/table obstacles, queries nearby legacy/manual edge routes as crossing candidates, then calls `routeOrthogonalConnector`. It applies a `routeHint` to reduce preview route flips and stores the generated points in a transient preview. On pointer up, `commitEdgeCreation` creates the edge in one batch with `routing.mode:"auto"` when auto mode was selected; the route itself is then recomputed from model inputs. Preview and committed edges share the solver, but preparation differs: committed resolution scans all candidate obstacle IDs and all non-auto routes, while preview scopes candidates to a search bounds query. Both globally exclude endpoint hosts.

### Endpoint and waypoint editing

Endpoint handles start in `beginEdgeEndpointHandle`; pointer movement resolves snapping/candidate ports and builds a preview. On pointer up it dispatches `reconnectEdgeEndpoint` for a snapped connection or `moveEdgeEndpoint` for a free point. The command retains edge identity; batched command/history contracts handle the endpoint update. The opposite endpoint remains bound. The preview resolves paths through Core.

Waypoints are editable via `insertEdgeWaypoint`, `moveEdgeWaypoint`, and `removeEdgeWaypoint`. In auto mode those points are stored constraints and every generated route bend remains derived. In legacy mode points are persisted route vertices.

### Segment editing

`beginEdgeSegmentHandle` identifies the selected segment and contiguous collinear run. `updateEdgeSegmentPreview` moves the run along its perpendicular axis, builds elbows where attached endpoints constrain it, normalizes the path, and on auto routes converts the gesture into a waypoint constraint and resolves the automatic route again. Pointer up commits point/end-point/routing changes in a transaction. Thus the auto segment drag can recalculate the whole route on each preview update; it does not preserve an edited segment as a locked segment. The preview path for auto routes is the solver output, while legacy/manual routes use local point manipulation.

### Object movement, transform, and invalidation

`DiagramEngine.collectInvalidatedIds` includes connected edges through node/port dependency maps. It also checks changed obstacle and route bounds against every current auto edge's route bounds, marking intersecting automatic routes invalidated. This catches non-endpoint obstacle movement but scans automatic edges linearly when relevant bounds changed. The bounds are only coarse route bounds, so invalidation is conservative. Geometry/index updates remain Core-owned. Node port positions use resolved host transforms; groups currently transform direct child geometry and nested groups are rejected.

Routing is not run inside rendering adapters, but `resolveEdgePath` is called by geometry construction and serialization/render geometry requests, so routing can occur on geometry reads. This makes getter/render frequency a potentially important cost path. There is no dedicated route-result cache, route dependency cache, obstacle version, or incremental local reroute cache.

## 4. Confirmed defects and root causes

### A. Attached hosts are excluded as whole obstacles

`resolveEdgePath` and edge creation preview remove the entire source and target node/port host from obstacle candidates. This was evidently intended to allow endpoint leads through host geometry, but it also allows arbitrary route segments through that host. It does not define an endpoint escape region and does not check whether the lead exits outward.

**Repro from the current compiled Core:** create a 40×40 node at `(0,0)` with a port at local `(20,20)`, then an auto edge from that port to free point `(-100,20)` using `sourceDirection:"west"`, `terminalLead:12`, and zero clearance. The expected behavior is either an escape diagnostic (since west leaves the port through the host interior) or a route that only enters the allowed escape region. Because the host is excluded, the router accepts a route whose first segment traverses the node interior. This reproducer was verified against `dist/index.js`; source uses the same host exclusion in `resolveEdgePath` and preview.

### B. Direction is an edge option, not a port contract

`DiagramPort` has no direction field; directions are supplied on routing options and are not transformed with a rotated/reflected host. The existing world-space point resolver correctly accounts for port host transforms, but a direction attached to the connector does not rotate with the port. Reconnecting to a different port can therefore retain a direction that no longer reflects that port's orientation. Direction is hard in the solver, but there is no explicit preferred-versus-required distinction.

### C. Manual and automatic contracts are conflated

The persisted routing model only represents auto mode. Legacy `points` mean manual route geometry when `routing` is absent, while `options.mode:"manual"` in the pure solver only has limited local behavior and does not define persistent ownership or validation. There is no hybrid mode or structured lock semantics. The UI's waypoint-handle logic treats auto waypoints as constraints but all interior points as editable vertices for legacy paths.

### D. Automatic failure has inconsistent surface semantics

The pure function reports diagnostics, but returns `points:[]` alongside `path:[source,target]` on no route; that fallback may be diagonal and is unsafe to consume without checking diagnostics. Core `resolveEdgePath` turns most diagnostics into an empty path, losing the structured failure at the edge geometry/headless API. The pointer creation path correctly refuses to commit a preview with any diagnostic except `terminal-leads-overlap`, and auto segment drag rejects a failed preview. However, direct headless `createEdge`/scene construction does not expose or reject route failure as part of a structured route result, and existing routes have no retained valid/stale route status. Callers therefore cannot inspect the reason for an empty resolved path through the normal geometry API.

### E. Segment manipulation re-solves globally for auto edges

The user manipulates one contiguous run, but auto mode converts the gesture to a waypoint then calls full `resolveEdgePath`. The resulting topology may change beyond the selected run, and waypoint placement is approximate (the moved segment midpoint becomes a point constraint rather than a locked segment). There is no obstacle policy for the drag itself beyond whatever route solver does after the constraint is applied.

### F. Candidate/objective behavior is surprising and the search graph is dense

The solver prioritizes bend count before length, then crossings, so the crossing preference cannot justify a longer route if it requires one fewer bend; comments describe crossings as minimized after length. The Cartesian visibility grid has quadratic vertex growth in relevant obstacle count, and repeats obstacle scans. The API exposes no search budget. A region with many nearby shapes can produce a large graph; the existing benchmark has only one local obstacle and does not establish dense-case behavior.

### G. Obstacle policy is implicit

Committed auto routes consider nodes, texts, tables, and shapes; creation previews consider the same categories. Other connectors are crossing candidates only when non-auto/manual. There is no explicit per-entity blocking policy or provider, and groups are not direct obstacle entries. The fixed categories are generic but overly implicit for decorative shapes, text labels, containers, and groups.

### H. Exact endpoint and generated path invariants need an explicit boundary

Exact endpoints are preserved; non-strict routes use exact obstacle bounds and numerical interior tests, and stable coordinate tie-breaks exist. However, route validation is split across solver and `resolveEdgePath`; manual routes are not normalized or checked as orthogonal; failure path fallback can be diagonal; and strict-grid wording says endpoints are grid-restricted although source/target coordinates remain exact. These are contract/documentation inconsistencies, not evidence that every successful auto route is non-orthogonal.

## 5. Reproducible test cases to carry into implementation

Use these as geometry assertions, not screenshot-only checks:

1. **Interior endpoint escape (confirmed):** node `(0,0,40,40)`, source port `(20,20)`, free target `(-100,20)`, west source direction, 12 lead. Current host exclusion permits interior traversal. Assert failure or an explicit permitted escape-only intersection.
2. **Rotated port direction (missing contract):** node `100×60`, east-side port, rotate host 90°. Endpoint point rotates today; direction has no matching port-owned transform. Assert resolved direction is south (or documented cardinalization policy) after adding direction support.
3. **Manual diagonal persistence (current legacy behavior):** edge free points `(0,0) -> (50,30) -> (100,0)` with no `routing`. Current geometry returns these points unchanged. This is valid legacy behavior, but must not be mistaken for a manual orthogonal route contract; mode migration must decide how legacy edges are classified.
4. **Impossible endpoint lead:** place a blocking bound across the required source lead. Pure route API returns diagnostics plus a two-endpoint fallback path; callers that ignore diagnostics can render a diagonal. Assert no result can look successful unless all invariants pass.
5. **Dense obstacles:** generate a fixed-seed block of N non-overlapping obstacles around a single route corridor and record candidate vertex count, solver time, and peak memory. The current benchmark's one obstacle cannot establish dense scaling.

The first case was executed against the prebuilt package. The remaining cases are direct behavioral consequences of the cited source; they should become focused tests before implementation slices land.

## 6. Algorithm evaluation and recommendation

| Strategy | Strengths | Risks in this repository | Assessment |
|---|---|---|---|
| Candidate L/Z/U routes | Very fast for unobstructed/simple geometry; easy to keep stable; excellent first path | Candidate families miss valid routes through complex obstacle arrangements/corridors; complexity grows as special cases | Keep as a fast path only, with full validation and fallback |
| Raster/grid A* | Simple search, direction-aware state/costs, natural budgets | Resolution determines narrow-corridor success and memory; output depends on world scale/grid; document snapping and route discretization become coupled | Do not use as the primary router; no existing routing grid contract beyond optional strict snapping |
| Sparse orthogonal visibility graph | Uses obstacle boundaries, exact coordinates, supports narrow corridors and exact endpoints, naturally matches current bounds/clearance model | Graph construction/search still needs a size budget and spatial filtering; overlapping boundaries/degeneracies and stable tie-breaking require careful handling | Recommended primary strategy, ideally compare with a maintained library before custom replacement |

The current router is already attempting the visibility-graph family but materializes a full Cartesian product. First add instrumentation and dense benchmarks. Then either adopt a proven, dependency-free/acceptable orthogonal router or change construction to a sparse graph with only obstacle corner/offset vertices, endpoint escape vertices, and aligned projections needed for visibility. Search state must retain incoming direction. Use a validated direct/L-route fast path before graph search.

Cost should be explicit and configurable only where it is useful: hard feasibility (finite coordinates, endpoint exactness, orthogonality, required directions, clearance, locked constraints) first; then a deterministic lexicographic or weighted objective for route stability, bends, length, crossings, overlap, and direction preferences. Current behavior's bend-first ordering can be preserved as a documented default if user expectations/tests depend on it, but crossing-vs-length ordering must be corrected or made explicit. Add a `searchBudget` and structured `search-budget-exceeded` failure before production scale claims.

## 7. Target architecture and data model proposal

Keep the package boundary and expose an internal pipeline with one computational owner:

```text
DiagramEdge + resolved scene
  → resolve endpoints/directions (Core geometry)
  → gather policy-selected nearby obstacles and route candidates (Core services)
  → construct constraints and allowed escape regions
  → pure orthogonal router
  → normalize + validate route invariants
  → ResolvedRoute {status, points, diagnostics, cost, dependencies}
  → geometry/render/hit-test/edit/export consumers
```

Candidate internal modules: `internal/DiagramEndpointResolver.ts`, `internal/DiagramObstacleProvider.ts` (or functions on existing engine/index owner), `internal/OrthogonalRouter.ts`, and `internal/DiagramRouteService.ts`. Avoid a new manager class unless measured route lifecycle needs it. `geometry.ts` remains the canonical endpoint/geometry math owner; do not recompute host transform math in router code. Vue only provides pointer/snap/visual gesture wiring.

Proposed persisted shape (illustrative; public API proposal requiring review before implementation):

```ts
type DiagramEdgeRouting = {
  mode: "auto" | "manual" | "hybrid"
  clearance?: number
  endpointEscape?: number
  preferences?: {
    bendPenalty?: number
    lengthWeight?: number
    crossingPenalty?: number
    stabilityPenalty?: number
  }
  constraints?: readonly (
    | { kind: "waypoint"; id: string; point: DiagramPoint; locked?: boolean }
    | { kind: "segment"; id: string; axis: "horizontal" | "vertical"; from: DiagramPoint; to: DiagramPoint; locked?: boolean }
    | { kind: "corridor"; id: string; bounds: DiagramRect; preference: "prefer" | "require" }
  )[]
}
type DiagramPortDirection = { direction: DiagramCardinalDirection; strength: "preferred" | "required" }
```

Do not blindly adopt this literal shape: settle stable IDs/serialization, current `waypoints` compatibility, and whether per-port direction should be an optional `DiagramPort.direction` or endpoint override. Port direction should belong to port geometry; route-level override can explicitly take precedence. For rotated/reflected transforms, transform the local direction vector with the same host transform and deterministically map it to a cardinal axis (largest absolute component; exact ties use a documented stable tie rule). Preferred directions add cost; required directions constrain candidates and can fail.

Return a structured `ResolvedRoute`/`RoutingResult` with `status`, optional valid `points`, and typed `reason`/diagnostics. Never populate `points` with a diagonal fallback on failure. Keep prior geometry only as `previousRoute`/stale display data with `valid:false`; hit testing/export must know it is invalid. Expose headless `getResolvedEdgeRoute(id)` and a recalculation/query method only if the existing geometry snapshot API cannot return route status without breaking consumers. A command for user constraints should remain undoable; derived reroute must not create a history entry.

### Mode semantics

- **Automatic:** endpoint attachments, routing config, obstacles, and soft preferences own the path. Generated bends are derived/cache-only. Reroute only when dependent inputs change.
- **Manual:** intermediate points/segments are explicit user geometry, normalized to orthogonal on edit; object movement adjusts endpoint-adjacent sections while preserving route constraints. Obstacle violations are reported and retained as invalid manual geometry rather than silently erased.
- **Hybrid:** explicit stable constraints (locked waypoint/segment/corridor) own selected route regions; router owns connecting legs. Constraint impossibility returns structured failure and preserves constraints.

Use one solver and a constraint decomposition, not three engines. Migration: `routing` absent + existing `points` stays legacy fixed route initially. Do not silently reinterpret diagonal legacy paths. New manual mode validation can be opt-in or introduced with a documented migration/normalization command.

## 8. Interaction, endpoint, obstacle, and persistence contracts

### Endpoint escape and obstacle policy

Resolve source and target point and transformed direction in Core. Generate an escape point at the configured minimum distance along required/preferred outward direction. Obstacles include both endpoint hosts; allow intersection only inside a narrowly defined host-specific escape region from endpoint to escape point. An interior port can use a deterministic shortest path to the host boundary consistent with its direction, or fail as `blocked-endpoint`; do not make the entire host transparent. For same-host connections, calculate two separate escape regions and route between them. Overlapping hosts may legitimately make escape impossible and should report it.

Use conservative resolved world AABBs, inflated by clearance. Adopt a single boundary policy: touching inflated bounds is allowed, strict interior crossing is forbidden (matching current segment predicate), and document that clearance is measured to the bounds. Add a pure obstacle-provider/policy contract which classifies blockers without hardcoded application semantics; support explicit block/non-block, container/group handling, text/background/decorative exclusions, and other connectors as soft costs. Keep defaults compatible with current scene categories until reviewed.

### Segment drag and endpoint reconnection

For manual/hybrid segment drag, keep both attachments fixed, move the selected segment perpendicular to its axis, adjust its two neighboring segments locally, and normalize only the edited neighborhood. Keep unrelated segments stable. Check hard obstacles before commit. Recommended policy: show a transient invalid preview when pointer passes through an obstacle, snap only under existing explicit snap rules, and reject commit with a typed violation while preserving the prior route. This preserves pointer predictability and avoids hidden route jumps; it also gives clear feedback. For auto mode, either treat drag as creation/movement of a locked hybrid segment/constraint or define it explicitly as a temporary preference; it must not deceptively look locked if it will be discarded on reroute.

Endpoint reconnection remains one atomic command on pointer-up: retain connector ID/metadata, resolve snapped port exactly, update endpoint binding and route constraint in one patch, and preserve opposite attachment. During drag, retain current binding until commit; preview must use the candidate's resolved endpoint and same router/obstacle policy. Undo/redo reverts the patch, while derived geometry updates through dependency invalidation.

### Stability and invalidation

Use route dependency records for endpoint hosts/ports/junctions, obstacle bounds/policy versions intersecting a local route search region, and routes that affect crossing/overlap costs. Existing dependency indexes for attachments are a good base. Index obstacles and route segments spatially; query a bounded route region for route solving and invalidation. Cache only with a key that includes endpoints, directions, constraints, obstacle IDs/versions/bounds/policy, and routing configuration. Validate the old route first after small moves; preserve it if valid and within a bounded stability cost. Otherwise reroute with the previous route as a soft corridor/topology preference. Moving an obstacle into a path invalidates even unattached routes. Multi-object movement should coalesce one transaction and one relevant route update set.

Rendering should consume a resolved route snapshot, not invoke a fresh solver for every renderer path request. If preview performance needs a cheaper mode, it should use the same validation and endpoint contracts and predict the final route; benchmark pointer-move p50/p95/p99 separately from commit.

### Persistence/history compatibility

Persist connector ID, endpoints, explicit mode, user constraints, and per-edge config. Keep generated geometry derived; if serialization continues emitting `points` for compatibility, mark/define them as a cache that auto mode ignores and refreshes deterministically. Existing scene serialization currently writes generated points for auto edges, so removing that field risks snapshot consumers and deterministic older-document behavior. Add schema/version migration only after checking `SerializedDiagramScene` and document compatibility expectations. Route recalculation must not add history entries. Existing commands `createEdge`, `reconnectEdgeEndpoint`, endpoint/waypoint edit commands, `updateEdgeRouting`, `dispatchBatch`, undo/redo, and headless `createDiagramEngine` should remain the operation surface; extend rather than create parallel CRUD APIs.

## 9. Performance baseline and limitations

Ran the existing `scripts/bench-diagram-core.mjs` against the prebuilt Core package with 1k/5k/10k entity fixtures. It writes output to `/tmp`, so no benchmark artifact was added to the repository. The routing workload warms the engine/query and samples candidate obstacle query + direct `routeOrthogonalConnector` 100 times with exactly one local obstacle; it does **not** exercise dense obstacle graphs, connected auto-edge getter recalculation, route invalidation under object movement, or pointer preview. The script reports p50/p95 only, not p99.

| Entities | Route candidate search + solve p50 | p95 | Candidate obstacles |
|---:|---:|---:|---:|
| 1,000 | 0.027 ms | 0.055 ms | 1 |
| 5,000 | 0.015 ms | 0.024 ms | 1 |
| 10,000 | 0.014 ms | 0.020 ms | 1 |

These are one local obstacle microbench numbers and vary with runtime/JIT; they are not evidence of large-diagram routing scale. Existing general engine drag dispatch was approximately 0.97–1.41 ms in this run, but that workload is not connector pointer preview. Before algorithm selection is finalized, add a fixed-seed dense obstacle benchmark varying local obstacle count and route count; record graph vertices/edges, p50/p95/p99, memory, preview pointer-move latency, commit latency, and route validity. Preserve a large unobstructed fast-path baseline. No invented latency target is recommended before that baseline exists.

## 10. Playground proposal

Extend the existing `packages/demo-vue/src/pages/DiagramPage.vue` only after the core contracts stabilize. Use Core entities/commands for draggable objects, four-sided ports, free endpoints, obstacles, segment/waypoint dragging, reconnection, rotation/reflection, and mode/clearance controls. Add a reset-to-auto command. Debug visuals should be a separate overlay driven by a Core diagnostic snapshot (endpoints, transformed direction, escape points, inflated AABBs, constraints, graph/candidate route, cost/failure); never insert debug graphics into scene state. The current page is a broad diagram/geometry demo and has port examples, but no dedicated connector-routing workbench.

## 11. Proposed implementation slices

1. **Contracts and baseline:** document current legacy semantics; add invariant helpers and deterministic obstacle-heavy benchmark with seed and route metrics. No public API change.
2. **Resolved route and endpoint escape:** introduce structured route status in Core geometry; preserve endpoint hosts as obstacles with allowed escape regions; unify committed and preview route-input preparation; make impossible creation non-committable. Add endpoint, same-host, interior-port, and failure tests.
3. **Sparse solver and costs:** compare present solver against a sparse visibility implementation/library on fixed benchmark cases; enforce hard constraints and deterministic lexicographic tie-break; add budget/failure reporting. Keep the old route option API as adapter where possible.
4. **Explicit obstacle policy and invalidation:** query indexed candidates, classify generic blockers, maintain obstacle/route dependencies and route cache keys. Add object-moves-into-route and unrelated-route invalidation tests.
5. **Route mode/constraint migration:** propose and approve public schema; add `manual`/`hybrid`, stable waypoint/segment constraints, compatibility deserialization/serialization, and undoable constraint commands. Keep old missing-routing edges fixed as legacy until migration policy is accepted.
6. **Editing stability:** local segment manipulation and obstacle feedback, endpoint reconnection preview with resolved port directions, coalesced automatic reroute on object move/resize, undo/redo/transaction tests.
7. **Headless and playground integration:** expose route status/query/constraint operations through existing engine, extend demo controls/debug overlay, and document headless creation/query/reconnect behavior.
8. **Release validation:** run Core and Vue focused typecheck/tests, deterministic randomized invariants, dense benchmark p50/p95/p99, and migration review. Update package docs/changelog after public contract approval.

## 12. Expected files and subsystems

- Core contracts and commands: `packages/diagram-core/src/types.ts`, `DiagramEngine.ts`, `index.ts`.
- Endpoint, route solve, validation: `packages/diagram-core/src/geometry.ts` initially; likely new framework-neutral internals under `src/internal/` after the contracts are proven.
- Route lifecycle/index/cache: `src/internal/DiagramGeometryService.ts`, `DiagramSpatialIndex.ts`, and `DiagramEngine.collectInvalidatedIds` / dependency indexes.
- Interaction: `packages/diagram-core/src/interaction.ts` for preview, segment edits, reconnection, and commit transaction behavior.
- Render integration: `connectorRendering.ts` and `packages/diagram-vue/src/useDiagramConnectorRendering.ts`; preserve renderer-only responsibility.
- Coverage: `packages/diagram-core/src/__tests__/diagramEngine.test.ts`, `packages/diagram-vue/src/__tests__/diagramVue.test.ts`; add dedicated route tests if file size warrants it.
- Bench/demo/docs: `scripts/bench-diagram-core.mjs` or a focused sibling, `packages/demo-vue/src/pages/DiagramPage.vue`, package READMEs, and a routing contract document.

## 13. Backward compatibility, risks, and decisions for review

- **Legacy geometry:** un-routed edges may be diagonal and are currently fixed point paths. Treating all such edges as manual orthogonal would break scenes; preserve as legacy until explicit migration.
- **Auto serialized points:** serialization currently emits derived route points. Removing or changing that behavior can affect snapshot equality, persisted documents, clipboard, and older consumers.
- **Current routing options:** preserve `terminalLead`, `clearance`, `firstAxis`, directions, waypoints, routeHint, bend limits, and tieBreak through adapters/deprecation. `strictGrid`'s endpoint wording needs clarification because endpoints remain exact.
- **Route failure:** whether a failed automatic route leaves an edge in the document with `valid:false` or rejects creation is a product/API decision. Recommendation: reject a newly created unroutable auto edge; preserve an existing edge with an explicit invalid route result and stale display geometry marked invalid.
- **Port direction:** decide whether directions are local to ports, endpoint overrides, or both; set precedence and transform/cardinalization policy.
- **Obstacle policy:** decide default classifications and whether text/tables block. Proposed API should allow provider callbacks without putting application-specific logic in Core.
- **Manual mode:** choose whether commands normalize invalid geometry immediately or accept-and-report invalid routes; preserve the current legacy behavior for old documents.
- **Algorithm choice:** benchmark sparse graph/custom vs a maintained router before committing to implementation. Dense graph risk is confirmed by construction, but no current dense performance failure has been measured.
- **Connected route crossing semantics:** current bridges are render-only and explicit junctions represent topology. Keep this contract; crossing/overlap minimization should remain soft and never create logical attachments.
- **Transforms:** port points resolve rotations/reflections and transform origins; nested groups are unsupported today. Route direction transformation must follow the same host transform API. AABBs for rotated geometry are conservative and may block wider corridors than exact shapes.
- **No production router change in this iteration.** The public API proposals above should be reviewed before coding, consistent with the project API-change rule.
