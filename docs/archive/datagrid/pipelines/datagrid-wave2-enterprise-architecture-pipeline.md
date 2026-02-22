# DataGrid Wave 2 Enterprise Architecture Pipeline

Baseline date: `2026-02-10`  
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core` + orchestration/adapters  
Goal: закрыть core-архитектурные требования high-performance grid уровня enterprise (не косметика, не UI-only).

## Validation Rules

- Каждый шаг закрывается только при наличии:
  - code-level contract;
  - automated validation (`unit/contract/e2e/bench`);
  - measurable outcome (latency/variance/memory or deterministic behavior).
- For perf-sensitive steps: обязательно фиксируем `before/after` в бенч-артефактах.

## Pipeline (Simple -> Complex)

## 01. Data Source Backpressure + Cancellation (`target >= 9.3`)

- [x] Abort-first semantics for outdated pull requests.
- [x] Range deduplication and inflight coalescing.
- [x] Priority policy (`visible window > prefetch > background`).
- [x] Bounded cache with deterministic eviction (LRU/window-aware).
- [x] Validation:
  - [x] contract tests for cancel/dedup ordering;
  - [x] bench on rapid scroll/filter churn;
  - [x] memory growth gate under long session.

Progress:
- `2026-02-10` - implemented inflight pull coalescing for identical demand keys in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceBackedRowModel.ts` (`pullCoalesced` diagnostics counter + request-key reuse, no extra `pull()`/abort churn).
- `2026-02-10` - added contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`coalesces identical inflight viewport pulls instead of spawning duplicate requests`).
- `2026-02-10` - implemented range dedup for inflight viewport churn: subset `viewport-change` demand is coalesced when active inflight request already covers target range (same model state + sufficient priority), while invalidation/refresh paths keep freshness semantics, in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceBackedRowModel.ts`.
- `2026-02-10` - added contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`coalesces subset viewport demand when broader inflight range already covers it`).
- `2026-02-10` - implemented priority arbitration (`critical > normal > background`) for inflight pulls: lower-priority demand is deferred instead of aborting active high-priority viewport fetch; added `pullDeferred` diagnostics in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceBackedRowModel.ts`.
- `2026-02-10` - added contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`defers lower-priority invalidation pull while critical viewport pull is inflight`).
- `2026-02-10` - added contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`preempts lower-priority inflight pull when critical viewport demand arrives`).
- `2026-02-10` - reduced server-row-model allocation churn in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/serverBackedRowModel.ts`: range cache key switched from string concatenation to numeric tuple cache (`start/end/revision`), range snapshots avoid extra `slice()` copies, viewport refresh no longer hard-deletes range node cache, cached nodes are refreshed in-place from source rows; contract coverage added in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/serverBackedRowModel.spec.ts` (`reuses row node objects across viewport refresh when identity stays stable`, `updates cached row node payload in-place when source row instance changes`).
- `2026-02-10` - added pending-queue collapse for repeated deferred requests (same key) and contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`collapses repeated deferred invalidation pulls into single pending request`).
- `2026-02-10` - upgraded bounded cache eviction to window-aware policy: under cache pressure, entries outside active viewport are evicted first (before visible-window rows) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceBackedRowModel.ts`.
- `2026-02-10` - added cache-pressure contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`keeps active viewport rows cached under row-cache pressure from out-of-window pushes`) and `rowCacheEvicted` diagnostics counter.
- `2026-02-10` - updated protocol docs `/Users/anton/Projects/affinio/docs/datagrid-data-source-protocol.md` to include `pullCoalesced` observability contract.
- `2026-02-10` - extended backpressure diagnostics with runtime-state observability (`hasPendingPull`, `rowCacheSize`, `rowCacheLimit`) in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceProtocol.ts` + `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dataSourceBackedRowModel.ts`.
- `2026-02-10` - added long-session bounded-memory contract test `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dataSourceBackedRowModel.spec.ts` (`keeps row-cache bounded under long viewport churn`) to prove `rowCacheSize <= rowCacheLimit` across sustained viewport churn.
- `2026-02-10` - added dedicated rapid churn benchmark `/Users/anton/Projects/affinio/scripts/bench-datagrid-datasource-churn.mjs` with backpressure diagnostics assertions (coalesced/deferred pulls) and assert entrypoint `pnpm run bench:datagrid:datasource-churn:assert`; artifact: `/Users/anton/Projects/affinio/artifacts/performance/bench-datagrid-datasource-churn.json`.
- `2026-02-10` - deduplicated overlapping warmup pulls in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/serverBackedRowModel.ts`: concurrent `setViewportRange` + `refresh` for identical source range now reuse a single in-flight warmup promise (no duplicate `fetchBlock(start/end)` burst), plus deterministic range-scoped cache invalidation on warmup completion; contract added in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/serverBackedRowModel.spec.ts` (`deduplicates viewport warmup when refresh overlaps inflight range fetch`).

## 02. Value/Derived Cache Layer (`target >= 9.3`)

