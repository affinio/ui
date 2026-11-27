# Orthogonal connector implementation status

This is the implementation follow-up to [the routing audit](./diagram-orthogonal-routing-audit.md). It records the connector work in the current working tree and separates verified Core behavior from browser behavior that could not be exercised here.

## Implemented architecture

The existing `DiagramEdge` remains the model. Endpoint references continue to use point, node, port, and junction variants. Core resolves endpoint world coordinates through `resolveEndpoint()` and the existing transform/port APIs. `resolveEdgePath()` is the authoritative route geometry boundary used by geometry snapshots and rendering projections. The Vue adapter does not calculate routes.

The public `routeOrthogonalConnector()` retains the coordinate-compressed obstacle-aware visibility-graph route when `strategy` is omitted or set to `"obstacle-aware"`. `strategy: "simple"` selects `routeSimpleOrthogonalConnector()`, a deterministic candidate solver that does not read scene obstacles or existing connector paths. It considers direct, L-shaped, Z-shaped, and U-shaped families; candidates are normalized and direction checked, then ordered by route hint retention, bend count, length, first-axis preference, and coordinate tie-break. Hard direction and bend constraints can return an empty route with a diagnostic. No diagonal fallback is treated as success.

Interactive creation defaults to `simple` when no routing mode was explicitly requested. Supplying `mode: "auto"` without a strategy retains the legacy obstacle-aware behavior; callers can now select it explicitly with `strategy: "obstacle-aware"`. The `/diagram` Connector tool explicitly selects `simple`, so normal interactive creation can cross shapes and other connectors. This is a compatibility bridge: omission on the standalone route API still means the legacy advanced strategy.

`normalizeOrthogonalRoute()` is the shared finite-coordinate, duplicate, collinearity, reversal, and orthogonality validator. The new `setEdgeRoute` command validates the full resolved route and stores intermediate points with `routing.mode: "manual"`; its patch preserves edge identity and is undoable. Manual route resolution retains stored interior points and repairs only endpoint legs if their resolved coordinates change. Unrouted legacy edges keep their old straight/diagonal point semantics. Simple automatic segment dragging adjusts the selected segment locally and commits the exact edited route as manual geometry rather than running the automatic solver again.

Automatic endpoint preview now substitutes the candidate endpoint into an isolated entity view and calls Core geometry resolution, so the route displayed for the endpoint candidate is the same calculation used after the endpoint command commits. Creation preview and commit use one captured route candidate/options set; `routeHint` keeps the simple auto candidate on the displayed side where feasible, while endpoint alignment still simplifies to a direct route. The playground starts a free connector on an empty-canvas click, supports click-to-place bends, exposes Finish route/Cancel route controls, supports Enter/Escape, and renders Core's transient route as a polyline.

## Files and API surface

- `packages/diagram-core/src/geometry.ts`: simple candidate route strategy, shared normalization, explicit manual route resolution, no diagonal fallback on advanced-route failure.
- `packages/diagram-core/src/interaction.ts`: simple interactive default, shared candidate preview, local simple segment edits, manual ownership transition, and selective route preview invalidation.
- `packages/diagram-core/src/types.ts`: optional strategy and manual route ownership; `setEdgeRoute` command.
- `packages/diagram-core/src/DiagramEngine.ts`: command validation, history patch, and route ownership update.
- `packages/demo-vue/src/pages/DiagramPage.vue`: free canvas connector tool and transient route preview controls.
- `packages/diagram-core/README.md`, package changelogs, and this status report: public behavior and compatibility notes.

No separately published package or routing dependency was added. Existing endpoint, attachment, transform, junction, selection, render, and history infrastructure remains in use.

## Gesture contract in the current playground

With Connector selected, pointer down on the canvas begins the route at a free point or existing snap target. Clicking later canvas positions places explicit route bends. Move updates the active terminal preview. Finish route or Enter commits; Cancel route or Escape cancels. Explicitly placed bends are persisted as manual route points. A drag-only simple connector without placed bends remains automatic. The ghost is a transient SVG polyline from `edgeCreationPreview.path` and is not a scene entity.

