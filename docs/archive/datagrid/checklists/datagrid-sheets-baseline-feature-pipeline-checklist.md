# DataGrid Sheets Baseline Feature Pipeline Checklist

Baseline date: `2026-02-08`  
Scope: `/Users/anton/Projects/affinio/demo-vue` + `/Users/anton/Projects/affinio/packages/datagrid-core` + `/Users/anton/Projects/affinio/packages/datagrid-vue`  
Goal: покрыть базовый функционал уровня AG Grid/Google Sheets (без pivot/formulas), с детерминированным поведением под virtualized/pinned grid.

## In Scope

- Multi-cell selection (already present, доводим до production parity).
- Column sorting.
- Excel-like filtering (quick filter + column filter + filter menu).
- Column resize без деградации virtualized/pinned runtime.
- Clipboard: copy/paste/cut (keyboard + context menu).
- Drag/drop interactions для редактирования диапазонов (fill/move where applicable).
- Context menu for cell/range operations.

## Out of Scope (for this pipeline)

- Pivoting, grouping trees enterprise-grade, formulas engine, charting.
- Server-side aggregation engine.

## Execution Rules

- Закрываем строго one-by-one, в порядке шагов.
- Каждый шаг закрывается только при наличии: implementation + tests + docs note.
- После закрытия шага: ставим `[x]`, добавляем `Comment`, останавливаемся.
- Минимальная оценка на шаг: `>= 9.0` (по UX + stability + performance).

## Definition of Done (global)

- Поведение не ломается при: horizontal/vertical virtualization, pinned columns, long sessions.
- Keyboard-first сценарии полностью рабочие.
- Нет regressions по текущему Excel-style selection/fill/edit.
- Контракты покрыты e2e + component/integration tests.

## Pipeline (simple -> complex)

## 01. Sort Foundation (`target >= 9.0`)

- [x] Stable single-column sorting (asc/desc/none) from header.
- [x] Multi-column sorting with `Shift` (priority order visible in UI).
- [x] Sort state sync with current data model API.
- [x] Tests: keyboard + click + pinned headers.
- [x] Final score for step: `9.1`.
- Comment: `2026-02-08` - шаг закрыт: в `demo-vue/src/pages/DataGridPage.vue` реализован header-driven sort state (`asc -> desc -> none`) с multi-sort через `Shift`, визуальными индикаторами направления и приоритета в header, а также метрикой `Sort state` для диагностики. Добавлена синхронизация с row-model API через `rowModel.setSortModel(sortState)` и preset bridge (`latency/errors/service/custom`). Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts` (`click cycle`, `shift multi-sort`, `keyboard on pinned header`).

## 02. Quick Filter Foundation (`target >= 9.0`)

- [x] Global quick filter over visible dataset.
- [x] Deterministic interaction with sorting and selection.
- [x] Empty-state + active-filter indicator UX.
- [x] Tests: quick filter + sort composition + virtualization windows.
- [x] Final score for step: `9.1`.
- Comment: `2026-02-08` - шаг закрыт: quick filter переведен на visible-column keys (`searchableColumnKeys`) с детерминированной композицией с sort state и существующей selection model. В контролах добавлены active indicator (`Quick filter: ...`) и явный `Clear filter`, empty-state recovery сохранен. Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts`: indicator/clear flow, filter+sort composition under virtualization, empty-state recovery.

## 03. Column Filter MVP (`target >= 9.0`)

