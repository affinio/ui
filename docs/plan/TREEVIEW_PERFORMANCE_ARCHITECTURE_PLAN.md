# Treeview Performance Architecture Plan

Status: in progress
Scope: `@affino/treeview-core`, `@affino/treeview-vue`
Reference sources: `.refs/treeview-core`, `.refs/treeview-vue`

## Goal

Make Treeview suitable for large interactive trees with predictable frontend performance:

- 20k nodes on the main thread with smooth keyboard navigation, expansion, collapse, filtering, and search.
- 20k-100k nodes with an optional worker-backed projection mode when filtering/search or heavy patch churn would block input.
- 100k+ nodes with a backend/server-backed model instead of pretending every workload should run synchronously in the browser.

The target architecture should follow the same discipline as the DataGrid projection stack: explicit source indexes, staged invalidation, stable viewport/window APIs, benchmarked hot paths, and no broad recompute on active/selected-only state changes.

## Current State

The reference implementation is a clean headless primitive, but it is not yet a high-performance tree engine.

Current strengths:

- Core state is framework-independent.
- Vue wrapper uses `shallowRef` and keeps Vue reactivity outside core.
- Node lookup uses `Map<Value, InternalNode<Value>>`.
- Snapshot references stay stable for no-op and failure requests.
- Deterministic `request*` methods already exist in core.

Current performance limits:

- `patch()` normalizes `expanded` for every meaningful state update, including active/selected-only updates.
- `normalizeExpandedValues()` rebuilds full traversal order through all nodes.
- `focusNext()` and `focusPrevious()` rely on visible-array `findIndex` and linear next-enabled scans.
- `isExpanded()` is backed by array `includes`, which is expensive if called per rendered row.
- `getVisibleValuesFor()` rebuilds roots and full visible arrays instead of exposing windowed projection.
- `patchNodeMap()` finalizes all parent/child links for every patch.
- Search/filter are not first-class concepts and would currently be implemented by external node replacement.
- There is no virtualization/window API, no search index, no benchmark suite, and no CI budget for treeview performance.

## Target Architecture

Introduce a staged tree runtime with these internal ownership boundaries:

| Layer | Responsibility |
| --- | --- |
| Source graph index | Stable nodes, parent links, child links, roots, depth, preorder/subtree metadata, versioning. |
| Expansion state | Internal `expandedSet`, canonical expanded snapshot array, expansion version. |
| Search/filter state | Normalized text cache, query/filter model, matched ids, ancestor closure, optional descendant inclusion. |
| Visible projection | Current visible ids/count, id-to-visible-index, enabled navigation indexes, projection version. |
| Viewport/window | `start/end/overscan`, visible window rows, stable row keys, no full-array render contract. |
| Vue adapter | Shallow refs, batched commits, keyboard/touch handlers, render-window integration. |
| Worker/server adapter | Optional async projection protocol for heavy data or remote tree sources. |

Projection stages should be explicit:

```text
source -> search/filter -> expansion -> visible -> viewport
```

Active/selected state should not invalidate source, search/filter, expansion, visible, or viewport unless the public behavior requires it.

## Success Metrics

Initial CI budgets should be conservative and tightened after multi-run baselines are collected.

| Workload | 20k target | 100k target |
| --- | --- | --- |
| register replace | p95 <= 80ms | p95 <= 450ms |
| register patch 1% moved/updated | p95 <= 12ms | p95 <= 55ms |
| expand/collapse medium branch | p95 <= 4ms | p95 <= 16ms |
| focus next/previous | p95 <= 0.25ms | p95 <= 0.6ms |
| visible window read 100 rows | p95 <= 0.3ms | p95 <= 0.7ms |
| first search apply | p95 <= 35ms | p95 <= 180ms |
| search query change with cached tokens | p95 <= 20ms | p95 <= 90ms |
| search clear | p95 <= 6ms | p95 <= 20ms |
| Vue scroll frame p95 | <= 20ms | <= 25ms with worker/server mode |
| blank viewport count | 0 | 0 |