This UI is not yet a complete professional connector workbench. It does not expose a full fixture reset/debug panel, route mode control, junction creation gesture, port-direction configuration, or rich valid/invalid attachment presentation. Axis hysteresis, jitter filtering, pointer capture-loss acceptance, stacking disambiguation, and all zoom-level segment interactions still need browser validation.

## Regression evidence

Executed on 2026-11-26:

| Check | Result | Evidence |
|---|---|---|
| Core build | PASS | `pnpm --filter @affino/diagram-core build` |
| Core tests | PASS, 216/216 | `packages/diagram-core/src/__tests__/diagramEngine.test.ts` |
| Vue build | PASS | `pnpm --filter @affino/diagram-vue build` |
| Vue tests | PASS, 55/55 | `packages/diagram-vue/src/__tests__/diagramVue.test.ts` |
| Playground type check | PASS | `pnpm --filter demo-vue type-check` |
| Playground production build | PASS | `pnpm --filter demo-vue build` |
| Diff whitespace check | PASS | `git diff --check` |
| Playwright/browser (R1) | NOT RUN | At the time of the R1 run, the default browser install had no Ubuntu 26.04 ARM64 build. R2 installed a compatible Ubuntu 24.04 ARM64 Chromium build and supersedes this status; see the R2 addendum below. |

Focused Core regressions cover exact straight routes, one-bend routes, direction-constrained Z and U routes, deterministic results, conflicting directions, non-finite input rejection, creation preview/commit equality, local segment edit/manual ownership/undo, and preservation of manual interior points after an attached host moves. Existing advanced obstacle-aware and Vue opt-in routing tests also pass.

## Browser acceptance status

See the R2 addendum for browser execution, current acceptance results, screenshots, and trace. That run supersedes the earlier environment limitation stated here.

## Performance sample

The existing diagram benchmark was extended to report p99 and to include simple route calculation and transient Core creation-preview distributions. `pnpm --filter @affino/diagram-core bench` ran on the built working tree with the existing 1,000 / 5,000 / 10,000 entity fixtures. Milliseconds:

| Scene entities | Simple route p50 / p95 / p99 | Simple Core preview p50 / p95 / p99 | Existing obstacle route p50 / p95 / p99 |
|---:|---:|---:|---:|
| 1,000 | 0.014 / 0.037 / 0.073 | 0.025 / 0.073 / 0.138 | 0.037 / 0.134 / 0.233 |
| 5,000 | 0.011 / 0.023 / 0.053 | 0.045 / 0.179 / 0.240 | 0.028 / 0.040 / 0.071 |
| 10,000 | 0.006 / 0.008 / 0.014 | 0.024 / 0.038 / 0.126 | 0.014 / 0.018 / 0.025 |

These are local microbenchmarks of 200 pure route calls and 100 transient Core previews per sample, not Vue pointer-frame timings. The existing obstacle sample has one relevant obstacle. No pre-change multi-scenario baseline was recorded, so these numbers are current measurements only and do not establish a speedup. Preview measurements are noisy at this scale and are not a frame-rate claim.

## Incomplete requirements and risks

- The requested dedicated Connector Workbench and reproducible route fixtures have not been built; the existing 1,000-entity diagram page received basic creation controls only.
- UI01–UI30, screenshot artifacts, pointer jitter/hysteresis, attachment feedback states, segment snapping/disambiguation, junction creation interaction, save/reload interaction checks, and zoom-level browser checks remain unverified or unimplemented.
- Manual ownership is represented by `routing.mode: "manual"` plus `edge.points`; there is no persisted constraint kind, locked segment, corridor, route validity query API, or endpoint escape-point model. The simple strategy intentionally has no obstacle avoidance or endpoint escape routing.
- The public route solver currently recognizes source/target direction options, but `DiagramPort` still has no port-direction field. Direction transformation and port-level preferred/required direction policy remain future work.
- Manual endpoint-leg repair keeps the internal route stable and may slide the first/last adjacent bend in derived geometry when an attached endpoint moves; stored manual `edge.points` are not rewritten by that resolution. The original terminal axis is not persisted as a separate constraint.
- The benchmark does not measure Vue pointer rendering, segment drag, attached-object drag, multi-connector movement, 10,000 stacked connectors, or p99 browser event latency.
- Pre-existing transform-origin work in the working tree was not part of this connector slice and remains alongside it.

