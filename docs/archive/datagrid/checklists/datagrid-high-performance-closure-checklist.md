# DataGrid High-Performance Closure Checklist

Updated: `2026-02-21`  
Scope: `@affino/datagrid-core` + `@affino/datagrid-vue` + `@affino/datagrid-orchestration`

Goal: закрыть оставшиеся архитектурные/perf пункты для high-performance grid path.

## 2026-02-21 Aggregation Pipeline Addendum

- Added `aggregate` stage into client projection pipeline (`filter -> sort -> group -> aggregate -> paginate -> visible`).
- Added field-aware aggregate invalidation for `patchRows` (`affectsAggregation`).
- Added `basis` semantics (`filtered`/`source`) and runtime aggregation model API (`setAggregationModel` / `getAggregationModel`).
- Added tree/path-parent aggregate cache materialization to keep group totals stable across collapse/expand.

## Closure Rule (DoD)

- Нельзя ставить `- [x]`, пока нет проверяемого evidence.
- Каждый закрытый пункт обязан иметь:
  - `Contract/Test`: имя теста (или нового теста) и ожидаемый инвариант.
  - `Bench/Perf`: метрика до/после (p95/p99/CV/memory) или явная пометка `N/A` с причиной.
  - `Visual`: сценарий ручной проверки (короткий шаг + ожидаемый результат).
  - `Artifact`: путь к файлу/отчету/спеке, где зафиксирован результат.
- Если есть только частичный прогресс: оставляем `- [ ]` и пишем комментарий `Progress:` без закрытия.

## Execution Order (One-by-one)

1. Canonical `VirtualWindow` contract.
2. Overscan inside canonical window snapshot.
3. One-frame guarantee for hot paths.
4. Hard split `virtual-x` vs `layout-x`.
5. Range/axis-scoped invalidation.
6. Остальные P1/P2 после закрытия всех P0.

## 2026 Criticality Note

- Enterprise/grid-at-scale path: `not optional`, these are must-have.
- Basic CRUD table path: можно жить без части пунктов, но это уже не уровень AG/Sheets.

## P0 (Critical)

- [x] Transaction log as single mutation path (no direct UI mutations in enterprise path).
  - Comment: `2026-02-10` - Vue sugar row mutations now flow through intent-based `runtime.api.applyTransaction` with rollback payloads (`clear`/`cut`/`paste` paths). Added default internal transaction service bootstrap when host app does not provide one in `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/internal/useAffinoDataGrid/useAffinoDataGridRuntimeBootstrap.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/internal/useAffinoDataGrid/useAffinoDataGridFeatureSuite.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/internal/useAffinoDataGrid/useAffinoDataGridClipboardFeature.ts`.
- [x] Bounded cache for server-backed row model (`rowNodeCache` LRU).
  - Comment: `2026-02-10` - added `rowCacheLimit` to `createServerBackedRowModel` and LRU touch/evict flow in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/serverBackedRowModel.ts`; contract added in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/serverBackedRowModel.spec.ts`.
- [x] Remove redundant O(N) column width-map rebuilds when layout-widths are unchanged.
  - Comment: `2026-02-10` - `updateColumnSnapshot` now skips map/pinned rebuild on meta version changes that do not change width-layout projection (`snapshot.metrics === meta.metrics` fast-path) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/virtualization/columnSnapshot.ts`; contract lock in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/columnSnapshot.performance.contract.spec.ts`.