## Slice 0: Baseline Harness And Contracts

Purpose: freeze current behavior and create measurements before changing architecture.

Implementation:

- Add package-level benchmark scripts for treeview core workloads.
- Add browser benchmark for Vue rendering once a virtualized render surface exists or a sandbox fixture is added.
- Add benchmark artifacts under `artifacts/performance` and documented budgets under `docs/perf`.
- Add small deterministic dataset generators:
  - balanced tree: 10k/20k/50k/100k nodes;
  - deep chain: depth 10k;
  - wide root: 100k direct children;
  - mixed disabled density: 0%, 10%, 40%;
  - patch churn: add, remove, reparent, disable/enable.

Tests:

- Preserve existing selection/focus/expand/collapse behavior.
- Contract no-op request keeps snapshot reference stable.
- Contract invalid requests do not emit.
- Contract canonical expanded order is stable.
- Contract cycles and missing parents normalize deterministically.

Benchmarks:

- `bench-treeview-core.mjs`:
  - register replace;
  - register patch;
  - expand/collapse burst;
  - focus next/previous burst;
  - visible read full array;
  - visible window read placeholder benchmark after Slice 4.
- Metrics:
  - p50/p95/p99/max elapsed;
  - heap delta;
  - emitted snapshot count;
  - visible recompute count;
  - traversal rebuild count.

Exit criteria:

- Current behavior is protected by tests.
- Baseline artifact captures known weak spots without pretending they are regressions.
- CI has a smoke budget, nightly has larger scale budgets.

## Slice 1: Separate State Mutation From Expanded Normalization

Purpose: remove full-tree work from active/selected-only updates.

Implementation:

- Store internal expansion state as `expandedSet` plus `expandedVersion`.
- Keep canonical expanded snapshot array cached by `sourceVersion + expandedVersion`.
- Change `patch()` into explicit mutation paths:
  - `patchActiveSelected()`;
  - `patchExpanded()`;
  - `patchSource()`.
- Only normalize expanded when source or expanded actually changes.
- Keep public snapshot shape unchanged.

Tests:

- Active-only focus changes preserve snapshot semantics.
- Selected-only changes do not change expanded array identity unless snapshot changes require a new immutable wrapper.
- `requestFocus`, `requestSelect`, `clearSelection` do not call expanded normalization when they do not expand ancestors.
- Ancestor auto-expand behavior remains intact for focus/select into collapsed branches.

Benchmarks:

- Focus burst on 20k and 100k expanded trees.
- Select burst on 20k and 100k expanded trees.
- Snapshot allocation count per 1k focus operations.

Expected result:

- Active/selected hot path becomes O(depth) or O(1), not O(total nodes).

Progress:

- Implemented internal `expandedSet` membership and cached traversal order for canonical expanded snapshots.
- Active-only focus changes now reuse the existing canonical expanded array when ancestor expansion is unchanged.
- `isExpanded()` now reads from internal set membership instead of scanning the expanded snapshot array.
- Added `bench-treeview-core.mjs` with focus/select burst coverage, visible/traversal recompute counters, heap deltas, JSON artifacts, and smoke-budget assertions.
- Remaining Slice 1 work: collect multi-run 20k/100k baselines and tighten budgets after variance is understood.

## Slice 2: Build Stable Source Graph Indexes

Purpose: avoid rebuilding roots, traversal order, child arrays, and parent metadata in hot paths.

Implementation:

- Introduce internal `TreeviewGraphIndex<Value>`:
  - `nodesById`;
  - `parentById`;
  - `childrenById`;
  - `rootIds`;
  - `depthById`;
  - `preorderIds`;
  - optional `preorderIndexById`;
  - optional `subtreeEndIndexById`.
- Build graph indexes during replace registration.
- Make cycle handling deterministic and iterative, avoiding recursive stack overflow on deep trees.
- Cache traversal order as source-owned state, not something rebuilt by expanded normalization.

Tests:

- Root order matches registration order.
- Missing parent becomes root or follows current compatibility behavior.
- Self-parent/cycle does not infinite loop.
- Deep chain does not overflow call stack.
- Child ordering is stable after replace registration.