- [x] Per-column filter model (text/enum/number baseline operators).
- [x] Filter UI entrypoint from header (menu trigger).
- [x] Apply/reset/clear-all UX.
- [x] Tests: filter combinations + pinned + scroll stability.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: добавлен column filter model (`text|enum|number`) с baseline-операторами и синхронизацией в row model через `rowModel.setFilterModel(buildFilterSnapshot(...))`. В header каждой колонки (кроме select) добавлен filter trigger, реализован panel UX (`apply/reset/clear-all/close`) и индикация активных filtered headers. В метрики добавлен `Column filters`. Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts`: apply/reset flow, комбинация фильтров + стабильность при horizontal scroll + clear-all.

## 04. Column Resize (Virtualization-safe) (`target >= 9.0`)

- [x] Drag resize handles in header (mouse + pointer).
- [x] Double-click auto-size (fit content heuristics baseline).
- [x] Zero-desync with horizontal virtualization and pinned offsets.
- [x] Tests: long horizontal scroll while resizing + sticky headers.
- [x] Perf gate: no visible frame drops in benchmark harness scenario.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: в `demo-vue/src/pages/DataGridPage.vue` добавлены header resize handles (`mousedown drag` + `double-click autosize`) с безопасным clamping ширины, autosize-эвристикой по label+sample rows и интеграцией через `api.setColumnWidth`. Добавлена защита от конфликтов с selection/fill drag и стабильность sticky/pinned в том же viewport runtime. E2E покрытие добавлено в `tests/e2e/datagrid.regression.spec.ts`: drag resize + long horizontal scroll, autosize flow, pinned-column sticky offset under scroll.

## 05. Clipboard Copy (`target >= 9.0`)

- [x] Copy active cell / range in TSV format.
- [x] Keyboard shortcuts: `Cmd/Ctrl+C`.
- [x] Context menu action: `Copy`.
- [x] Visual feedback for copied range.
- [x] Tests: copy under pinned + virtualized viewport.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: реализован copy pipeline для active/range selection с TSV payload builder и clipboard write (`Ctrl/Cmd+C`), плюс context-menu action `Copy` на viewport. Добавлен визуальный flash copied-range (`datagrid-stage__cell--copied`) и метрика `Copied cells` для диагностики. Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts`: keyboard copy range + context copy в pinned/virtualized scroll сценарии.

## 06. Clipboard Paste (`target >= 9.0`)