## Slice assessment

| Slice | Status |
|---|---|
| R1 routing contract and simple route regressions | Partial: implemented simple families, normalization, and focused mathematical checks; no broad randomized corpus. |
| R2 shared preview and commit pipeline | Partial: Core creation and endpoint candidate geometry share Core resolution; no browser preview equality suite. |
| R3 free connector drawing | Partial: canvas start, click bends, finish/cancel controls wired; no jitter/hysteresis or browser acceptance. |
| R4 local segment manipulation | Partial: simple route segment edits become manual geometry and undo; advanced legacy remains solver-based. |
| R5 endpoint adjustment | Partial: existing reconnect/move commands retained; auto preview uses candidate route resolution, manual route endpoints repaired. |
| R6 snapping, stacking, junctions | Existing Core snapping/junction models retained; requested segment attachment/disambiguation and dedicated browser cases not completed. |
| R7 transformations and performance | Existing endpoint transform resolution reused; benchmark subset measured; full browser and movement latency suite not completed. |
| R8 browser acceptance and release validation | Not complete: Chromium missing, so the mandatory browser suite could not run. |

## R2 implementation and browser acceptance addendum (2026-11-27)

R2 extends the playground with a focused `/diagram/connectors` Connector Workbench using the production Core pointer controller, rendering, route resolver, endpoint/segment edit handles, snapping, and history. Fixtures cover free creation, aligned horizontal/vertical, perpendicular, offset and same-facing ports, manual routes, overlapping connectors, junctions, and transformed hosts. Fixture reset, Connector/Select, route reset, undo/redo, and an optional diagnostic overlay are available.

### Gesture and preview contract

- Pointer down begins a route on empty canvas or a captured attachment target. Pointer movement maintains a full Core candidate; pointer up commits without requiring Finish. A click places/retains a bend; movement direction changes create route turns. Escape, pointer cancellation/lost capture, and tool change clear the transient gesture.
- Dragging a route segment previews a local edit and commits that exact route as manual geometry. Endpoint edits preview resolved port/point candidates and retain connector identity. Explicit Shift junction branching uses existing junction topology; geometric crossings and segment snaps remain independent.
- Workbench captures normalized route points and endpoint bindings from the last Core preview and committed rendered geometry. The final browser run recorded `previewEqualsCommit: true` and `orthogonal: true` in all 19 cases that emitted preview/commit geometry records, including free routes, multi-bends, port creation, endpoint attachment/detachment, endpoint snapping, creation undo/redo, and changed viewport zoom. `artifacts/diagram-connectors/acceptance-results.json` contains the executed records.

### Browser setup and artifacts

Repository tooling is pnpm 12.4.2 and Playwright 1.58.2. Default `pnpm exec playwright install chromium` failed because Playwright has no Ubuntu 26.04 ARM64 browser build. The compatible install succeeded with `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-arm64 pnpm exec playwright install chromium` and the matching `... install-deps chromium`. Chromium 145.0.7632.0 launched and executed `node scripts/smoke-diagram-connectors.mjs`; the existing `node scripts/smoke-components-demo.mjs` also passed. Screenshots and `connector-acceptance.trace.zip` are under `artifacts/diagram-connectors/` (workbench, free/L/multi-bend ghosts, committed routes, port snapping/reconnect, segment edit, stacks and selected stacks, and explicit junction).

### Browser matrix

PASS means the named interaction was executed in Chromium by the R2 smoke runner; it does not claim unimplemented subcases beyond the named case. UI14 is covered by UI12's reconnect action. UI41 serialization reload and UI43 explicit advanced-router compatibility are not exercised in the browser runner.

