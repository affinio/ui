# DataGrid Engine Transition And Guardrails Checklist

Baseline date: `2026-02-21`  
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core`  
Goal: перевести текущий `clientRowModel` из procedural-orchestrator в декларативный engine с предсказуемой масштабируемостью.

## Why This Transition

Текущая реализация уже закрывает продуктовые требования, но имеет архитектурный риск роста сложности:

- `patchRows` несет слишком много ответственности (patch + dependency + cache + invalidation + recompute orchestration).
- dependency resolution в основном procedural и stage-specific (`if affectsSort/filter/group`).
- state store, execution pipeline и cache lifecycle живут в одном модуле.
- часть hot path логики масштабируется линейно/квадратично при плотном dependency графе и 50k+ rows.

## Target Architecture

Целевая модель:

- `RowGraph`/`FieldNode`/`ComputedNode`/`DependencyEdge` как formal data model.
- `DependencyGraph` как first-class engine-компонент (structural + computed deps, cycle-aware).
- `StageRegistry` как декларативный DAG (`stage`, `dependsOn`, `invalidate`, `compute`).
- `StateStore` отдельно от `ExecutionEngine`.
- `ChangeSet` как canonical результат анализа патча.

## Invariants

- Backward compatibility публичного API (`setRows`, `patchRows`, sort/filter/group contracts).
- Deterministic projection order и snapshot semantics.
- Bounded memory: каждый runtime cache имеет policy/limit/eviction.
- Observable execution: диагностика stale/dirty/recompute остается доступной.

## Pipeline

## 01. Formal Data Model (`target >= 9.3`)

- [x] Ввести typed model узлов зависимости: `FieldNode`, `ComputedNode`, `DependencyEdge`.
- [x] Разделить dependency token domains (`field:*`, `computed:*`, `meta:*`).
- [x] Зафиксировать model contract в docs + unit contracts.

## 02. DependencyGraph v2 (`target >= 9.4`)

- [x] Разделить graph на два слоя:
  - structural path deps (prefix-aware),
  - computed deps (явные directed edges).
- [x] Убрать full-scan `dependentsBySource` в BFS: ввести индекс для быстрого lookup по prefix/token.
- [x] Добавить cycle detection на `registerDependency` (fail-fast или explicit cycle mark).
- [x] Добавить benchmarks на dense dependency graph.

## 03. ChangeSet Extraction (`target >= 9.4`)

- [x] Вынести patch analysis в `RowPatchAnalyzer/ChangeSet` object.
- [x] `patchRows` оставить thin: `applyPatch -> analyzePatch -> applyChangeSet -> recompute`.
- [x] `ChangeSet` должен включать:
  - `changedFields`,
  - `affectedFields`,
  - `changedRowIds`,
  - `stageImpact`,
  - `cacheEvictionPlan`.

## 04. Declarative Stage Registry (`target >= 9.5`)

- [x] Перевести invalidation на stage-level rules вместо procedural `if affectsX`.
- [x] Stage registration API:
  - `id`,
  - `dependsOn`,
  - `invalidate(changeSet)`,
  - `compute(context)`.
- [x] Добавление новой стадии не должно требовать изменений в `patchRows`.
- [x] Execution layer in `clientRowProjectionEngine` использует тот же декларативный registry-подход (`dependsOn + compute`) и строит projection graph из registry.

## 05. StateStore / ExecutionEngine Split (`target >= 9.5`)

- [x] Вынести mutable snapshot state в отдельный store.
- [x] Execution engine оставить stateless относительно UI/subscribers.
- [x] Lifecycle (`subscribe`, `emit`, `dispose`) не должен владеть stage orchestration.

## 06. Cache Policy Hardening (`target >= 9.4`)

- [x] Перейти с overflow `clear()` на bounded eviction (LRU/Clock) для `groupValueCache` и hot caches.
- [x] Добавить `rowVersionById` для row-local cache identity (`sortValueCache` stale guard при rowId reuse).
- [x] Оставить `performanceMode` (`memory|balanced|speed`) как policy facade, но привязать к unified cache policy matrix.

## 07. Key/Grouping Hot Path Optimization (`target >= 9.3`)

- [x] Убрать `JSON.stringify` из group/path key hot paths.
- [x] Перейти на deterministic encoded key format (length-prefixed или escaped delimiter).
- [x] Снизить allocator pressure в grouping buckets (индексы/compacted structures вместо массивов row объектов на каждом уровне).

## 08. Quality Gates (`target >= 9.5`)

- [x] Добавить bench-matrix для `10k/25k/50k/100k`.
- [x] Зафиксировать budgets для:
  - projection latency p95/p99,
  - variance,
  - heap growth.
- [x] Добавить отдельные contracts на:
  - dependency cycles,
  - token-domain invalidation,
  - stale cache prevention с `rowVersionById`.

## Straw (Preventive Guardrails)

Эти меры внедряются до появления боли в production:

1. Dependency traversal:
   - заменить O(E)-scan на индексированный lookup.
2. Formula safety:
   - cycle detection + explicit cycle behavior.
3. Tokenized dependencies:
   - поддержка не только path-fields, но и computed/meta токенов.
4. Hot key generation:
   - убрать `JSON.stringify` из частых group/tree операций.
5. Memory stability:
   - eviction вместо global cache clear при overflow.
6. Row identity correctness:
   - `(rowId, rowVersion)` cache keying для предотвращения reuse-stale cases.
7. Responsibility isolation:
   - `ChangeSet` как единственная точка решения для invalidation/cache plan.

## Current Status (as of `2026-02-21`)

- Введены foundation building blocks:
  - `DependencyGraph` (`createDataGridDependencyGraph`),
  - `ProjectionPolicy` (`createDataGridProjectionPolicy`, `performanceMode`),
  - integration в `patchRows` через `affectedFields`.
- DependencyGraph upgraded to v2 baseline:
  - two-layer dependency model (`structural` + `computed`);
  - indexed structural source lookup (no full source scan per BFS step);
  - cycle policy (`throw|allow`) with fail-fast default on register.
- Formal dependency model introduced:
  - `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/dependencyModel.ts` adds typed `Field/Computed/Meta` nodes and `DependencyEdge`;
  - explicit token domains (`field:*`, `computed:*`, `meta:*`) normalized via typed API;
  - contract docs in `/Users/anton/Projects/affinio/docs/datagrid-dependency-model-contract.md`;
  - unit contracts in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/dependencyModel.spec.ts`.