Benchmarks:

- Register replace for balanced/deep/wide datasets.
- Canonical expanded read after source build.
- Memory overhead by node count.

Expected result:

- Source index cost is paid at source registration, not during navigation or active updates.

Progress:

- Replaced recursive traversal and visible projection walks with iterative DFS, preserving preorder child order while avoiding stack overflow on deep chains.
- Added a 10k expanded-chain contract test and confirmed `registerReplaceDeep` now records successful benchmark timings instead of `RangeError`.
- Added source-owned `rootValues` and deterministic missing-parent/parent-cycle normalization so visible reads no longer derive roots by filtering every node.
- Added source-owned preorder, preorder-index, and depth indexes during registration; canonical expanded normalization now reads the source preorder directly instead of lazily rebuilding traversal order.
- Remaining Slice 2 work: add subtree-end metadata and start using depth/preorder indexes in the future windowed row metadata API.

## Slice 3: Incremental Source Patches

Purpose: make patch registration actually incremental.

Implementation:

- Replace full `finalizeNodeMap()` on patch with affected-parent updates.
- Track changed ids, previous parent, next parent, and affected ancestors.
- Support explicit remove operations if public API is allowed to change:
  - `registerNodes(nodes, { mode: "patch", remove?: ids })`, or a dedicated `applyPatch()` API.
- Preserve disabled updates without rebuilding unrelated child arrays.
- Invalidate source-derived indexes only for affected subtrees where possible.

Tests:

- Add child under existing parent.
- Reparent node between two parents.
- Disable active/selected node normalizes active/selected correctly.
- Remove selected/active/expanded node normalizes state.
- Patch does not reorder unrelated siblings.
- Patch with missing parent follows compatibility behavior.

Benchmarks:

- 1 node add/update/reparent on 20k/100k.
- 1% churn patch on 20k/100k.
- Lazy-load branch append workload.

Expected result:

- Small source patches avoid full-tree child-array rebuild.

## Slice 4: Visible Projection And Navigation Index

Purpose: make expansion/collapse and keyboard navigation predictable for large visible trees.

Implementation:

- Introduce `TreeviewVisibleProjection<Value>`:
  - `visibleIds`;
  - `visibleIndexById`;
  - `enabledVisibleIds` or next/previous enabled lookup;
  - projection version;
  - recompute counters for benchmarks.
- Recompute visible projection only when expansion, source, or search/filter changes.
- Implement focus by visible index instead of `visible.findIndex`.
- Keep disabled-node navigation semantics compatible.
- Prefer iterative traversal to recursive traversal.

Tests:

- `focusNext/focusPrevious` match existing behavior with loop on/off.
- Disabled nodes are skipped.
- Active node hidden by collapse falls back to parent as before.
- Projection version does not change on active-only updates.
- Visible index lookup returns expected index for roots, leaves, and collapsed descendants.

Benchmarks:

- Focus next/previous burst over 20k/100k visible nodes.
- Expand/collapse branch with small, medium, and large subtree.
- Visible projection recompute count per operation.

Expected result:

- Navigation becomes O(1) or close to O(1) after visible projection exists.

## Slice 5: Windowed Tree API For Virtualization

Purpose: avoid requiring consumers to copy or render the full visible array.

Implementation:

- Add core API:
  - `getVisibleCount()`;
  - `getVisibleAt(index)`;
  - `getVisibleWindow(start, end)`;
  - `getVisibleIndex(value)`;
  - `getNodeMeta(value)` for depth, parent, child count, disabled, expanded, selected, active.
- Make `getVisibleValues()` a compatibility API that copies the full array.
- Add window signatures so Vue can skip re-render when visible window did not change.
- Keep values stable and do not allocate row objects unless the requested window changes.

Tests:

- Window boundaries clamp safely.
- Window rows expose correct depth and expanded/selected/active metadata.
- Full visible array equals concatenated windows.
- Window API does not mutate internal arrays.
- Compatibility `getVisibleValues()` remains correct.