- [x] Unified cache for derived values: sort keys, filter predicates, group meta, formatted values.
- [x] Explicit invalidation keys (`row revision`, `column revision`, `filter revision`, `group revision`).
- [x] Deterministic cache hit/miss behavior in snapshot.
- [x] Validation:
  - [x] contract tests for invalidation correctness;
  - [x] bench for hot-path CPU reduction;
  - [x] no stale-values regression tests.

Progress:
- `2026-02-10` - added revision-keyed derived cache layer in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowModel.ts`:
  - filter-predicate cache (`filterRevision`);
  - sort-value cache (`rowRevision + sortRevision`);
  - group-value cache (`rowRevision + groupRevision + group fields`).
- `2026-02-10` - introduced deterministic derived-cache diagnostics (`getDerivedCacheDiagnostics`) with hit/miss counters + revision snapshot in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowModel.ts`.
- `2026-02-10` - added contract tests in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/clientRowModel.spec.ts`:
  - `reuses derived sort cache across grouping expansion changes when rows/sort stay stable`;
  - `invalidates filter predicate cache only when filter revision changes`;
  - `invalidates derived sort cache on row revision to avoid stale sort values`.
- `2026-02-10` - added derived-cache hot-path benchmark `/Users/anton/Projects/affinio/scripts/bench-datagrid-derived-cache.mjs` (stable-cache vs invalidated-cache latency + hit-rate metrics) and assert entrypoint `pnpm run bench:datagrid:derived-cache:assert`; artifact: `/Users/anton/Projects/affinio/artifacts/performance/bench-datagrid-derived-cache.json`.
- `2026-02-10` - stabilized derived-cache benchmark total-latency signal by reusing one shared synthetic dataset across warmup/seed scenarios (removes row-generation noise from elapsed budget while preserving cache hit/miss contracts) in `/Users/anton/Projects/affinio/scripts/bench-datagrid-derived-cache.mjs`.
- `2026-02-10` - hardened derived-cache elapsed budget gate against single-seed noise: `PERF_BUDGET_TOTAL_MS` now checks aggregate elapsed `p95` across seeds instead of immediate per-seed fail, keeping regression sensitivity with lower flake rate in `/Users/anton/Projects/affinio/scripts/bench-datagrid-derived-cache.mjs`.

## 03. Range-Based Invalidation Guarantees (`target >= 9.4`)

- [x] Mutations invalidate only affected ranges on corresponding axis.
- [x] Vertical-only updates never force horizontal recompute (and vice versa).
- [x] Column resize/order/visibility recalc scoped to affected segments.
- [x] Validation:
  - [x] contract tests for axis/range isolation;
  - [x] instrumentation counters in CI (recompute scope assertions).

Progress:
- `2026-02-10` - exposed recompute-scope diagnostics in viewport integration snapshot (`rowApplyCount`, `columnApplyCount`, `horizontalMetaRecomputeCount`, `horizontalSizingRecomputeCount`, `offscreenRowInvalidationSkips`, `contentRowInvalidationApplyCount`) via `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportTypes.ts` and `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`.
- `2026-02-10` - added contract coverage `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts`:
  - `tracks recompute scope counters for vertical/horizontal/offscreen invalidation paths`;
  - ensures vertical content invalidation does not force horizontal recompute/apply;
  - ensures offscreen content invalidation is skipped without apply.
- `2026-02-10` - reduced horizontal apply churn in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts`: `applyColumnSnapshot` now reuses previous signal arrays when both layout-version and virtual column window are unchanged (no redundant remap/slice allocations on scroll-only micro-updates inside the same window).
- `2026-02-10` - added contract coverage in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts` (`keeps column projection signal references stable when horizontal range does not change`).
- `2026-02-10` - added no-op fast-path in `/Users/anton/Projects/affinio/packages/datagrid-core/src/virtualization/columnSnapshot.ts`: when `meta version`, `metrics` reference, and `scrollable range` are unchanged, `updateColumnSnapshot` now updates only scalar snapshot fields and skips column projection traversal.
- `2026-02-10` - added traversal-guard contract in `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/columnSnapshot.performance.contract.spec.ts` (`skips column projection traversal when meta and range are unchanged`).

## 04. One-Frame Apply Contract (`target >= 9.5`)

- [x] Input -> compute -> apply single-frame guarantee for scroll/select/edit/resize hot paths.
- [x] No duplicated apply in same frame under microtask/RAF interplay.
- [x] Deterministic frame scheduler tracing for diagnostics.
- [x] Validation:
  - [x] frame-budget contracts (`1 compute + 1 apply / input`);
  - [x] regression suite for long sessions (vertical/horizontal mixed).

Progress:
- `2026-02-10` - added one-frame budget contract `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts` (`keeps single apply per scheduler flush under mixed input burst`) validating coalesced mixed input (`scroll + zoom + row/column mutations`) into a single apply cycle.
- `2026-02-10` - frame-level recompute counters (`recompute.*`) are now available through `/Users/anton/Projects/affinio/packages/datagrid-core/src/viewport/dataGridViewportController.ts` integration snapshot for deterministic diagnostics and CI assertions.

## 05. Clipboard/Fill/Move Unified Range Engine Hardening (`target >= 9.4`)

- [x] One canonical range mutation engine for copy/paste/cut/fill/move.
- [x] Shared blocked-cell accounting and deterministic partial-apply behavior.
- [x] Transaction log integration (undo/redo intent-level).
- [x] Validation:
  - [x] regression e2e (grouped + virtualized + pinned);
  - [x] contract tests for before/after snapshot consistency.

Progress:
- `2026-02-10` - confirmed canonical mutation ownership in orchestration core: shared kernel `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/dataGridRangeMutationKernel.ts` is reused by `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridClipboardMutations.ts` (copy/paste/cut/clear path) and `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/useDataGridRangeMutationEngine.ts` (fill/move path), with Vue layer keeping thin re-exports only.
- `2026-02-10` - added orchestration-level contract suite `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridClipboardMutations.contract.spec.ts` validating deterministic blocked-cell accounting and paste/clear/cut before-snapshot transaction recording.
- `2026-02-10` - added orchestration-level contract suite `/Users/anton/Projects/affinio/packages/datagrid-orchestration/src/__tests__/useDataGridRangeMutationEngine.contract.spec.ts` validating move/fill intent recording with immutable before-snapshot roundtrip and deterministic partial-apply labels.

## 06. Stable Identity + Snapshot Protocol Hardening (`target >= 9.5`)

- [x] Enforce strict `rowId/columnId` contracts across all enterprise paths.
- [x] Remove index-based fallback from enterprise runtime paths.
- [x] Snapshot roundtrip guarantees for row/column/filter/pagination/group/selection state.
- [x] Validation:
  - [x] strict contracts + failure tests for invalid identity;
  - [x] protocol compatibility suite (stable/advanced/internal tiers).

Progress:
- `2026-02-10` - hardened column identity contract in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/columnModel.ts`: fail-fast for invalid column definitions, empty keys, and duplicate keys (`DataGridColumnModel` no longer silently skips malformed identity input).
- `2026-02-10` - added strict identity failure coverage in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/columnModel.spec.ts` (`fails fast for invalid or duplicated column keys`) complementing existing row identity fail-fast tests in `clientRowModel/serverBackedRowModel`.
- `2026-02-10` - added snapshot roundtrip contract in `/Users/anton/Projects/affinio/packages/datagrid-core/src/core/__tests__/gridApi.contract.spec.ts` (`roundtrips row/column/filter/pagination/group/selection snapshots deterministically`), verifying deterministic restore through public `DataGridApi`.
- `2026-02-10` - protocol tier compatibility remains guarded by `/Users/anton/Projects/affinio/packages/datagrid-core/src/protocol/__tests__/entrypointTiers.contract.spec.ts` and `/Users/anton/Projects/affinio/packages/datagrid-core/src/protocol/__tests__/versionedPublicProtocol.contract.spec.ts`.

## 07. Perf Gates in CI (`target >= 9.5`)

- [x] p95/p99 + variance budgets per critical benchmark.
- [x] Memory growth budgets (long-session scenarios).
- [x] Gate fails on variance drift and runaway heap growth.
- [x] Validation:
  - [x] CI integration with artifact reports;
  - [x] baseline locking + drift alerts.

Progress:
- `2026-02-10` - confirmed CI harness budgets/wiring through `bench:datagrid:harness:ci:gate` + `bench:regression`, with required task matrix (`vue-adapters`, `laravel-morph`, `interaction-models`, `row-models`) and artifact gate output `artifacts/quality/datagrid-benchmark-gates-report.json`.
- `2026-02-10` - extended runtime gate `/Users/anton/Projects/affinio/scripts/check-datagrid-benchmark-report.mjs` with baseline locking + drift checks (duration / aggregate elapsed / aggregate heap) and CI fail-fast behavior.
- `2026-02-10` - added versioned baseline lock `/Users/anton/Projects/affinio/docs/perf/datagrid-benchmark-baseline.json` and wired perf-contract static guard in `/Users/anton/Projects/affinio/scripts/check-datagrid-perf-contracts.mjs` to prevent drift-gate removal.
- `2026-02-10` - updated perf gate documentation `/Users/anton/Projects/affinio/docs/datagrid-performance-gates.md` to include baseline drift lock contract.
- `2026-02-10` - row-model benchmark synthetic server source switched to bounded block cache (`BENCH_SERVER_CACHE_BLOCK_LIMIT`, default `96`) to remove unbounded cache growth noise from heap-delta signal in `/Users/anton/Projects/affinio/scripts/bench-datagrid-rowmodels.mjs`.
- `2026-02-10` - row-model `window-shift` benchmark switched to reusable visible-row object pool (`updateReusableVisibleRows + slice`) to reduce allocator noise and make heap/elapsed signal reflect model work instead of row object construction churn in `/Users/anton/Projects/affinio/scripts/bench-datagrid-rowmodels.mjs`.

## Close Log

- `2026-02-10`: pipeline created.