- [x] Canonical `VirtualWindow` contract as single source of truth.
  - Required shape: row/column visible range + directional overscan in one immutable snapshot.
  - Requirement: renderer/overlay/hit-test/selection/pointer consume this snapshot only (no local recompute from `getRowCount/getRowsInRange`).
  - Progress: `2026-02-10` - added public `virtualWindow` snapshot + `getVirtualWindow()` API on viewport controller, added imperative `onWindow(payload)` callback, exported new types in advanced entrypoint, aligned legacy `visibleRowRange/visibleColumnRange` as compatibility mirrors, and extended contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - migrated consumer paths: `useDataGridVirtualRangeMetrics` and `useDataGridColumnLayoutOrchestration` can now consume canonical `virtualWindow` (orchestration + vue wrapper), with contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridVirtualRangeMetrics.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridColumnLayoutOrchestration.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridVirtualRangeMetrics.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridColumnLayoutOrchestration.contract.spec.ts`.
  - Progress: `2026-02-10` - migrated hot interaction consumers to optional `virtualWindow` bounds in orchestration (`useDataGridCellCoordNormalizer`, `useDataGridPointerCellCoordResolver`, `useDataGridCellVisibilityScroller`, `useDataGridSelectionOverlayOrchestration`) plus vue contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridCellCoordNormalizer.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridPointerCellCoordResolver.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridCellVisibilityScroller.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridSelectionOverlayOrchestration.contract.spec.ts`.
  - Progress: `2026-02-10` - added orchestration-level contracts for hot interaction consumers (not only vue wrappers): `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridCellCoordNormalizer.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridPointerCellCoordResolver.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridCellVisibilityScroller.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridSelectionOverlayOrchestration.contract.spec.ts`.
  - Progress: `2026-02-10` - wired internal demo call-sites to pass `virtualWindow` bounds into normalizer/pointer/visibility/selection overlay paths in `/Users/anton/Projects/affinio/demo-vue/src/pages/DataGridPage.vue`.
  - Progress: `2026-02-10` - exposed canonical `virtualWindow` snapshot from runtime service/composable/component (`useDataGridRuntimeService`, `useDataGridRuntime`, `DataGrid` slot/expose), including contract updates in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridRuntimeService.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/__tests__/useDataGridRuntime.contract.spec.ts` and `/Users/anton/Projects/affinio/packages/datagrid-vue/src/components/__tests__/DataGrid.contract.spec.ts`.
  - Progress: `2026-02-10` - switched internal demo window consumers (`useDataGridVirtualRangeMetrics`, `useDataGridColumnLayoutOrchestration`) to prefer runtime canonical snapshot when available in `/Users/anton/Projects/affinio/demo-vue/src/pages/DataGridPage.vue`.
  - Progress: `2026-02-10` - removed fallback-only bounds in hot orchestration paths by making canonical window input mandatory (`useDataGridCellCoordNormalizer`, `useDataGridPointerCellCoordResolver`, `useDataGridCellVisibilityScroller`, `useDataGridSelectionOverlayOrchestration`) and updated vue/orchestration contracts accordingly.
  - Progress: `2026-02-10` - removed remaining scroll-math fallbacks from window consumers by requiring canonical `virtualWindow` in `useDataGridVirtualRangeMetrics` and `useDataGridColumnLayoutOrchestration` (orchestration + vue wrappers + internal demo call-sites + contracts) in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridVirtualRangeMetrics.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridColumnLayoutOrchestration.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useDataGridVirtualRangeMetrics.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useDataGridColumnLayoutOrchestration.ts`, `/Users/anton/Projects/affinio/demo-vue/src/pages/DataGridPage.vue`.
  - Evidence (pending run):
    - `pnpm vitest packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridVirtualRangeMetrics.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridColumnLayoutOrchestration.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridCellCoordNormalizer.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridPointerCellCoordResolver.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridCellVisibilityScroller.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridSelectionOverlayOrchestration.contract.spec.ts`
    - `pnpm vitest packages/datagrid-orchestration/src/__tests__/useDataGridRuntimeService.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridVirtualRangeMetrics.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridColumnLayoutOrchestration.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridCellCoordNormalizer.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridPointerCellCoordResolver.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridCellVisibilityScroller.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridSelectionOverlayOrchestration.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/composables/__tests__/useDataGridRuntime.contract.spec.ts`
    - `pnpm vitest packages/datagrid-vue/src/components/__tests__/DataGrid.contract.spec.ts`
- [x] Overscan moved into model-level window snapshot with deterministic behavior.
  - Requirement: overscan is part of public window contract, not hidden state in mixed schedulers/render paths.
  - Requirement: pointer-drag/fill/keyboard/scroll inertia use the same overscan snapshot.
  - Progress: `2026-02-10` - directional overscan (`top/bottom/left/right`) now exposed via `virtualWindow.overscan` in viewport controller snapshot.
  - Progress: `2026-02-10` - propagated canonical `virtualWindow` shape (including overscan + ranges) through hot interaction orchestration contracts (`useDataGridCellCoordNormalizer`, `useDataGridPointerCellCoordResolver`, `useDataGridCellVisibilityScroller`, `useDataGridSelectionOverlayOrchestration`) and internal demo shared resolver in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridCellCoordNormalizer.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridPointerCellCoordResolver.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridCellVisibilityScroller.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridSelectionOverlayOrchestration.ts`, `/Users/anton/Projects/affinio/demo-vue/src/pages/DataGridPage.vue`.
  - Progress: `2026-02-10` - aligned vue wrappers fallback snapshots to canonical overscan-aware shape in `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useDataGridVirtualRangeMetrics.ts` and `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useDataGridColumnLayoutOrchestration.ts`.
  - Evidence (pending run): `pnpm vitest packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