- [x] Paste single value and rectangular ranges from clipboard.
- [x] Keyboard shortcuts: `Cmd/Ctrl+V`.
- [x] Context menu action: `Paste`.
- [x] Validation + partial apply behavior (blocked cells, non-editable cols).
- [x] Tests: paste matrix into scrolled/virtualized/pinned grid.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: добавлен paste pipeline с TSV parsing и matrix apply в selection/active-cell anchor, keyboard shortcut `Cmd/Ctrl+V` и context-menu action `Paste`. Реализована validation + partial apply: не-редактируемые/невалидные значения считаются `blocked`, применяется только валидная часть, статус отражает applied/blocked. Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts`: keyboard matrix paste в virtualized+pinned сценарии и context-menu partial apply с blocked cells.

## 07. Clipboard Cut (`target >= 9.0`)

- [x] Cut as copy+clear for editable cells.
- [x] Keyboard shortcuts: `Cmd/Ctrl+X`.
- [x] Context menu action: `Cut`.
- [x] Undo-safe transactional behavior (no partial corruption).
- [x] Tests: cut single/range + mixed editable/non-editable cells.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: реализован cut pipeline как `copy + atomic clear` (одно батч-обновление `sourceRows` через mutable map), keyboard shortcut `Cmd/Ctrl+X` и context-menu action `Cut`. Для mixed selection добавлен blocked accounting (non-editable/unsupported clear), что исключает частичную порчу состояния и явно отражается в статусе. Тесты добавлены в `tests/e2e/datagrid.regression.spec.ts`: keyboard range cut и context cut с mixed editable/non-editable.

## 08. Context Menu System (`target >= 9.0`)

- [x] Right-click context menu for cell/range/header zones.
- [x] Action routing: copy/paste/cut, clear, sort, filter, resize shortcuts.
- [x] Keyboard access (`Shift+F10`/context-menu key).
- [x] Overlay/pinning layering contract (menu always on top, no focus traps).
- [x] Tests: mouse + keyboard invocation across pinned/non-pinned areas.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: контекстное меню расширено до zone-based system (`cell/range/header`) с action routing для clipboard/clear и header операций (`sort asc/desc/clear`, `filter`, `auto-size`). Добавлен keyboard entrypoint (`Shift+F10`/`ContextMenu`) для active cell и header, меню поднято по z-index поверх pinned/overlay слоев. E2E покрытие добавлено в `tests/e2e/datagrid.regression.spec.ts`: header routing, keyboard invocation, pinned-header scenario после горизонтального скролла.

## 09. Drag & Drop Editing Flows (`target >= 9.0`)

- [x] Range drag-move (where allowed) with preview and commit/cancel.
- [x] Fill-handle integration with copy-series baseline behavior.
- [x] Auto-scroll on drag to viewport edges (X/Y).
- [x] Tests: drag across pinned boundary + large virtualized datasets.
- [x] Final score for step: `9.0`.
- Comment: `2026-02-08` - шаг закрыт: добавлен move-range flow с preview overlay, commit/cancel (`Escape`) и общим auto-scroll loop по краям viewport. Основной UX стартует drag по border зоны выделенного диапазона (без модификаторов), модификаторный старт оставлен как fallback. Move выполняется транзакционно через snapshot/mutable-map с blocked accounting для неразрешенных ячеек и корректным re-sync selection/active cell. Fill-handle и edge auto-scroll остались совместимы в едином pointer runtime. E2E добавлены в `tests/e2e/datagrid.regression.spec.ts`: move editable range, move в large virtualized+pinned сценарии с автоскроллом.

## 10. Polish + Hardening (`target >= 9.0`)

- [x] A11y pass for new features (roles, focus, announcements).
- [x] Regression bundle: e2e critical paths for sort/filter/resize/clipboard/context.
- [x] Perf gates: no regressions in row-model/harness benchmarks.
- [x] Docs: end-user interactions + integrator API usage.
- [x] Final score for step: `9.2`.
- [x] `10.4` GroupBy architecture hardening (RowModel-first, not UI-first).
- [x] `10.4.1` Introduce explicit row kinds for projection (`group|leaf`) in core model contract.
- [x] `10.4.2` Add canonical GroupBy spec (`fields[]`, `expandedByDefault`) and `setGroupBy(spec|null)` target API.
- [x] `10.4.3` Expansion contract target API (`toggleGroup(groupKey)`) with stable group identity.
- [x] `10.4.4` Enforce deterministic projection order: `filter -> sort -> groupBy -> flatten -> virtualization`.
- [x] `10.4.5` Keep selection/range semantics over flattened rows (group row is a row, not a container).
- [x] `10.4.6` Publish adapter render-meta contract (`level`, `isGroup`, `isExpanded`, `hasChildren`) and keep virtualization tree-agnostic.
- Comment: `2026-02-08` - подпункт `10.1` закрыт: в `demo-vue/src/pages/DataGridPage.vue` добавлены grid/menu A11y атрибуты (`aria-rowcount/colcount`, `aria-multiselectable`, `aria-activedescendant`, `aria-rowindex/colindex`, `aria-selected`, `aria-readonly`, labels для header/cell ids), live announcement region (`role=status`, `aria-live=polite`) и role/label для filter panel/context menu. E2E добавлены в `tests/e2e/datagrid.regression.spec.ts`: семантика active-descendant, keyboard focus в context menu, announce clipboard actions. Подпункт `10.2` закрыт: добавлен блок `datagrid critical regression bundle` в `tests/e2e/datagrid.regression.spec.ts` с двумя сквозными сценариями (baseline + pinned/virtualized) и явной проверкой отсутствия `pageerror` во время критического пути sort/filter/resize/clipboard/context. Подпункт `10.3` закрыт: добавлен runtime perf gate скрипт `scripts/check-datagrid-benchmark-report.mjs`, включен новый root script `bench:datagrid:harness:ci:gate`, `bench:regression` переведен на gated pipeline, benchmark CI job обновлен на `pnpm run bench:regression`, обновлены docs по perf/quality gates. Также добавлен архитектурный контракт GroupBy projection в `/Users/anton/Projects/affinio/docs/datagrid-groupby-rowmodel-projection.md` и ссылка в `/Users/anton/Projects/affinio/docs/datagrid-model-contracts.md`. Подпункт `10.4.1` закрыт: в core row model введены `DataGridRowKind` (`group|leaf`) и `groupMeta`, добавлены совместимые нормализаторы (`state.group -> kind=group`, default `leaf`) и type-guards `isDataGridGroupRowNode`/`isDataGridLeafRowNode` с unit coverage. Подпункт `10.4.2` закрыт: в core row model добавлен `DataGridGroupBySpec` (`fields[]`, `expandedByDefault`) и API `setGroupBy(spec|null)` с нормализацией/clone-семантикой в client/server/data-source моделях; `groupBy` включен в `DataGridRowModelSnapshot`, `DataGridApi` получил метод `setGroupBy`, а data source pull protocol расширен полями `reason=group-change` и `groupBy`. Подпункт `10.4.3` закрыт: добавлен `toggleGroup(groupKey)` в RowModel/DataGridApi, введен snapshot `groupExpansion` (`expandedByDefault`, `toggledGroupKeys`), expansion state хранится отдельно от source rows и передается в data-source pull request как `groupExpansion`; viewport model bridge теперь учитывает `groupExpansion` при invalidation. Подпункт `10.4.4` закрыт: `createClientRowModel` переведен на детерминированный projection pipeline (`filter -> sort -> groupBy -> flatten`) с выдачей flattened rows для virtualization, добавлены контрактные тесты порядка/flatten/collapse и обновлена bridge invalidation логика с учетом `groupExpansion`. Подпункт `10.4.5` закрыт: в `packages/datagrid-core/src/selection/selectionState.ts` добавлен helper `createGridSelectionContextFromFlattenedRows`, который связывает selection с текущим flattened stream (group+leaf), а в `packages/datagrid-core/src/selection/__tests__/selectionState.grouped.contract.spec.ts` зафиксированы контрактные сценарии `single group row`, `shift-range by flattened order` и `collapsed groups clamp` (без implicit child selection). Подпункт `10.4.6` закрыт: в `packages/datagrid-core/src/models/rowModel.ts` опубликован adapter-level helper `getDataGridRowRenderMeta(rowNode)` и контракт `DataGridRowRenderMeta` (`level`, `isGroup`, `isExpanded`, `hasChildren`), добавлен unit coverage в `packages/datagrid-core/src/models/__tests__/rowModel.spec.ts`; virtualization/runtime при этом остаются tree-agnostic и не получают tree-зависимостей. Подпункт docs закрыт: добавлен `/Users/anton/Projects/affinio/docs/datagrid-sheets-user-interactions-and-integrator-api.md` (end-user interactions + integrator API usage), а umbrella-пункт `10.4` отмечен как закрытый после закрытия всех подпунктов.

## 11. Undo/Redo Model Capability (`target >= 9.0`)

- [x] `11.1` Introduce bounded history policy (`maxHistoryDepth`) in core transaction service.
- [x] `11.2` Wire intent-level transaction labels/ranges for clipboard/fill/move/edit operations.
- [x] `11.3` Add API-level shortcuts for history control (`undo`/`redo`) in demo runtime wiring.
- [x] `11.4` Add keyboard bindings (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`) with deterministic focus behavior.
- [x] `11.5` Add e2e regression bundle for history: paste/fill/move/cut/edit with grouped + virtualized viewport.
- [x] Final score for step: `9.1`.
- Comment: `2026-02-08` - подпункт `11.1` закрыт: в `packages/datagrid-core/src/core/transactionService.ts` добавлен `maxHistoryDepth` (bounded undo stack без изменения apply semantics), добавлен контрактный тест в `packages/datagrid-core/src/core/__tests__/transactionService.contract.spec.ts` (overflow history keeps latest intent-level transactions only). Подпункт `11.2` закрыт: transaction contract расширен `meta` (`intent`, `affectedRange`) для input/command/event, и demo wiring в `demo-vue/src/pages/DataGridPage.vue` теперь записывает intent-транзакции (`paste`, `cut`, `clear`, `fill`, `move`, `edit`) с label + affected range через `createDataGridTransactionService`. Подпункт `11.3` закрыт: demo runtime подключен к core transaction capability (`services.transaction` + `DataGridApi.applyTransaction/undoTransaction/redoTransaction`) вместо прямых вызовов локального runtime. Подпункт `11.4` закрыт: добавлены deterministic keyboard bindings `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z` и `Ctrl+Y` в `onViewportKeyDown`, с приоритетным перехватом до навигации/контекстного меню. Подпункт `11.5` закрыт: в `tests/e2e/datagrid.regression.spec.ts` добавлен history regression bundle с grouped + virtualized setup (`Rows=6400`, `Group by=Service`, pinned column, long vertical/horizontal session) и проверками undo/redo для `edit`, `paste`, `cut`, `fill`, `move` через keyboard и control buttons.