| Scenario | Status | Browser evidence / note |
|---|---|---|
| R2-UI01–UI09 | PASS | Free horizontal/vertical, L, multiple bends, jitter, backtracking, port-port, port-free, free-port; route/equality assertions. |
| R2-UI10–UI14 | PASS | Free endpoint attachment, aligned attachment, source/target detach, reconnect; endpoint binding/identity assertions and geometry evidence. |
| R2-UI15–UI20 | PASS | Middle vertical/horizontal, first/last attached, straight segment, collapse; orthogonality and preview/commit checks for edited routes. |
| R2-UI21 | PASS | Connected host movement updates an orthogonal route. |
| R2-UI22 | FAIL | Offset attached ports moved toward alignment; endpoint ends at y=185.000007338954 while source is y=185, producing a 3-point route with a 0.000007338954 vertical tail. This is below visual scale but does not meet the exact two-point straight-route contract; the test is not tolerance-adjusted. |
| R2-UI23–UI30 | PASS | Manual route preservation, rotate/reflect, stacking/selectability, segment snap, crossing, explicit junction plus undo. |
| R2-UI31–UI40 | PASS | Creation/segment/endpoint cancellation, tool change, lost capture, create/edit/attach history, reset route, viewport zoom. Pointer-cancel was also run as supplementary `R2-UI35a`. |
| R2-UI41 | NOT RUN | Workbench does not yet exercise save/reload. |
| R2-UI42 | PASS | Unrelated host movement does not reroute a free simple connector. |
| R2-UI43 | NOT RUN | No browser fixture invokes the explicitly selected obstacle-aware strategy. Core/API compatibility tests remain separate. |

### Current validation

| Check | Result |
|---|---|
| Browser matrix | 40 PASS, 1 FAIL out of 41 executed browser checks; UI22 is detailed above. UI41 and UI43 are NOT RUN. |
| Preview geometry evidence | 19 recorded cases all matched the committed full polyline and passed orthogonality checks. |
| Chromium | PASS, 145.0.7632.0 using Ubuntu 24.04 ARM64 override/dependencies. |
| Core build | PASS (`pnpm --filter @affino/diagram-core build`). |
| Vue build | PASS (`pnpm --filter @affino/diagram-vue build`). |
| Demo type check | PASS (`pnpm --filter demo-vue type-check`). |
| Demo production build | PASS (`pnpm --filter demo-vue build-only`). |
| Existing component browser smoke | PASS (`node scripts/smoke-components-demo.mjs`). |
| Core tests | FAIL, 230/232 pass. One group deletion assertion differs by floating-point roundoff (~1e-14); one mixed grouped-selection reflection expectation fails. |
| Vue tests | FAIL, 55/57 pass. Two group/table transform tests fail; connector numeric-input preview/commit test passes. |
| `git diff --check` | PASS. |

The Core/Vue test failures concern retained group/selection/table transformations present in this working tree, not orthogonal connector paths. They remain unresolved and prevent a claim that the package suites pass. The browser UI22 subpixel alignment is a connector-facing unresolved case. Browser latency was not instrumented; Core microbenchmarks above are not browser interaction measurements.

### R2 remaining gaps

- The browser runner does not yet execute save/reload (UI41), explicit browser invocation of the advanced strategy (UI43), all requested host/group transform combinations, every attachment transition sequence in a single run, or a full browser performance profile.
- The simple auto router intentionally permits graphical crossings and does not avoid obstacles. Vue uses Core route results; the Workbench provides test selectors and diagnostics, not a test-only router.
- Browser UI22 has a residual subpixel endpoint mismatch after dragging an offset host; it must be corrected or the interaction contract explicitly revised before claiming strict aligned simplification.
- Core/Vue suites currently include four non-connector group/table failures as detailed above.

## R3 final acceptance addendum (2026-11-27)

This section supersedes the R2 UI22/41/43 statuses and R2 test totals above.

### UI22 root cause and correction

The failed browser trace showed pointer conversion yielding a requested movement delta of `-129.999992661046`; the target port consequently resolved at y=185.000007338954. This was not a route-normalization error: normalization remained at its existing `1e-7` geometry tolerance and correctly retained the real, small vertical segment. Nor was it an attached endpoint rounding error: the port was correctly resolved at the committed node position.

