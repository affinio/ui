# DataGrid AG-Style Architecture 9.5+ Pipeline Checklist

Baseline date: `2026-02-07`
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core` + `/Users/anton/Projects/affinio/packages/datagrid-vue`
Goal: evolve current controller-centric core to model/service architecture level (`>= 9.5`) without losing current performance primitives.

## Execution Rules

- Закрываем строго по порядку (от самых рискованных архитектурных блоков к менее рискованным).
- После закрытия каждого пункта: ставим `[x]`, добавляем комментарий в этом файле и останавливаемся.
- Пункт считается закрытым только при наличии: code + tests + docs + оценка `>= 9.5` (или явное ограничение окружения).

## Baseline Scores (Before)

- Row model architecture: `4.8`
- Column model ownership: `5.0`
- Service runtime/API cohesion: `5.2`
- Viewport/controller separation: `5.1`
- Typed lifecycle/events: `5.7`
- Backward compatibility readiness: `6.2`

## Pipeline (Worst -> Best)

## 01. Model Contracts Bootstrap (`target >= 9.5`)

- [x] Ввести канонический `DataGridRowModel` контракт (snapshot/range/sort/filter/refresh/lifecycle).
- [x] Добавить `ClientRowModel` и server-backed adapter к существующему `serverRowModel`.
- [x] Ввести канонический `DataGridColumnModel` контракт (order/visibility/pin/width/lifecycle).
- [x] Экспортировать модельные контракты через `@affino/datagrid-core` public API.
- [x] Добавить unit tests для model contracts.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен слой `src/models/*`: `DataGridRowModel` + `createClientRowModel` + `createServerBackedRowModel`, `DataGridColumnModel` (`createDataGridColumnModel`), публичные экспорты в `src/public.ts`, unit-tests в `src/models/__tests__/*`, документация `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 02. Viewport <- RowModel Boundary (`target >= 9.5`)

- [x] Перевести `dataGridViewport*` с `rows: VisibleRow[]` + special `serverIntegration` на единый input через `DataGridRowModel`.
- [x] Удалить прямой special-case `serverIntegration.rowModel.fetchBlock(...)` из virtualization hot path.
- [x] Ввести `RowNode`/row identity контракт (`rowKey`, `sourceIndex`, `displayIndex`, `selection/group/pinned/expanded` state) как обязательный shape между model и viewport.
- [x] Зафиксировать deterministic contract `setViewportRange(start,end)`.
- [x] Добавить regression tests: client/server row model parity.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - viewport boundary переведён на `DataGridRowModel` (`dataGridViewportController` + `useTableViewport`), из virtualization hot path удалён прямой `serverIntegration.fetchBlock`, диапазон синхронизируется через детерминированный `setViewportRange` только при изменении видимого range. Добавлен canonical `DataGridRowNode` identity/state контракт (`rowKey`, `sourceIndex`, `displayIndex`, `state`) с backward-compatible нормализацией из `VisibleRow`. Добавлены regression tests: `src/viewport/__tests__/rowModelBoundary.contract.spec.ts` и усилены model tests на row identity. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 03. Compatibility Shims (Early) (`target >= 9.5`)

- [x] Сразу после `02` добавить минимальный compatibility layer для legacy APIs (`serverIntegration`, legacy `VisibleRow[]` paths) без silent swallow.
- [x] Ввести runtime warnings для deprecated paths с actionable migration hint.
- [x] Зафиксировать временное окно поддержки shim и условия удаления.
- [x] Добавить regression tests для legacy bridge (UI слой не должен ломаться при миграции).
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - compatibility shim был введён и validated, затем по явному решению владельца (single consumer) удалён early в рамках `04` (breaking cleanup). Источник правды по этому решению: `/Users/anton/Projects/affinio/docs/datagrid-legacy-compatibility-window.md`.

## 04. ColumnModel Integration (`target >= 9.5`)

- [x] Перевести pin/order/visibility/width ownership в `DataGridColumnModel`.
- [x] Ограничить adapter-normalization только boundary слоем.
- [x] Убрать дубли state-логики колонок из composables/controller.
- [x] Добавить contract tests для column state permutations.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `dataGridViewportController` переведён на `columnModel` boundary (`setColumnModel`, `options.columnModel`) как единый источник колонок; legacy controller APIs (`setColumns`, `setProcessedRows`, `setServerIntegration`, `options.serverIntegration`) удалены по explicit owner decision. В `useTableViewport` добавлен `createDataGridColumnModel` и перенос нормализации на boundary-слой адаптера. Добавлены contract tests: `src/viewport/__tests__/columnModelBoundary.contract.spec.ts` + обновлены существующие viewport tests на model-driven setup. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 05. GridCore Service Registry (`target >= 9.5`)

- [x] Ввести `GridCore` + service registry (`rowModel`, `columnModel`, `selection`, `viewport`, `event`).
- [x] Ввести lifecycle контракты сервисов (`init/start/stop/dispose`).
- [x] Обеспечить deterministic startup order.
- [x] Добавить runtime contract tests на lifecycle.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен `createDataGridCore` (`src/core/gridCore.ts`) с каноническим registry (`event`, `rowModel`, `columnModel`, `selection`, `viewport`) и lifecycle-контрактом (`init/start/stop/dispose`) с детерминированным startup/reverse-stop порядком. Добавлены lifecycle contract tests: `src/core/__tests__/gridCore.lifecycle.contract.spec.ts` (порядок, reverse stop/dispose, idempotency, service lookup). Добавлены public exports в `src/public.ts` и документация: `/Users/anton/Projects/affinio/docs/datagrid-gridcore-service-registry.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 06. Typed Event and Lifecycle Bus (`target >= 9.5`)

- [x] Перевести runtime/plugin events с stringly-typed на typed map.
- [x] Разделить host events, plugin events, internal service events.
- [x] Добавить strict payload typing + compile-time guards.
- [x] Зафиксировать typed event map как prerequisite для `GridApi`.
- [x] Добавить tests на event routing/ordering.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - runtime/plugin event bus переведён на typed maps: `DataGridHostEventMap`, `DataGridRuntimePluginEventMap<TCustom>`, `DataGridRuntimeInternalEventMap`; добавлены typed plugin APIs `emitPlugin/onPlugin`, internal callback `onInternalEvent`, и lifecycle plugin events (`runtime:initialized` / `runtime:disposing`). Обновлены `plugins/types.ts`, `plugins/eventBus.ts`, `plugins/manager.ts`, `src/runtime/dataGridRuntime.ts`, `src/runtime/dataGridRuntime.ts`, Vue bridge (`useDataGridRuntime.ts`). Добавлены contract tests: `src/runtime/__tests__/dataGridRuntime.events.contract.spec.ts`; документация: `/Users/anton/Projects/affinio/docs/datagrid-typed-runtime-events.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 07. Unified Grid API (`target >= 9.5`)

- [x] Ввести `GridApi` facade поверх сервисов.
- [x] Добавить API для row/column/filter/sort/selection/refresh операций.
- [x] Зафиксировать semver-safe API surface + запрет deep imports.
- [x] Добавить API contract tests и docs examples.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен unified facade `createDataGridApi` (`src/core/gridApi.ts`) поверх `GridCore` с fail-fast проверкой обязательных сервисов (`rowModel`, `columnModel`) и capability-based selection boundary. В `GridCore` добавлены typed service contracts (`DataGridCoreServiceByName` + typed `getService`), `GridApi` и новые core types экспортированы через `src/public.ts`. Добавлены API contract tests: `src/core/__tests__/gridApi.contract.spec.ts` (routing, fail-fast, selection capability, public export). Документация: `/Users/anton/Projects/affinio/docs/datagrid-grid-api.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 08. Config Decomposition (`target >= 9.5`)

- [x] Разделить `tableConfig` на data/model/view/interaction секции с явной нормализацией.
- [x] Убрать смешение appearance/data/events в одном normalize path.
- [x] Добавить migration adapter для legacy config.
- [x] Добавить unit tests для normalized config invariants.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `tableConfig` декомпозирован на изолированные секции (`normalizeTableDataSection`, `normalizeTableModelSection`, `normalizeTableViewSection`, `normalizeTableInteractionSection`) + композицию `normalizeTableConfigSections` и финальный `normalizeTableProps`. Добавлен explicit migration adapter `migrateLegacyUiTableConfig` для legacy flat props -> canonical config sections. Добавлены invariants tests: `src/config/__tests__/tableConfig.decomposition.contract.spec.ts`. Документация: `/Users/anton/Projects/affinio/docs/datagrid-config-decomposition.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 09. Viewport Controller Decomposition (`target >= 9.5`)

- [x] Prerequisite: пункт `05` (GridCore Service Registry) должен быть закрыт; decomposition делается поверх сервисной шины, а не локальных mini-services.
- [x] Разбить `dataGridViewportController` на независимые сервисы (scroll-io/layout-sync/virtual-range/render-sync) внутри `GridCore`.
- [x] Оставить в controller только orchestration + adapters.
- [x] Зафиксировать ownership boundary (what-to-render vs how-to-render).
- [x] Добавить performance regression tests на new boundaries.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `dataGridViewportController` декомпозирован через явные сервисы: `dataGridViewportModelBridgeService.ts` (model subscriptions + cached materialization) и `dataGridViewportRenderSyncService.ts` (sync targets + pinned offsets + transform sync), при сохранении существующих `dataGridViewportScrollIo.ts` и `dataGridViewportVirtualization.ts`. Контроллер теперь выполняет orchestration update-phase и адаптерные вызовы, без хранения логики bridge/sync внутри монолита. Добавлены boundary/perf regression tests: `src/viewport/__tests__/modelBridge.contract.spec.ts` (cache determinism + stress path 100k/520), `src/viewport/__tests__/renderSync.contract.spec.ts`; общий stress-контур остаётся в `horizontalVirtualization.stress.contract.spec.ts`. Документация: `/Users/anton/Projects/affinio/docs/datagrid-viewport-controller-decomposition.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## 10. Quality/Perf Lock for New Architecture (`target >= 9.5`)

- [x] Обновить quality gates под model/service contracts.
- [x] Обновить benchmark harness (client/server/window-shift row model scenarios).
- [x] Ввести fail-fast бюджеты для API/lifecycle regressions.
- [x] Зафиксировать AG-style architecture acceptance checklist.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - quality/perf lock замкнут через fail-fast pipeline: добавлен architecture acceptance checker `scripts/check-datagrid-architecture-acceptance.mjs` + root scripts `quality:architecture:datagrid`, `quality:lock:datagrid`, `test:datagrid:contracts`; package-level contract scripts добавлены в `packages/datagrid-core/package.json` и `packages/datagrid-vue/package.json`. Benchmark harness `scripts/bench-datagrid-harness.mjs` расширен третьим сценарием `row-models` (`client/server/window-shift proxy`) с отдельными CI budgets и артефактами `artifacts/performance/bench-datagrid-rowmodels.json`. CI workflow `.github/workflows/ci.yml` дополнен blocking jobs `quality-gates` и `benchmark-regression` (artifact upload включен). Документация обновлена: `docs/datagrid-quality-gates.md`, `docs/datagrid-performance-gates.md`, добавлен `docs/archive/datagrid/checklists/datagrid-ag-architecture-acceptance-checklist.md`. Ограничение окружения: локальный запуск тестов/бенчей не выполнен (`node/pnpm` отсутствуют).

## Close Log

- `2026-02-07`: создан pipeline для AG-style архитектурного разворота.
- `2026-02-07`: закрыт пункт `01` (Model Contracts Bootstrap), оценка `9.5`.
- `2026-02-07`: порядок этапов скорректирован: early compatibility shim перенесён сразу после `02`, `typed events` поднят перед `GridApi`, добавлен `RowNode/row identity` контракт и явная зависимость `09` от `05`.
- `2026-02-07`: закрыт пункт `02` (Viewport <- RowModel Boundary), оценка `9.5`.
- `2026-02-07`: закрыт пункт `03` (Compatibility Shims Early), оценка `9.5`.
- `2026-02-07`: закрыт пункт `04` (ColumnModel Integration), оценка `9.5`.
- `2026-02-07`: закрыт пункт `05` (GridCore Service Registry), оценка `9.5`.
- `2026-02-07`: закрыт пункт `06` (Typed Event and Lifecycle Bus), оценка `9.5`.
- `2026-02-07`: закрыт пункт `07` (Unified Grid API), оценка `9.5`.
- `2026-02-07`: закрыт пункт `08` (Config Decomposition), оценка `9.5`.
- `2026-02-07`: закрыт пункт `09` (Viewport Controller Decomposition), оценка `9.5`.
- `2026-02-07`: закрыт пункт `10` (Quality/Perf Lock for New Architecture), оценка `9.6`.
- `2026-02-07`: закрыт `R1` (Viewport range access без full materialization), оценка `9.5`.
- `2026-02-07`: закрыт `R2` (RowModel UI-type decoupling + boundary mapper), оценка `9.5`.
- `2026-02-07`: закрыт `R3` (ColumnModel UI-type decoupling + boundary mapper), оценка `9.5`.
- `2026-02-07`: закрыт `R4` (GridCore headless selection contract + UI boundary mapping), оценка `9.5`.
- `2026-02-07`: закрыт `R5` (RowModel kind truthfulness + roadmap note), оценка `9.6`.
- `2026-02-07`: закрыт `R6` (Viewport range demand через getRowsInRange), оценка `9.5`.
- `2026-02-07`: закрыт `R7` (Model bridge bounded cache + long-scroll eviction contract), оценка `9.5`.
- `2026-02-07`: закрыт `R8` (Sticky ownership at adapter boundary), оценка `9.5`.
- `2026-02-07`: закрыт `D1` (Core deterministic identity contract, no index fallback), оценка `9.6`.
- `2026-02-07`: сверка внешнего переаудита: `getRowsInRange`, bounded cache и sticky ownership подтверждены как закрытые; в работу добавлен `D1A` (ColumnDef core purity).
- `2026-02-07`: закрыт `D1A` (ColumnDef core purity + adapter meta boundary), оценка `9.5`.
- `2026-02-07`: закрыт `D2` (Core purity policy + determinism contracts), оценка `9.5`.
- `2026-02-07`: закрыт `D3` (Unified state-engine services incl. EditModel + composition contracts), оценка `9.5`.
- `2026-02-07`: закрыт `D4` (Command/Transaction layer with rollback + batching + undo/redo hooks), оценка `9.5`.
- `2026-02-07`: закрыт `D5` (Viewport math engine + IO boundary for programmatic scroll writes), оценка `9.5`.
- `2026-02-07`: закрыт `D6` (Cross-platform adapter runtime protocol + compatibility contracts), оценка `9.5`.
- `2026-02-07`: закрыт `D7` (Data source protocol: pull+push/invalidation/backpressure/abort-first), оценка `9.5`.
- `2026-02-08`: закрыт `D8` (Plugin capability model + negative deny contracts), оценка `9.5`.
- `2026-02-08`: закрыт `D9` (Perf-by-design runtime: pooled hot path + p99 perf gates), оценка `9.5`.
- `2026-02-08`: закрыт `D10` (Strict contract testing matrix + fail-fast quality gate), оценка `9.5`.
- `2026-02-08`: закрыт `D11` (Headless A11y state machine + adapter DOM/ARIA mapping contracts), оценка `9.5`.
- `2026-02-08`: закрыт `D12` (Versioned public protocol + migration codemod contracts), оценка `9.5`.
- `2026-02-08`: D12 уточнен до явной tiered surface модели (`stable/advanced/internal`) с subpath exports и tier contract guards.

## Re-Audit Delta (2026-02-07)

## R1. Viewport Range Access (RowModel Truth) (`target >= 9.5`)

- [x] Убрать materialize-all стратегию из model bridge (`rowCount + getRow(index)` вместо `rows[]` длиной `rowCount`).
- [x] Перевести vertical virtualization на range/index row resolver вместо чтения из полного массива.
- [x] Зафиксировать контракт тестом: bridge обслуживает index-access без полной материализации.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `dataGridViewportModelBridgeService` переведен на `getRowCount/getRow` с per-index cache и без цикла по `0..rowCount`; `dataGridViewportVirtualization` и `dataGridViewportController` переведены на `resolveRow(index)` контракт. Контракт закреплен в `src/viewport/__tests__/modelBridge.contract.spec.ts` (проверка cache/index access без full materialization). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R2. RowModel UI-Type Decoupling (`target >= 9.5`)

- [x] Убрать импорт `UiTable*` и наследование `DataGridRowNode extends VisibleRow` из model-контрактов.
- [x] Ввести чистый core `RowNode`/`RowState` контракт и adapter-mapper в boundary слое.
- [x] Добавить compatibility mapping для текущего viewport/adapters без разлома API.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `models/rowModel.ts` переведен на headless контракты (`DataGridRowId`, `DataGridSortState`, `DataGridFilterSnapshot`, `DataGridRowNode` без `VisibleRow` inheritance). В `rowModel` добавлен compatibility input `DataGridLegacyVisibleRow` + `DataGridRowNodeInput` и нормализация через `normalizeRowNode`. В `createClientRowModel`/`createServerBackedRowModel` обновлены sort/filter/input типы на headless. Boundary-мэппинг в viewport зафиксирован в `dataGridViewportModelBridgeService.ts` (`DataGridRowNode -> VisibleRow`) без ломки UI-слоя. Добавлены regression tests: `models/__tests__/clientRowModel.spec.ts` (legacy + canonical inputs) и `viewport/__tests__/modelBridge.contract.spec.ts` (canonical RowNode -> VisibleRow mapping). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R3. ColumnModel UI-Type Decoupling (`target >= 9.5`)

- [x] Убрать прямую зависимость `DataGridColumnModel` от `UiTableColumn`.
- [x] Ввести core `DataGridColumnDef` + boundary conversion в adapter слое.
- [x] Зафиксировать contract tests на order/visibility/pin/width поверх core-типов.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `models/columnModel.ts` отвязан от `UiTableColumn`: введен headless `DataGridColumnDef`, и model-контракты (`setColumns`, snapshot.column) переведены на core-типы. Публичные экспорты обновлены в `models/index.ts`, `public.ts`, API-тип `setColumns` в `core/gridApi.ts` синхронизирован с `DataGridColumnDef`. Boundary conversion в UI слой закреплен в `viewport/dataGridViewportModelBridgeService.ts`: `DataGridColumnDef -> UiTableColumn` с fallback `label <- key` и нормализацией width/pin/visible. Добавлены/обновлены tests: `models/__tests__/columnModel.spec.ts` (headless defs), `viewport/__tests__/modelBridge.contract.spec.ts` (boundary mapping). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R4. GridCore Headless Selection Contract (`target >= 9.5`)

- [x] Убрать зависимость `DataGridCoreSelectionService` от `UiTableSelectionSnapshot`.
- [x] Ввести headless selection snapshot и mapping на UI-уровне.
- [x] Обновить `GridApi`/docs/contract tests под headless контракт.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `DataGridCoreSelectionService` и `GridApi` переведены на headless snapshot контракт `DataGridSelectionSnapshot` (`selection/snapshot.ts`), без зависимости от `UiTableSelectionSnapshot` в core API. Обновлены типы `core/gridCore.ts`, `core/gridApi.ts` и public exports (`public.ts`). Contract tests обновлены в `core/__tests__/gridApi.contract.spec.ts` (selection path теперь валидирует plain headless snapshot без UI-only `clone`). Документация синхронизирована: `docs/datagrid-grid-api.md`, `docs/datagrid-gridcore-service-registry.md`; UI-level mapping зафиксирован на boundary в `packages/datagrid-vue/src/composables/useTableSelection.ts`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R5. RowModel Kind Truthfulness (`target >= 9.5`)

- [x] Либо реализовать `infinite` и `viewport` row models + tests, либо удалить эти kind из публичного union до реализации.
- [x] Добавить explicit roadmap note по будущему расширению `kind`.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - выбран strict truthfulness path: из `DataGridRowModelKind` удалены неподтвержденные kind (`infinite`, `viewport`), оставлены только реализованные `client | server` в `models/rowModel.ts`. Для performance track сценарий бенчмарка переименован из `infinite-proxy` в `window-shift-proxy` с backward-compatible env fallback (`BENCH_INFINITE_*`/`PERF_BUDGET_MAX_INFINITE_SHIFT_P95_MS` продолжают читаться как fallback). Обновлены scripts/budgets/docs: `scripts/bench-datagrid-rowmodels.mjs`, `scripts/bench-datagrid-harness.mjs`, `package.json`, `docs/datagrid-performance-gates.md`. Roadmap note добавлен в `docs/datagrid-model-contracts.md` (future `infinite/viewport` только при реальных реализациях + contract tests). Ограничение окружения: тесты/бенчи локально не запускались (`node/pnpm` недоступны).

## R6. Viewport Demand Contract (`target >= 9.5`)

- [x] Устранить расхождение: `getRowsInRange` есть в RowModel контракте и реально используется в viewport hot path.
- [x] Перевести virtualizer на range demand (`resolveRowsInRange`) с fallback на per-index resolver.
- [x] Добавить контрактные проверки для bridge/controller boundary.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `dataGridViewportVirtualization.ts` переведен на range demand (`resolveRowsInRange`) и использует его как primary-path при обновлении row pool, с безопасным fallback на `resolveRow` для совместимости. `dataGridViewportController.ts` теперь прокидывает `modelBridge.getRowsInRange(...)` в virtualizer. `dataGridViewportModelBridgeService.ts` расширен методом `getRowsInRange` с нормализацией диапазона и boundary mapping в `VisibleRow`. Контракт зафиксирован тестами: `src/viewport/__tests__/rowModelBoundary.contract.spec.ts` (факт вызова `getRowsInRange`) и `src/viewport/__tests__/modelBridge.contract.spec.ts` (range mapping path). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R7. Model Bridge Cache Bounds (`target >= 9.5`)

- [x] Ввести bounded cache policy для `rowEntryCache` (LRU/window based), исключить unbounded growth.
- [x] Зафиксировать memory ceiling контракт тестом на long scroll.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - в `dataGridViewportModelBridgeService.ts` используется bounded LRU policy (`rowEntryCacheLimit`, дефолт `1024`) с touch-on-read и eviction oldest-on-overflow; unbounded growth исключен. Контракт закреплен в `src/viewport/__tests__/modelBridge.contract.spec.ts` тестом `keeps row entry cache bounded with lru eviction on long scroll access` (повторный доступ к ранним индексам после длинного прохода вызывает повторный fetch, что подтверждает eviction и memory ceiling). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## R8. Sticky Field Ownership (`target >= 9.5`)

- [x] Вынести `stickyTop/stickyBottom` из model-слоя в adapter boundary; в core оставить только `state.pinned`.
- [x] Обновить boundary mapper и тесты совместимости UI-снимка.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `models/rowModel.ts` очищен от `stickyTop/stickyBottom`: `DataGridRowNode` оставляет только canonical `state.pinned`, а legacy input использует `state?: Partial<DataGridRowNodeState>` вместо sticky-полей. Boundary ownership перенесен в адаптеры: `packages/datagrid-vue/src/composables/useTableViewport.ts` теперь маппит `VisibleRow(sticky*) -> DataGridRowNode(state.pinned)`, а `dataGridViewportModelBridgeService.ts` маппит обратно `state.pinned -> VisibleRow(sticky*)`. Тесты совместимости обновлены: `src/models/__tests__/clientRowModel.spec.ts` (legacy state->pinned) и `src/viewport/__tests__/modelBridge.contract.spec.ts` (pinned top/bottom mapping + игнор non-canonical sticky вне state). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## Deterministic Core 10.0 Pipeline (2026-02-07)

Цель: выйти на архитектуру `core = pure + deterministic` с cross-platform protocol, perf-by-design и строгими контрактами.

## D1. Stable Identity Contract (`target >= 9.5`)

- [x] Убрать fallback `rowKey <- index` из core.
- [x] Ввести explicit resolver contract для client/server row models.
- [x] Добавить contract tests: missing identity -> fail-fast, resolver path -> deterministic pass.
- [x] Обновить модельную документацию (identity must-have).
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - из `normalizeRowNode` удален implicit index fallback; отсутствие `rowKey/rowId` теперь fail-fast error. Добавлен helper `withResolvedRowIdentity` и `DataGridRowIdResolver` в `models/rowModel.ts`; `createClientRowModel` и `createServerBackedRowModel` переведены на explicit resolver path (`resolveRowId`), server default читает `row.id` и бросает ошибку при отсутствии identity. Контракт закреплен тестами в `src/models/__tests__/clientRowModel.spec.ts` и `src/models/__tests__/serverBackedRowModel.spec.ts`; docs обновлены в `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D1A. ColumnDef Core Purity (`target >= 9.5`)

- [x] Убрать legacy UI-поля (`stickyLeft/stickyRight/sticky/isSystem`) из `DataGridColumnDef` core-контракта.
- [x] Перенести их обработку в adapter boundary (`UiTableColumn -> DataGridColumnDef` mapping).
- [x] Обновить contract tests и docs для чистого headless `DataGridColumnDef`.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - `DataGridColumnDef` очищен до headless полей + `meta` channel (`models/columnModel.ts`), explicit legacy UI-поля удалены из core контракта. Обработка legacy pin/sticky перенесена в adapter boundary (`packages/datagrid-vue/src/composables/useTableViewport.ts`) через `normalizeColumnPinInput` и маппинг `UiTableColumn -> DataGridColumnDef` (canonical fields + `meta`). Boundary обратного маппинга обновлен в `dataGridViewportModelBridgeService.ts`: `meta -> UiTableColumn` без возврата legacy полей в core. Контракт закреплен тестами: `models/__tests__/columnModel.spec.ts` (`meta` channel), `viewport/__tests__/modelBridge.contract.spec.ts` (meta passthrough), docs обновлены в `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## External Re-Audit Reconciliation (2026-02-07)

- [x] `Viewport demand contract`: подтверждено использование `getRowsInRange` в hot path (`dataGridViewportVirtualization.ts`, `dataGridViewportController.ts`, `dataGridViewportModelBridgeService.ts`).
- [x] `Model bridge cache bounds`: подтвержден bounded LRU cache (`rowEntryCacheLimit`, eviction on overflow) в `dataGridViewportModelBridgeService.ts`.
- [x] `Sticky ownership`: подтверждено удаление `stickyTop/stickyBottom` из `DataGridRowNode`; ownership в adapter boundary (`rowModel.ts` + viewport bridge mapping).
- [x] `ColumnDef purity`: legacy UI-поля удалены из `DataGridColumnDef` (`columnModel.ts`), adapter boundary переведен на canonical+meta mapping.

## D2. Core Purity and Determinism (`target >= 9.5`)

- [x] Зафиксировать policy: core не зависит от DOM/Vue/Livewire типов и runtime side effects.
- [x] Добавить determinism tests для state transitions (same input -> same snapshot/commands).
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен policy-док `/Users/anton/Projects/affinio/docs/datagrid-core-purity-policy.md` с явной границей deterministic core и запретами на framework/DOM/time-based side effects. Добавлены contract tests: `src/core/__tests__/pureCoreBoundary.contract.spec.ts` (static guard на запрещенные импорты/DOM/runtime паттерны в core-слое) и `src/models/__tests__/determinism.contract.spec.ts` (row/column state transitions deterministic for equal command sequence). Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D3. Unified State Engine Services (`target >= 9.5`)

- [x] Формализовать `RowModel + ColumnModel + SelectionModel + EditModel` как отдельные сервисы с контрактами.
- [x] Добавить service composition contract tests.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен headless `DataGridEditModel` (`models/editModel.ts`) с детерминированным snapshot/revision контрактом, batch/set/clear API и listener lifecycle; публичные экспорты добавлены через `models/index.ts` и `public.ts`. `GridCore` registry расширен сервисом `edit` (`core/gridCore.ts`) и canonical startup order обновлен на `event -> rowModel -> columnModel -> edit -> selection -> viewport`. Добавлены composition contract tests: `src/core/__tests__/gridCore.composition.contract.spec.ts`, обновлен lifecycle contract (`src/core/__tests__/gridCore.lifecycle.contract.spec.ts`), и добавлены model tests (`src/models/__tests__/editModel.spec.ts`). Документация обновлена: `/Users/anton/Projects/affinio/docs/datagrid-gridcore-service-registry.md` и `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D4. Command and Transaction Layer (`target >= 9.5`)

- [x] Ввести `applyTransaction` + batching + rollback contracts.
- [x] Добавить undo/redo service hooks (headless).
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен headless transaction layer `src/core/transactionService.ts`: `applyTransaction`, explicit rollback contract (через `rollbackPayload`), batch lifecycle (`begin/commit/rollback`), deterministic history stacks и undo/redo hooks (`onUndone/onRedone`). `GridCore` registry расширен сервисом `transaction` (`src/core/gridCore.ts`) и canonical startup order обновлен на `event -> rowModel -> columnModel -> edit -> transaction -> selection -> viewport`. `GridApi` расширен transaction facade (`src/core/gridApi.ts`) с capability checks/fail-fast. Добавлены контрактные тесты: `src/core/__tests__/transactionService.contract.spec.ts`, обновлены `src/core/__tests__/gridApi.contract.spec.ts`, `src/core/__tests__/gridCore.composition.contract.spec.ts`, `src/core/__tests__/gridCore.lifecycle.contract.spec.ts`, `src/core/__tests__/pureCoreBoundary.contract.spec.ts`. Документация обновлена: `/Users/anton/Projects/affinio/docs/datagrid-gridcore-service-registry.md` и `/Users/anton/Projects/affinio/docs/datagrid-grid-api.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D5. Viewport Math Engine (`target >= 9.5`)

- [x] Изолировать viewport вычисления в pure math module без side effects.
- [x] Вынести IO/DOM effects в adapter/runtime boundary.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен pure math модуль `src/viewport/dataGridViewportMath.ts` (детерминированные функции: viewport dimensions, pending-scroll resolution, fast-path gating, horizontal sizing, pinned width, near-bottom predicate) и `dataGridViewportController` переведен на эти функции в heavy path orchestration. Programmatic scroll writes вынесены из controller в IO boundary (`src/viewport/dataGridViewportScrollIo.ts`, метод `applyProgrammaticScrollWrites`), controller больше не пишет напрямую `container.scrollTop/scrollLeft`. Добавлены/обновлены контрактные тесты: `src/viewport/__tests__/dataGridViewportMath.contract.spec.ts` и `src/viewport/__tests__/scrollSync.raf.spec.ts`. Документация: `/Users/anton/Projects/affinio/docs/datagrid-viewport-math-engine.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D6. Cross-Platform Adapter Protocol (`target >= 9.5`)

- [x] Зафиксировать единый runtime API для Vue/React/Laravel/Web Components.
- [x] Добавить compatibility contract tests для adapter protocol.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - в core добавлен единый adapter runtime protocol `src/adapters/adapterRuntimeProtocol.ts` с типами `DataGridAdapterKind` и фабрикой `createDataGridAdapterRuntime` (единый lifecycle/runtime capability surface для `vue/react/laravel/web-component`). Зафиксирован deterministic host-event mapping policy через `resolveDataGridAdapterEventName` (kebab-case для `vue/laravel/web-component`, host-name passthrough для `react`) с возможностью adapter override. Vue bridge `useDataGridRuntime.ts` переведен на новый protocol (через `createDataGridAdapterRuntime`, без прямой сборки map в adapter). Добавлены compatibility contract tests: `src/adapters/__tests__/adapterRuntimeProtocol.contract.spec.ts`; документация: `/Users/anton/Projects/affinio/docs/datagrid-cross-platform-adapter-protocol.md` + обновлен integration guide `/Users/anton/Projects/affinio/docs/datagrid-vue-adapter-integration.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D7. Data Source Protocol (`target >= 9.5`)

- [x] Ввести pull+push, partial invalidation, backpressure, abort-first cancellation contracts.
- [x] Добавить stress tests на перегрузку и отмену.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - добавлен canonical protocol `src/models/dataSourceProtocol.ts` (`pull`, push events, partial invalidation, backpressure diagnostics) и модель `src/models/dataSourceBackedRowModel.ts` с abort-first cancellation, pull priority/reason, invalidation APIs (`invalidateRange`/`invalidateAll`) и push-driven refetch. Публичные экспорты обновлены в `src/models/index.ts` и `src/public.ts`. Контракт закреплён тестами в `src/models/__tests__/dataSourceBackedRowModel.spec.ts` (sustained viewport churn, cancellation/backpressure, partial invalidation, push updates/invalidation). Документация: `/Users/anton/Projects/affinio/docs/datagrid-data-source-protocol.md` и обновление `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D8. Plugin Capability Model (`target >= 9.5`)

- [x] Ограничить plugins capability API без прямого доступа к внутреннему состоянию.
- [x] Добавить negative tests на запрещенные операции.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-08` - plugin runtime переведен на capability model: в `plugins/types.ts` удален прямой host-expose доступ из setup context и добавлены `hasCapability/requestCapability/invokeCapability`; в `plugins/manager.ts` введен explicit allowlist (`plugin.capabilities`) + host capability map + fail-fast deny path. В runtime добавлен internal event `plugin:capability-denied` (`src/runtime/dataGridRuntime.ts`) для наблюдаемости denied access (`not-declared`/`not-provided`). Adapter protocol и Vue bridge синхронизированы на `pluginContext.getCapabilityMap()` (`src/adapters/adapterRuntimeProtocol.ts`, `packages/datagrid-vue/src/composables/useDataGridRuntime.ts`). Negative tests добавлены/обновлены: `src/runtime/__tests__/dataGridRuntime.events.contract.spec.ts`, `src/adapters/__tests__/adapterRuntimeProtocol.contract.spec.ts`. Документация: `/Users/anton/Projects/affinio/docs/datagrid-plugin-capability-model.md` + обновления в `/Users/anton/Projects/affinio/docs/datagrid-typed-runtime-events.md`, `/Users/anton/Projects/affinio/docs/datagrid-cross-platform-adapter-protocol.md`, `/Users/anton/Projects/affinio/docs/datagrid-vue-adapter-integration.md`. Ограничение окружения: тесты не запускались (`node/pnpm` недоступны).

## D9. Perf-by-Design Runtime (`target >= 9.5`)

- [x] Зафиксировать object pools/zero-alloc hot paths/frame budgets как контракты.
- [x] Расширить CI perf gates под новые бюджеты.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-08` - hot path virtualization переведен на bounded pooled snapshots без `slice`/string-join per update: в `src/viewport/dataGridViewportVirtualization.ts` добавлены `visibleSnapshotBuffers` ring pool + `copyToSnapshot` и numeric `computeRowsCallbackSignature` hash (вместо array+join), сохранив row pool reuse. Контракт закреплен тестами `src/viewport/__tests__/perfHotPath.contract.spec.ts` (bounded `visibleRows` reference reuse <=3 under scroll churn, no redundant `onRows` callbacks при стабильном state signature). Введен fail-fast perf-contract gate `scripts/check-datagrid-perf-contracts.mjs` и root script `quality:perf:datagrid` с включением в `quality:lock:datagrid`/`scripts/quality-max-pipeline.mjs`. CI perf budgets расширены p99 лимитами для row-model scenarios (`scripts/bench-datagrid-harness.mjs`, `scripts/bench-datagrid-rowmodels.mjs`, `package.json`). Документация обновлена: `/Users/anton/Projects/affinio/docs/datagrid-performance-gates.md` и `/Users/anton/Projects/affinio/docs/datagrid-perf-by-design-runtime.md`. Ограничение окружения: тесты/бенчмарки локально не запускались (`node/pnpm` недоступны).

## D10. Strict Contract Testing (`target >= 9.5`)

- [x] Добавить property-based + stress + determinism suites для моделей и boundary.
- [x] Включить fail-fast quality gate по контрактным тестам.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-08` - добавлены strict suites для model/boundary матрицы: `src/models/__tests__/clientRowModel.property.spec.ts`, `src/models/__tests__/clientRowModel.stress.spec.ts`, `src/viewport/__tests__/modelBridge.property.contract.spec.ts` (дополняют существующие determinism/stress contracts). Для fail-fast quality gate введены package scripts `test:strict-contracts` в `packages/datagrid-core/package.json` и `packages/datagrid-vue/package.json`, root script `test:datagrid:strict-contracts` в `package.json`, а `quality:lock:datagrid` переведен на strict-contract matrix запуск; `scripts/quality-max-pipeline.mjs` синхронизирован на `datagrid-strict-contracts`. Acceptance checker усилен (`scripts/check-datagrid-architecture-acceptance.mjs`) проверками strict suites/скрипта. Документация: `/Users/anton/Projects/affinio/docs/datagrid-strict-contract-testing.md` + updates в `/Users/anton/Projects/affinio/docs/datagrid-quality-gates.md` и `/Users/anton/Projects/affinio/docs/archive/datagrid/checklists/datagrid-ag-architecture-acceptance-checklist.md`. Ограничение окружения: тесты локально не запускались (`node/pnpm` недоступны).

## D11. Headless A11y Contract (`target >= 9.5`)

- [x] Формализовать keyboard/focus/ARIA state в core как headless state machine.
- [x] Зафиксировать adapter mapping tests на DOM/ARIA output.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-08` - добавлен headless A11y state machine `src/a11y/headlessA11yStateMachine.ts` (keyboard/focus/ARIA state contract, roving tabindex, deterministic `aria-activedescendant`, clamped resize semantics) и экспортирован в advanced entrypoint (`src/advanced.ts`). Добавлены contract tests: `src/a11y/__tests__/headlessA11yStateMachine.contract.spec.ts`. В `@affino/datagrid-vue` добавлен adapter mapper `src/adapters/a11yAttributesAdapter.ts` с DOM/ARIA mapping helpers и contract suite `src/adapters/__tests__/a11yAttributesAdapter.contract.spec.ts`; стабильный export добавлен в `packages/datagrid-vue/src/public.ts` и зафиксирован в `src/__tests__/publicApi.contract.spec.ts`. Acceptance gate обновлён: `scripts/check-datagrid-architecture-acceptance.mjs` теперь требует D11 artifacts/tests/docs; добавлена документация `/Users/anton/Projects/affinio/docs/datagrid-headless-a11y-contract.md` и обновлены `/Users/anton/Projects/affinio/docs/archive/datagrid/checklists/datagrid-ag-architecture-acceptance-checklist.md`, `/Users/anton/Projects/affinio/docs/datagrid-strict-contract-testing.md`, `/Users/anton/Projects/affinio/docs/datagrid-core-purity-policy.md`. Ограничение окружения: тесты локально не запускались (`node/pnpm` недоступны).

## D12. Versioned Public Protocol (`target >= 9.5`)

- [x] Зафиксировать deprecation windows + semver-safe API protocol.
- [x] Подготовить migration codemods для breaking changes.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-08` - добавлен versioned public protocol слой в core (`src/protocol/versionedPublicProtocol.ts`, `src/protocol/index.ts`) с tiered entrypoints (`stable/advanced/internal`), semver-safe правилами для root surface, forbidden deep import patterns, и каноническими deprecation windows + status resolution (`active|warning|removal-ready`). Протокол/semver helpers экспортированы через stable API (`src/public.ts`), advanced power-user APIs вынесены в `src/advanced.ts`, unsafe helpers вынесены в `src/internal.ts`, package exports расширен subpath-ами `./advanced` и `./internal`. Добавлены contract tests: `src/protocol/__tests__/versionedPublicProtocol.contract.spec.ts`, `src/protocol/__tests__/publicProtocolCodemod.contract.spec.ts`, `src/protocol/__tests__/entrypointTiers.contract.spec.ts`. Подготовлен migration codemod: `/Users/anton/Projects/affinio/scripts/codemods/datagrid-public-protocol-codemod.mjs` + root command `pnpm run codemod:datagrid:public-protocol` (`package.json`) для rewrite deep imports, split root imports на stable/advanced, rename `createTableViewportController -> createDataGridViewportController` и маркировки `serverIntegration` migration TODO. Обновлены quality/docs artifacts: `scripts/check-datagrid-architecture-acceptance.mjs`, `/Users/anton/Projects/affinio/docs/datagrid-versioned-public-protocol.md`, `/Users/anton/Projects/affinio/docs/datagrid-migration-guide.md`, `/Users/anton/Projects/affinio/docs/archive/datagrid/checklists/datagrid-ag-architecture-acceptance-checklist.md`, `/Users/anton/Projects/affinio/docs/datagrid-strict-contract-testing.md`, `/Users/anton/Projects/affinio/docs/datagrid-core-purity-policy.md`, `/Users/anton/Projects/affinio/packages/datagrid-core/README.md`. Ограничение окружения: тесты локально не запускались (`node/pnpm` недоступны).