## 12. Tree/AdvancedFilter/Summary/Visibility Hardening (`target >= 9.0`)

- [x] `12.1` TreeView baseline formalized as RowModel projection contract (group rows as virtual rows, expansion state in model, flattened viewport boundary).
- [x] `12.2` Advanced filter upgraded from column-only clauses to declarative expression AST (`condition|group|not`) with legacy compatibility bridge.
- [x] `12.3` Selection summarize engine added in core (`count`, `countDistinct`, `sum`, `avg`, `min`, `max`) with API facade access.
- [x] `12.4` Column visibility contract fixed as canonical projection boundary for selection/summary/navigation (`visibleColumns` as source of truth).
- [x] Final score for step: `9.2`.
- Comment: `2026-02-09` - `12.1` закрыт документально и контрактно: `docs/datagrid-model-contracts.md` обновлен секцией `TreeView Contract`, модельная граница зафиксирована как `filter -> sort -> group/tree -> flatten -> virtualization`. `12.2` закрыт реализационно: добавлен headless expression engine `packages/datagrid-core/src/models/advancedFilter.ts` (typed operators, nested `and/or/not`), расширен `DataGridFilterSnapshot` полем `advancedExpression`, `createClientRowModel` переведен на expression evaluation с back-compat через `buildDataGridAdvancedFilterExpressionFromLegacyFilters`, добавлены unit/contract tests (`models/__tests__/advancedFilter.spec.ts`, `models/__tests__/clientRowModel.spec.ts`). `12.3` закрыт реализационно: добавлен core summary engine `packages/datagrid-core/src/selection/selectionSummary.ts` + API facade `DataGridApi.summarizeSelection(...)` (`packages/datagrid-core/src/core/gridApi.ts`) и contract tests (`selection/__tests__/selectionSummary.spec.ts`, `core/__tests__/gridApi.contract.spec.ts`). `12.4` подтвержден как canonical boundary через ColumnModel snapshot (`visibleColumns`) и зафиксирован в docs/contracts.