The movement snap path had not applied a snap. `findTranslationAlignment()` queried a two-dimensional rectangle inflated around the moving object. Since the stationary host was separated horizontally by 230 document units, it was excluded from that query even though its horizontal alignment guide was in range. `snapTranslation()` therefore returned `snapped: false`, and the tiny browser-coordinate delta remained in the committed node position.

Core now queries indexed thin alignment bands across the viewport extent, unioned with the moving object extent. It still uses the configured interaction snap radius; this does not change the geometry normalization tolerance or round document geometry. The candidate is the exact fixed alignment coordinate, so the host commits to y=150 and its port resolves to exactly y=185. A genuinely unaligned 1e-6 endpoint offset remains an exact, valid orthogonal route with the extra segment. Manual routes retain their explicit points. The R3 Core regressions cover aligned horizontal/vertical routes, cross-gap snapping, automatic simplify/expand, repeated move drift, micro-offset validity, and manual route preservation. Browser UI22 repeats away-and-back movement at zoom changes and checks exact committed geometry.

### UI41 save and reload

The Workbench's serialization fixture contains free automatic and port-bound automatic routes, manual routes with intentional bends, two identical stacked routes, an explicit junction host/branch, and connector visual style through the existing metadata style fields. Its acceptance hook calls Core `serializeDocument()`, `deserializeDiagramDocument()`, and `engine.transact()`; it does not use a demo persistence format. The browser test also serializes during a transient creation preview and verifies that no ghost edge is present in document content. After restore it checks identities, endpoint variants/references, resolved routes, auto strategy, manual points, styling, junction identity, and overlapping geometry, then edits a restored manual segment successfully.

### UI43 advanced router compatibility

The browser fixture selects `strategy: "obstacle-aware"` with existing `clearance` and `terminalLead` options and a blocking shape. Chromium verified the route detours around that shape, follows an attached-host move, retains strategy/options and geometry after the Core document round-trip, and coexists with a newly drawn simple connector that crosses the same shape without detouring.

### Final browser acceptance and interaction measurements

`node scripts/smoke-diagram-connectors.mjs` passed all 43 required scenario IDs. It executed 44 checks because `R2-UI35a` separately exercises pointer cancellation in addition to the required lost-capture UI35 case. The final run recorded 24 geometry evidence entries; all report full preview/commit route equality and orthogonality. Exact UI22 endpoint assertions and UI41 serialization checks are included in [acceptance-results.json](../artifacts/diagram-connectors/acceptance-results.json). The same directory contains the final screenshots and `connector-acceptance.trace.zip`.

Browser interaction timings below are single representative observations in headless Chromium 145.0.7632.0. Each spans the Playwright pointer action through two browser animation frames, so it includes input dispatch, Core/adapter work, and the browser frame boundary. These are not Core-only timings or performance guarantees.

| Interaction | Observed browser time (ms) |
|---|---:|
| Connector creation preview | 78.6 |
| Connector creation commit | 33.5 |
| Endpoint drag preview | 81.0 |
| Endpoint drag commit | 34.7 |
| Segment drag preview | 81.1 |
| Segment drag commit | 34.3 |
| Connected-object drag preview | 81.3 |
| Connected-object drag commit | 32.2 |

### R3 validation

| Check | Result |
|---|---|
| Required browser IDs UI01–UI43 | PASS, all 43 IDs |
| Browser actions | PASS, 44/44 including supplementary pointer-cancel check |
| Preview/commit geometry | PASS, 24/24 recorded comparisons; all orthogonal |
| UI22 | PASS, exact alignment and two-point route after alignment snapping; move-away/re-align, two zoom changes, and eight repeated operations verified |
| UI41 | PASS, production document serialization/restoration and post-restore editability |
| UI43 | PASS, obstacle-aware detour, attached-object movement, option round-trip, and simple crossing route |
| Core tests | PASS, 238/238 |
| Vue tests | PASS, 58/58 |
| Connector-focused Core/Vue tests | PASS, 23/23 and 5/5 |
| Core/Vue builds | PASS |
| Demo type-check/build | PASS |
| `git diff --check` | PASS |

The earlier R2 group/table failures no longer reproduce in this final run; no group or table code was changed as part of R3.

## R4 directional port support

### Contract