Benchmarks:

- Window read 50/100/300 rows across 20k/100k visible trees.
- Random access by index.
- Scroll-window shift workload.

Expected result:

- Consumers can virtualize without full visible-array copies per scroll/render.

## Slice 6: First-Class Search And Filter Projection

Purpose: support fast tree search/filter without replacing all nodes from the outside.

Implementation:

- Add search/filter model to core:
  - query string;
  - filter predicate or filter tokens;
  - text accessor callback;
  - match mode: contains/prefix/fuzzy-lite if needed;
  - include ancestors of matches;
  - optional include descendants of matches;
  - optional disabled-node matching policy.
- Add normalized text cache keyed by node id and source version.
- Add matched ids and ancestor closure as projection outputs.
- Add search metadata for UI:
  - `matched`;
  - `matchRanges` if highlighting is needed;
  - `matchCount`;
  - current match navigation index.
- Keep filtering independent from expansion semantics:
  - filtered tree may force ancestors visible;
  - expansion state should be preserved when filter clears.

Tests:

- Query matches leaves and includes ancestors.
- Query clear restores previous expansion state.
- Disabled node matching follows configured policy.
- Search over missing/empty text is safe.
- Re-registering source invalidates text cache only for changed nodes where possible.
- Match navigation moves through visible matches deterministically.

Benchmarks:

- First search apply on 20k/100k.
- Query change with cached tokens.
- Query clear.
- Match navigation burst.
- Text cache memory overhead.

Expected result:

- Search/filter becomes a projection stage, not an external full source replacement.

## Slice 7: Vue Virtualized Rendering Adapter

Purpose: make `@affino/treeview-vue` usable as a high-performance UI surface, not only a thin controller.

Implementation:

- Keep `useTreeviewController()` for compatibility.
- Add a virtualized adapter/composable:
  - `useVirtualTreeviewController()` or equivalent;
  - viewport state: row height, scrollTop, overscan, visible window;
  - shallow refs for window rows and total height;
  - rAF-batched scroll commits;
  - stable row keys and row metadata.
- Avoid calling `isExpanded()` per row; row metadata should come from window projection.
- Keyboard interaction should ask core for target ids and then request viewport reveal.
- Render only the window plus overscan.

Tests:

- Window rows update when scroll offset changes.
- Active row reveal computes expected scroll target.
- Expand/collapse updates total height and window rows.
- Search changes visible count and window rows.
- Shallow ref updates are skipped when window signature is unchanged.

Browser benchmarks:

- Scroll 20k fully expanded tree.
- Expand/collapse during scroll idle.
- Search apply with rendered window.
- Keyboard repeat over 20k visible nodes.
- Metrics:
  - frame p95/p99;
  - dropped frame percent;
  - long task count/total;
  - row mount/unmount count;
  - blank viewport count.

Expected result:

- Rendering cost is bounded by viewport size, not by tree size.

## Slice 8: Worker Projection Mode

Purpose: support 20k-100k workloads where search/filter/projection may block input on weaker devices.

Implementation:

- Add optional worker-owned runtime protocol:
  - register source snapshot;
  - apply source patch;
  - update expansion;
  - update search/filter;
  - request visible window;
  - request focus delta;
  - cancel stale request by revision.
- Keep main-thread mode the default for small/medium trees.
- Preserve identical public behavior between main-thread and worker mode.
- Do not use worker as the only production path; it is an opt-in scale tier.

Tests:

- Worker result revision ordering rejects stale responses.
- Main-thread and worker projections match for deterministic datasets.
- Cancellation during rapid query changes does not apply stale windows.
- Worker errors surface as explicit failure state.

Benchmarks:

- Worker roundtrip p95 for visible window.
- Search apply responsiveness with input probe.
- Main-thread event-loop delay during worker search.
- Compare main-thread vs worker on 20k/50k/100k.

Expected result:

- Heavy projection can move off the input thread without changing user-visible semantics.

## Slice 9: Server-Backed Tree Model