## 13. Demo-first Feature Lift (`internal demo -> sugar`)

- [x] `13.1` Internal demo wired with advanced-filter presets and active-state indicators.
- [x] `13.2` Internal demo wired with selection summarize metrics (`sum/avg/countDistinct`).
- [x] `13.3` Sugar API (`useAffinoDataGrid`) exposes filtering + summary features for integrators.
- [x] `13.4` Column visibility shipped as runtime feature in both internal demo and sugar API.
- [x] `13.5` TreeView parent/child projection UX in internal demo (expand/collapse virtual tree rows, not only grouped badges).
- [x] `13.6` Decompose `useAffinoDataGrid` into feature-focused sub-composables (`selection/clipboard/editing/filtering/summary/visibility`) and keep top-level composable as orchestrator.
- Comment: `2026-02-09` - step `13` закрыт полностью: `13.1-13.5` выполнены (advanced filter + summary + visibility + tree runtime UX в internal demo), и `13.6` выполнен рефактором sugar оркестратора. В `useAffinoDataGrid` оставлен orchestration-layer, а feature-логика вынесена в отдельные composables: `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridSelectionFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridClipboardFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridEditingFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridFilteringFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridSummaryFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridVisibilityFeature.ts`, `/Users/anton/Projects/affinio/packages/datagrid-vue/src/composables/useAffinoDataGridTreeFeature.ts`. Summary wiring остался через публичный API контракт `runtime.api.summarizeSelection(...)`, tree sugar добавлен через `features.tree` (`setGroupBy/toggleGroup/expandAll/collapseAll` + reactive `groupBy/groupExpansion`). Документация для интеграторов расширена playbook-файлом `/Users/anton/Projects/affinio/docs/datagrid-vue-sugar-playbook.md` и ссылками из README/adapter guide.