Ports now expose optional first-class `direction` values `north | east | south | west | auto | any`. Omitted values retain legacy unrestricted behavior; `auto` infers only a single unambiguous side of a local rectangular boundary. Corner/interior/vertex/route anchors resolve to `any`. `resolvePortWorldDirection` maps explicit/inferred local vectors through the existing host world transform's linear part, including retained parent transforms. Cardinal results are returned directly; non-cardinal transformed results return `null`, and automatic orthogonal resolution yields no successful path instead of quantizing the vector. Port directions are outward host normals. The legacy routing API keeps `sourceDirection` as outward and `targetDirection` as final travel direction; Core converts target port normals to that established target contract.

Directional automatic routes receive at least a 12 document-unit terminal lead. Collinear aligned routes normalize back to two endpoints. Legacy ports remain unrestricted, and manual routes are not rewritten when a port's direction changes. `setPortDirection` provides undo/redo; `resolvePortWorldDirection` exposes world direction while the stored local direction remains on the port entity. Creation options carry the same direction property. Direction survives port reconstruction, clipboard duplication, and existing serializers.

### Implementation and evidence

Core now resolves port directions centrally in `geometry.ts`; `resolveEdgePath` supplies them to the existing simple or obstacle-aware router. The connector creation preview resolves the same endpoint direction contract in Core and commits a matching terminal lead. The Workbench includes four-side directional ports, nested transformed groups, transient direction glyphs, and a port direction editor that selects the first explicitly directed port after fixture reset so its stored direction is immediately visible. The Free Canvas fixture marks its clear east/west boundary ports as `auto`, yielding a right-down-right route with exactly two bends for the offset example. No Vue routing mathematics were added.

| Check | Result |
|---|---|
| Directional Core cases | PASS, east/west attached routes, aligned straight route, live direction update, rotated auto boundary inference, ambiguous corner fallback, legacy unrestricted behavior, nested retained rotations, non-cardinal rejection, undo and serialization covered |
| Core suite/build | PASS, 250/250 tests and TypeScript build |
| Vue suite/build | PASS, 59/59 tests and TypeScript build |
| Demo type-check/build | PASS |
| Chromium regression suite | PASS, 47 actions: previous 44 connector actions plus PD01, PD21, and the Free Canvas right-down-right fixture; 25/25 recorded preview/commit comparisons matched and were orthogonal, including attached directional ports; direction edit undo and screenshots verified |
| PD02–PD20, PD22–PD28 | NOT RUN as individual browser cases; covered only in part by Core route/transform coverage, so not claimed as accepted |
| Manual directional terminal editing | DEFERRED: existing manual geometry remains untouched and serializable; this slice does not insert local terminal repairs or reject conflicting segment edits |

Browser timings are single Playwright samples from pointer action through two animation frames, not percentile benchmarks: creation preview 80 ms / commit 31.2 ms; endpoint preview 75.6 ms / commit 29.7 ms; segment preview 75.9 ms / commit 34.4 ms; connected-object preview 79.1 ms / commit 30 ms. Raw results and the Chromium trace are in `artifacts/diagram-connectors/acceptance-results.json` and `connector-acceptance.trace.zip`.

The complete PD01–PD28 acceptance matrix has not been executed. In particular, arbitrary non-cardinal direction is explicitly rejected through the `null` world-direction result/empty automatic route, but does not yet have a structured per-edge diagnostic result. The 43 connector scenarios are reused in the browser runner; they passed alongside PD01 and PD21. Representative screenshots and the full Playwright trace are retained under `artifacts/diagram-connectors/`.

### Host order crossing regression

The Free Canvas follow-up exposed a separate case: after an east-facing source host moved to the right of the west-facing target, the simple candidate families had no route satisfying both terminal directions and returned an empty path. Directional routes now use at least a 12-unit terminal lead even when a legacy route config stores `terminalLead: 0`, and the simple router adds deterministic perimeter candidates for opposing endpoint order. A Core regression and Chromium `PD-CROSS` drag assert a live orthogonal preview, eastward source departure, west-side target approach, and exact preview/commit equality. The refreshed browser suite passes 48/48 actions; Core is 251/251 and its build passes.