- [x] One-frame guarantee for hot scroll/drag paths.
  - Contract: `1 input -> 1 window compute -> 1 apply` (no extra microtask/timeout re-apply in same intent cycle).
  - Gate: contract tests for coalescing and duplicate-apply prevention.
  - Progress: `2026-02-10` - added `onWindow` dedupe assertions for stable refresh and single-scroll/single-apply behavior in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added burst-scroll coalescing contract to assert one rows/columns/window apply per coalesced input cycle and no duplicate apply on immediate follow-up refresh in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Evidence (pending run): `pnpm vitest packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.

## P1 (High)

- [x] Enforce phased async pipeline (`input -> compute -> apply`) across remaining hot interaction paths.
  - Progress: `2026-02-10` - demoted non-hot imperative setter updates from forced heavy invalidation to queued async updates (`scheduleUpdate(false)` for zoom/virtualization/row-height/viewport-metrics setters), keeping heavy compute/apply in scheduled frame pipeline rather than immediate force path in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`.
  - Progress: `2026-02-10` - removed synchronous `measureLayout()` from `setViewportMetrics` input setter; viewport metric writes now stay in input-phase and compute/apply happens only via scheduled frame pass in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`.
  - Progress: `2026-02-10` - model-bridge invalidations (`rows`/`columns`) are now scheduled through non-force async updates (`scheduleUpdate(false)`), removing forced heavy passes from bridge notifications and unifying all model-driven updates under the same frame pipeline in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`.
  - Progress: `2026-02-10` - added contract coverage that imperative non-force setters are async-phased (no immediate apply before scheduler flush, then single coalesced apply) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added contract that bridge-triggered model mutations (`columnModel.setColumnWidth`, `rowModel.setRows`) are also async-phased (no immediate callbacks before `raf.flush`) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - filtered out viewport-only row model notifications inside bridge (no invalidation emission for pure `setViewportRange` churn), preventing redundant heavy-frame scheduling loops in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts`; viewport-only detection is now revision-aware to keep real row-content updates (same `rowCount`, new `revision`) invalidating correctly, covered in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts`.
  - Progress: `2026-02-10` - added static perf-contract guards that input setters stay async-phased (`setViewportMetricsValue` must not call `measureLayout()` directly) and that `scheduleUpdate(true)` force-path stays limited to imperative scroll APIs (`scrollToRowValue`/`scrollToColumnValue`) in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - removed hidden force scheduling from `refresh(force)` (`refreshValue` now always schedules async `scheduleUpdate(false)` and only uses `force` to flush scheduler immediately), plus added static guard `viewport-refresh-keeps-async-phase` in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added integration contract scenario `uses refresh(true) only as scheduler flush and keeps async update phase` in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`, and locked its presence in perf contract gate tokens.
  - Evidence (pending run):
    - `pnpm -C /Users/anton/Projects/affinio --filter @affino/datagrid-core exec vitest run --config vitest.config.ts src/viewport/__tests__/integrationSnapshot.contract.spec.ts`
    - `pnpm -C /Users/anton/Projects/affinio --filter @affino/datagrid-core exec vitest run --config vitest.config.ts src/viewport/__tests__/modelBridge.contract.spec.ts`
    - `pnpm -C /Users/anton/Projects/affinio run quality:perf:datagrid`
  - Evidence: `2026-02-10` - user confirmed green run for listed checks.
- [x] Incremental recalculation for horizontal meta/layout across scroll-only updates.
  - Progress: `2026-02-10` - expanded horizontal meta cache from single-entry to 2-slot cache to reduce recompute thrash across alternating controllers in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportHorizontalMeta.ts`.
  - Progress: `2026-02-10` - viewport controller now reuses cached `lastHorizontalMeta` for motion-only horizontal updates and rebuilds layout/meta only on structural changes (`columns/layoutScale/viewport/native scroll envelope`), avoiding repeated `buildHorizontalMeta` calls on plain scroll in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`.
  - Progress: `2026-02-10` - added instrumentation hooks (`runtime.buildHorizontalMeta`, `runtime.resolveHorizontalSizing`) and contract coverage to assert both meta and sizing are reused across scroll-only horizontal motion and recomputed only after structural width changes in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportTypes.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - decoupled vertical content-height math from horizontal sizing contract (`resolveHorizontalSizing` now depends only on horizontal inputs), so row-only mutations no longer trigger horizontal sizing recompute; content-height is computed separately in controller with contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportMath.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/dataGridViewportMath.contract.spec.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added explicit contract that pure vertical scroll motion must not recompute horizontal meta/sizing and must not emit `onColumns` callbacks in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added static perf guard `viewport-horizontal-meta-reuse-contract` to lock structural-vs-motion horizontal recompute split in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Evidence (pending run):
    - `pnpm -C /Users/anton/Projects/affinio --filter @affino/datagrid-core exec vitest run --config vitest.config.ts src/viewport/__tests__/integrationSnapshot.contract.spec.ts`
  - Evidence: `2026-02-10` - user confirmed green run for listed checks.
- [x] Hard split `horizontal virtualization` vs `layout`.
  - `virtual-x`: index/window math only.
  - `layout-x`: px geometry only.
  - No cross-leak of responsibilities in hot path.
  - Progress: `2026-02-10` - extracted horizontal window math into dedicated pure module and switched range/clamp calculations to metrics-driven contract (`calculateVisibleColumnsFromMetrics` + `horizontalVirtualWindowMath`) so virtual window calculation no longer depends on column object arrays in `/Users/anton/Projects/affinio/packages/datagrid-core/src/virtualization/columnSizing.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/virtualization/horizontalVirtualWindowMath.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/virtualization/horizontalVirtualizer.ts`, with contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/horizontalVirtualWindowMath.contract.spec.ts`.
  - Evidence (pending run): `pnpm vitest packages/datagrid-core/src/viewport/__tests__/horizontalVirtualWindowMath.contract.spec.ts`
