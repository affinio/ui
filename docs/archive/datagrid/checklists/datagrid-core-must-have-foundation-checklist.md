# DataGrid Core Must-Have Foundation Checklist

Baseline date: `2026-02-10`  
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core` + `/Users/anton/Projects/affinio/packages/datagrid-vue` + `/Users/anton/Projects/affinio/demo-vue`  
Goal: закрыть обязательные foundation-функции уровня production grid (core-first), с отдельными визуальными сценариями для ручной валидации.

## Execution Rules

- Закрываем строго one-by-one: от простого к сложному.
- Каждый пункт закрывается только при наличии:
  - code changes;
  - contract/unit coverage (где уместно);
  - visual scenario в `demo-vue` (отдельный route или отдельная страница).
- После закрытия пункта:
  - ставим `[x]`;
  - добавляем короткий `Comment` в этом файле.

## Pipeline

## 01. Pagination in RowModel (`target >= 9.0`)

- [x] Page size/current page API в row model (`setPagination`, `setPageSize`, `setCurrentPage`).
- [x] Snapshot roundtrip contract (`snapshot.pagination` как source-of-truth).
- [x] Deterministic refresh behavior с pagination state.
- [x] Visual scenario: dedicated page в `demo-vue`.
- Comment: `2026-02-10` — добавлен pagination contract в row model snapshot/API (`packages/datagrid-core/src/models/rowModel.ts`), реализован в `client/server/dataSource` моделях, добавлен API facade в `gridApi` (`packages/datagrid-core/src/core/gridApi.ts`), добавлены базовые contract tests (`packages/datagrid-core/src/models/__tests__/clientRowModel.spec.ts`, `packages/datagrid-core/src/core/__tests__/gridApi.contract.spec.ts`), создан visual scenario route `/datagrid/must-have/pagination` (`demo-vue/src/pages/datagrid/DataGridMustHavePaginationPage.vue`).

## 02. Unified Advanced Filtering (`date + set`) (`target >= 9.0`)

- [x] Unified filter model supports `date` and `set` condition types in the same expression tree.
- [x] Deterministic roundtrip between model snapshot and API apply.
- [x] Visual scenario for date/set mixed filtering.
- Comment: `2026-02-10` — расширен advanced filter engine: добавлен `set` type в core filter model и evaluator (`packages/datagrid-core/src/models/rowModel.ts`, `packages/datagrid-core/src/models/advancedFilter.ts`), добавлен unit coverage (`packages/datagrid-core/src/models/__tests__/advancedFilter.spec.ts`) и visual route `/datagrid/must-have/filtering` (`demo-vue/src/pages/datagrid/DataGridMustHaveFilteringPage.vue`) с apply/clear/roundtrip через `rowModelSnapshot.filterModel`.

## 03. Settings Adapter Column State Roundtrip (`target >= 9.0`)

- [x] Persist/restore full column state: order + visibility + width + pin.
- [x] Stable adapter contract in core and vue store adapter.
- [x] Visual scenario for save/restore column state.
- Comment: `2026-02-10` — добавлен canonical `DataGridColumnStateSnapshot` и API `setColumnState/getColumnState` в core settings adapter (`packages/datagrid-core/src/dataGridSettingsAdapter.ts`), обновлен vue settings store/adapter (`packages/datagrid-vue/src/dataGridSettingsStore.ts`, `packages/datagrid-vue/src/dataGridSettingsAdapter.ts`), добавлен contract test (`packages/datagrid-core/src/__tests__/dataGridSettingsAdapter.contract.spec.ts`) и visual route `/datagrid/must-have/column-state` (`demo-vue/src/pages/datagrid/DataGridMustHaveColumnStatePage.vue`).

## 04. Client Row Reordering (`target >= 9.0`)

- [x] Deterministic row reorder pipeline in client row model.
- [x] Snapshot/state roundtrip after reorder.
- [x] Visual scenario: drag/reorder controls with deterministic result.
- Comment: `2026-02-10` — в `ClientRowModel` добавлен `reorderRows` API и deterministic reindexing source rows (`packages/datagrid-core/src/models/clientRowModel.ts`), добавлен unit coverage (`packages/datagrid-core/src/models/__tests__/clientRowModel.spec.ts`), создан visual route `/datagrid/must-have/reorder` (`demo-vue/src/pages/datagrid/DataGridMustHaveReorderPage.vue`).

## 05. Row Height Auto Mode with Core Cache (`target >= 9.0`)

- [x] Predictable auto row-height mode in controller/runtime.
- [x] Core cache contract (bounded + deterministic invalidation).
- [x] Visual scenario for mixed row heights under virtualization.
- Comment: `2026-02-10` — добавлен bounded `row-height` cache (`packages/datagrid-core/src/viewport/dataGridViewportRowHeightCache.ts`) и контрактные тесты (`packages/datagrid-core/src/viewport/__tests__/dataGridViewportRowHeightCache.contract.spec.ts`), `viewport controller` переведен на auto-estimate цикл с range invalidation из model-bridge (`packages/datagrid-core/src/viewport/dataGridViewportController.ts`) и sampling через host environment (`packages/datagrid-core/src/viewport/dataGridViewportEnvironment.ts`, `packages/datagrid-core/src/viewport/dataGridViewportConfig.ts`, `packages/datagrid-core/src/viewport/viewportHostEnvironment.ts`), добавлен visual route `/datagrid/must-have/row-height` (`demo-vue/src/pages/datagrid/DataGridMustHaveRowHeightPage.vue`).

## Close Log

- `2026-02-10`: checklist created.
- `2026-02-10`: step `01` closed.
- `2026-02-10`: step `02` closed.
- `2026-02-10`: step `03` closed.
- `2026-02-10`: step `04` closed.
- `2026-02-10`: step `05` closed.