- Added dense dependency benchmark:
  - script: `/Users/anton/Projects/affinio/scripts/bench-datagrid-dependency-graph.mjs`
  - artifact: `artifacts/performance/bench-datagrid-dependency-graph.json`
  - commands: `bench:datagrid:dependency-graph`, `bench:datagrid:dependency-graph:assert`.
- ChangeSet extraction added:
  - `analyzeRowPatchChangeSet(...)` in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/rowPatchAnalyzer.ts`;
  - `buildPatchProjectionExecutionPlan(...)` for requested/blocked stage planning;
  - `patchRows` in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowModel.ts` now applies change-set outputs instead of procedural stage/cache branching.
- Declarative stage registry added:
  - `DATAGRID_DEFAULT_PATCH_STAGE_RULES` with declarative `id/invalidate/allowRecompute`;
  - planner consumes `stageRules` input (extensible, tested with custom stage rules) so patch-side orchestration no longer hardcodes `if affectsFilter/sort/group`.
  - execution-side stage orchestration in `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowProjectionEngine.ts` now uses a single declarative registry (`DATAGRID_CLIENT_PROJECTION_STAGE_DEFINITIONS`) as source for both graph dependencies and stage compute dispatch.
- Stage graph single-source module introduced:
  - `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/projectionStages.ts` stores stage ids, dependencies, graph/prepared graph, and expansion helper;
  - patch planner rules now keep only `id/invalidate/allowRecompute` (no duplicated `dependsOn` contract).
  - `@affino/projection-engine` now accepts `preparedGraph` in `createProjectionStageEngine(...)`, and datagrid runtime reuses the same prepared topology for `expand` and `engine` paths.
- Это подготовительный слой. Полный переход на declarative stage invalidation и store/engine split остается в pipeline выше.
- Cache hardening baseline added:
  - `sortValueCache` entries now include row-local version guard;
  - client model maintains `rowVersionById` and bumps only changed rows on `patchRows`;
  - overflow eviction changed from global `clear()` to bounded oldest-entry eviction for sort/group hot caches.
- Projection policy matrix introduced:
  - `DATAGRID_PROJECTION_CACHE_POLICY_MATRIX` as unified `performanceMode -> cache` source;
  - `resolveDataGridProjectionCachePolicy(...)` gives deterministic runtime limits for sort/group caches;
  - legacy policy methods remain backward-compatible and delegate to the same matrix semantics.
- Group/tree key hot paths optimized:
  - group and path keys moved from `JSON.stringify(...)` to deterministic length-prefixed encoding;
  - grouping buckets switched to index-based compaction to reduce per-level row-object allocations.
- Quality-gates matrix/contracts finalized:
  - added `/Users/anton/Projects/affinio/scripts/bench-datagrid-tree-workload-matrix.mjs` (`10k/25k/50k/100k`) with row-scale p95/p99 + variance + heap budget maps;
  - added root scripts `bench:datagrid:tree:matrix`, `bench:datagrid:tree:matrix:assert:ci`, `bench:datagrid:tree:matrix:assert:nightly` (`bench:datagrid:tree:matrix:assert` aliases nightly);
  - perf-contract gate now validates matrix wiring + matrix budget env guards;
  - added `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/__tests__/projectionGuardrails.contract.spec.ts` for dependency cycles, token-domain invalidation, and rowVersion stale-cache prevention.
- StateStore split started:
  - added `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowRuntimeStateStore.ts`;
  - projection/runtime revision counters moved under state store API (`bump*Revision`, `commitProjectionCycle`, diagnostics);
  - projection arrays and visible rows (`filtered/sorted/grouped/paginated/rows`) now live in runtime state store;
  - execution handlers in `clientRowModel` now consume runtime state store for projection revision/diagnostics updates.
  - added `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowProjectionOrchestrator.ts` to isolate projection orchestration commands from lifecycle methods.
  - added `/Users/anton/Projects/affinio/packages/datagrid-core/src/models/clientRowLifecycle.ts` to isolate lifecycle (`ensureActive/emit/subscribe/dispose`) from projection orchestration.

## Acceptance Criteria

Переход считается завершенным, когда:

- `patchRows` не содержит stage-specific ветвления invalidation.
- новая projection stage добавляется через registry без изменения orchestrator flow.
- dependency graph cycle-safe и benchmark-stable на dense graph.
- memory bounded без latency spikes от массового `cache.clear()`.