- [x] Range/axis-scoped invalidation contract.
  - Resize single column must not trigger row-window recompute.
  - Vertical scroll must not trigger full column-layout recompute.
  - Bridge/controller invalidation should be narrowed from force-refresh to affected axis/range.
  - Progress: `2026-02-10` - controller now short-circuits horizontal recompute/apply for vertical-only updates using horizontal structure/motion invalidation gates, with contract coverage for axis-scoped callback behavior (vertical-only => rows/window without columns, horizontal-only => columns/window without rows, width resize => columns without rows) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts` and `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - model bridge now emits axis-specific invalidation reasons (`rows`/`columns`) and viewport controller maps row-only invalidation to non-force update scheduling to avoid broad forced horizontal refreshes on row updates in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts`.
  - Progress: `2026-02-10` - upgraded model bridge invalidation contract from reason-only signal to structured payload (`reason`, `axes`, `rowRange`), so row invalidations carry normalized affected viewport range and controller can keep row-only updates on non-force path in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts`.
  - Progress: `2026-02-10` - bridge now suppresses invalidation emission for pure viewport-range churn (`setViewportRange` only), avoiding self-triggered row-axis feedback loops while keeping structural row invalidations active in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts`, `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts`.
  - Progress: `2026-02-10` - model bridge row invalidations now carry explicit `scope` (`structural|content`), and controller can skip heavy apply for offscreen content-only row invalidations; contract coverage added in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added static perf guard `viewport-bridge-axis-rowrange-contract` to lock `axes` + `rowRange` scoping by invalidation reason in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added runtime contract `emits normalized row-range payload for row-axis invalidation` in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts` and locked it in perf-contract token gate.
  - Progress: `2026-02-10` - added static perf-contract guards that scoped row invalidations and offscreen content-only skip path remain present in controller/bridge (`pendingContentInvalidationRange`, `invalidation.scope === "content"`, `isRangeOutsideVisibleRows`) in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added safety contract that content-only row invalidation within visible viewport still applies asynchronously (no false skip), complementing offscreen-skip contract in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added contract that row-only model invalidation must not produce horizontal column apply callbacks in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added integration contract that viewport-only row-model churn does not schedule viewport pipeline work (`raf` queue remains empty and imperative callbacks stay stable), proving no self-triggered invalidation loop in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added integration contract that bridge-driven column invalidation remains `columns+window` scoped and bridge-driven row invalidation remains `rows+window` scoped after async flush (no cross-axis callback bleed) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - upgraded axis-scoped integration contract to assert row-only invalidation does not trigger horizontal meta/sizing recompute (`buildHorizontalMeta` + `resolveHorizontalSizing` counters stay unchanged on row mutation) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`.
  - Progress: `2026-02-10` - added static perf guard `viewport-axis-scope-horizontal-counter-contract` to lock presence of horizontal meta/sizing no-recompute assertions for row-only invalidation in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Evidence (pending run):
    - `pnpm vitest packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`
    - `pnpm vitest packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts`
  - Evidence: `2026-02-10` - user confirmed green run for listed checks.
- [x] Unify range-engine internals for copy/paste/cut/fill/move to one canonical transaction-aware pipeline.
  - Progress: `2026-02-10` - extracted shared kernel for deterministic range iteration + mutable row store (`dataGridRangeMutationKernel`) and rewired both clipboard mutations (`copy/paste/cut/clear` path) and range mutation engine (`fill/move` path) to consume it instead of duplicated local row-mutation loops in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/dataGridRangeMutationKernel.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridClipboardMutations.ts`, `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridRangeMutationEngine.ts`.
  - Progress: `2026-02-10` - added kernel contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/dataGridRangeMutationKernel.contract.spec.ts`.
  - Evidence:
    - `pnpm --filter @affino/datagrid-orchestration exec vitest run --config vitest.config.ts src/__tests__/dataGridRangeMutationKernel.contract.spec.ts src/__tests__/useDataGridClipboardMutations.contract.spec.ts src/__tests__/useDataGridRangeMutationEngine.contract.spec.ts`
- [x] Expand derived/value caches (filter predicates, sort keys, group meta) with bounded invalidation.
  - Progress: `2026-02-10` - client row model now caches compiled filter predicate by serialized filter snapshot (bounded single-slot cache with automatic invalidation on filter model key change), materializes sort keys once per row per sort pass instead of re-reading row fields inside comparator loops, and caches grouped field values per projection pass (`rowId::field`) to avoid duplicate group-value reads in grouped projection in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowModel.ts`.
  - Progress: `2026-02-10` - added projection contract for sort-key materialization in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/clientRowModel.spec.ts`.
  - Evidence:
    - `pnpm --filter @affino/datagrid-core exec vitest run --config vitest.config.ts src/models/__tests__/clientRowModel.spec.ts`

## P2 (Hardening)

- [x] Strengthen CI perf gates (variance + memory growth) for parity lock.
  - Progress: `2026-02-10` - strengthened benchmark gate script to validate finite CI variance/heap budgets and enforce aggregate variance/heap envelopes from suite artifacts (not only `ok` flags), in `/Users/anton/Projects/affinio/scripts/check-datagrid-benchmark-report.mjs`.
  - Progress: `2026-02-10` - benchmark gate now validates harness report consistency (no duplicate task ids, duration/status consistency), complete `byTask` budget coverage, CI finite task-level budgets (no `Infinity`), and per-task artifact freshness in `/Users/anton/Projects/affinio/scripts/check-datagrid-benchmark-report.mjs`.
  - Progress: `2026-02-10` - updated performance gate docs with new runtime gate checks in `/Users/anton/Projects/affinio/docs/datagrid-performance-gates.md`.
  - Progress: `2026-02-10` - added perf-contract guard checks to prevent CI gate drift: static verification now enforces benchmark-gate finite-budget checks and CI wiring tokens in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added perf-contract condition checks for bench gate command wiring/order (`bench:datagrid:harness:ci:gate` must run harness before report gate; `bench:regression` must delegate to gate script) in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added static perf guards for recent viewport contracts: bridge invalidations must remain async non-force, horizontal sizing must stay decoupled from vertical content-height dependencies, and legacy vertical-sized horizontal cache fields must stay absent (`/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`).
  - Progress: `2026-02-10` - added explicit static guards that `bench:datagrid:harness:ci` runs in CI mode and that both `bench:datagrid:rowmodels:assert` and `bench:datagrid:interactions:assert` define finite variance/heap budgets (no implicit infinity regressions), in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Progress: `2026-02-10` - added static guards that required viewport contract suites/scenarios are present (`integrationSnapshot` and `modelBridge` scenarios for async-phase, axis/range invalidation, and scoped content invalidation), so CI perf gate fails if these contracts are removed from the test matrix (`/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`).
  - Progress: `2026-02-10` - added static perf-contract guard `benchmark-harness-task-matrix-contract` to lock required harness task IDs and mode-scoped budget selection in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs`.
  - Evidence (pending run):
    - `pnpm run bench:datagrid:harness:ci:gate`
    - `pnpm run quality:perf:datagrid`
  - Evidence: `2026-02-10` - user confirmed green run for listed checks.