Purpose: define the correct model for trees that should not be fully resident in the browser.

Implementation:

- Add optional server datasource protocol for large/lazy trees:
  - pull children;
  - pull visible window by query/expansion revision;
  - search query update;
  - expansion patch;
  - node metadata hydration;
  - total visible count.
- Support stale-window retention while new server results load.
- Keep selection/active state local when possible, but reconcile missing/removed nodes explicitly.

Tests:

- Placeholder/stale window behavior.
- Expansion request cancellation.
- Search query cancellation.
- Selection normalization when active node disappears.
- Backend errors do not corrupt local state.

Benchmarks:

- Placeholder exposure duration.
- Viewport cache hit ratio.
- Pull coalescing and cancellation count.
- Search query-to-window latency under synthetic backend delay.

Expected result:

- 100k+ and remote/lazy trees use a production-shaped backend model instead of forcing sync browser projection.

## Slice 10: Public API And Migration Hardening

Purpose: make the new architecture adoptable without surprising consumers.

Implementation:

- Keep old APIs where cheap:
  - `getVisibleValues()`;
  - `isExpanded()`;
  - `isSelected()`;
  - `isActive()`;
  - existing request methods.
- Add new APIs behind clear names:
  - window reads;
  - search/filter model updates;
  - optional worker/server controller creation.
- Document complexity expectations:
  - full visible array copy is compatibility-only;
  - window API is the preferred UI path;
  - worker/server is recommended for large search-heavy trees.
- Add migration guide for current consumers.

Tests:

- Export surface tests.
- Type tests for new options.
- Backward compatibility tests for old controller behavior.
- API report/baseline if packages are promoted into the main workspace quality gates.

Benchmarks:

- Compatibility API overhead is measured but not optimized as the primary path.
- Preferred window/search APIs have CI budgets.

Expected result:

- Existing users are not broken unnecessarily, while high-performance usage gets explicit APIs.

## Slice 11: CI Quality Gates And Documentation

Purpose: keep the performance work from regressing silently.

Implementation:

- Add docs:
  - package README performance section;
  - architecture note for staged projection;
  - benchmark commands and budget descriptions;
  - scale guidance: main-thread vs worker vs server.
- Add CI scripts:
  - `bench:treeview:core:assert`;
  - `bench:treeview:search:assert`;
  - `bench:treeview:vue:browser:assert` when browser fixture exists.
- Add artifact comparators after baselines stabilize.

Tests:

- Docs examples compile if examples are code-backed.
- Benchmark budget parser tests if custom budget scripts are added.

Benchmarks:

- Multi-run baseline before tightening budgets.
- Nightly 100k matrix.
- CI smoke 20k matrix.

Expected result:

- Treeview gets the same regression discipline as DataGrid: benchmark artifacts, explicit budgets, and documented scale limits.

## Recommended Implementation Order

1. Slice 0: baseline harness and behavior contracts.
2. Slice 1: stop active/selected changes from rebuilding expanded traversal.
3. Slice 2: source graph indexes.
4. Slice 4: visible projection and navigation index.
5. Slice 5: windowed API.
6. Slice 7: Vue virtualized adapter.
7. Slice 6: search/filter projection.
8. Slice 3: true incremental source patching.
9. Slice 8: worker mode.
10. Slice 9: server-backed model.
11. Slice 10 and 11 continuously as API/docs/quality hardening.

Search/filter can move before Vue virtualization if product priority is query latency rather than scroll/rendering. Incremental patching can move earlier if lazy loading is the primary workload.

## Risk Notes

- The largest public API decision is whether to add a new high-performance controller API or evolve the existing controller in place.
- The existing `Value` generic can be any key type; worker/server modes may need serializable ids or an id codec.
- Recursive traversal must be removed before deep-tree support can be claimed.
- Full visible-array APIs should remain compatibility-only because they make virtualization consumers accidentally expensive.
- Worker mode should be positioned as an opt-in scale tier, not the default architecture for small trees.
- Server-backed mode should be a separate model, not hidden behind synchronous APIs.