## Close Log

- `2026-02-08`: checklist created.
- `2026-02-08`: step `01` fully closed with score `9.1`.
- `2026-02-08`: step `02` fully closed with score `9.1`.
- `2026-02-08`: step `03` fully closed with score `9.0`.
- `2026-02-08`: step `04` fully closed with score `9.0`.
- `2026-02-08`: step `05` fully closed with score `9.0`.
- `2026-02-08`: step `06` fully closed with score `9.0`.
- `2026-02-08`: step `07` fully closed with score `9.0`.
- `2026-02-08`: step `08` fully closed with score `9.0`.
- `2026-02-08`: step `09` fully closed with score `9.0`.
- `2026-02-08`: step `10.1` (A11y pass) closed.
- `2026-02-08`: step `10.2` (regression bundle) closed.
- `2026-02-08`: step `10.3` (perf gates) closed.
- `2026-02-08`: ad-hoc extension before `10.4`: baseline `Group by` added to Vue demo (`service/owner/region/environment/severity/status`) with grouping metrics and e2e coverage.
- `2026-02-08`: step `10.4.1` (row kinds in core contract) closed.
- `2026-02-08`: step `10.4.2` (GroupBy spec + row model API) closed.
- `2026-02-08`: step `10.4.3` (group expansion toggle contract) closed.
- `2026-02-08`: step `10.4.4` (deterministic projection order) closed.
- `2026-02-08`: step `10.4.5` (selection/range semantics over flattened rows) closed.
- `2026-02-08`: step `10.4.6` (adapter render-meta contract, tree-agnostic virtualization boundary) closed.
- `2026-02-08`: step `11.1` (transaction history cap via `maxHistoryDepth`) closed.
- `2026-02-08`: step `11.2` (intent-level transaction labels/ranges for paste/cut/clear/fill/move/edit) closed.
- `2026-02-08`: step `11.3` (API-level history wiring through `DataGridApi` + core transaction service capability) closed.
- `2026-02-08`: step `11.4` (history keyboard bindings with deterministic interception) closed.
- `2026-02-08`: step `11.5` (grouped+virtualized e2e history bundle for edit/paste/cut/fill/move with keyboard/control undo-redo) closed.
- `2026-02-08`: step `10` fully closed with score `9.2` (including docs + 10.4 umbrella close).
- `2026-02-08`: step `11` fully closed with score `9.1`.
- `2026-02-09`: step `12` fully closed with score `9.2`.
- `2026-02-09`: step `13` fully closed (internal demo uplift + sugar feature decomposition complete).