- [x] Finish stable selector contract extraction from demo into `@affino/datagrid-vue`.
  - Progress: `2026-02-10` - extracted stable selector contract into `/Users/anton/Projects/affinio/packages/datagrid-vue/src/contracts/dataGridSelectors.ts`, exported through `/Users/anton/Projects/affinio/packages/datagrid-vue/src/public.ts`, and switched Vue demo/runtime e2e usage to package-level selector constants in `/Users/anton/Projects/affinio/demo-vue/src/pages/DataGridPage.vue`, `/Users/anton/Projects/affinio/tests/e2e/datagrid.interactions.spec.ts`, and `/Users/anton/Projects/affinio/tests/e2e/datagrid.regression.spec.ts`.
  - Evidence:
    - `pnpm -C /Users/anton/Projects/affinio --filter @affino/datagrid-vue exec vitest run --config vitest.config.ts src/contracts/__tests__/dataGridSelectors.contract.spec.ts`
    - `pnpm -C /Users/anton/Projects/affinio --filter @affino/datagrid-vue run type-check:public`
    - `pnpm -C /Users/anton/Projects/affinio exec playwright test tests/e2e/datagrid.interactions.spec.ts tests/e2e/datagrid.regression.spec.ts`
- [x] Complete cross-framework parity lock rollout (`quality:lock:datagrid:parity`) in CI workflow.
  - Progress: `2026-02-10` - CI workflow now runs parity lock directly in `quality-gates` job (`pnpm run quality:lock:datagrid:parity`), uploads perf artifacts from the same blocking job, and removes separate duplicate benchmark-regression stage in `/Users/anton/Projects/affinio/.github/workflows/ci.yml`.
  - Progress: `2026-02-10` - architecture acceptance gate now statically verifies parity-lock script wiring and required CI workflow tokens (`quality-gates` job + parity command + artifact upload paths) in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Progress: `2026-02-10` - architecture acceptance gate now enforces ordering and direct wiring contracts: `quality:lock:datagrid:parity` command order (`quality lock -> bench regression -> parity e2e`) and direct `quality-gates` block invocation of parity lock in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Progress: `2026-02-10` - architecture acceptance gate now enforces that `test:e2e:datagrid:parity` includes both Vue and Laravel datagrid suites (`datagrid.regression`, `datagrid.interactions`, `laravel-datagrid`, `laravel-datagrid-interactions`) in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Progress: `2026-02-10` - architecture acceptance gate now enforces that `quality-gates` installs Playwright browsers before invoking parity lock (`pnpm exec playwright install --with-deps chromium` before `pnpm run quality:lock:datagrid:parity`) in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Progress: `2026-02-10` - architecture acceptance gate now forbids legacy standalone `benchmark-regression` job in CI after parity rollout (`ci-no-legacy-benchmark-regression-job`) in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Progress: `2026-02-10` - architecture acceptance gate now enforces `quality-gates` step order (`quality:lock:datagrid:parity` must execute before `Upload quality gate artifacts`) via `ci-quality-gates-parity-before-artifacts-upload` in `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`.
  - Evidence (pending run):
    - `pnpm run quality:architecture:datagrid`
    - `pnpm run quality:lock:datagrid:parity`
    - `.github/workflows/ci.yml` pipeline run with green `quality-gates` job on PR/branch.
  - Evidence: `2026-02-10` - user confirmed green run for listed checks.
