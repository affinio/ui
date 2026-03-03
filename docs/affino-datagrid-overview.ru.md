# Обзор Affino DataGrid

Актуально: 2026-03-03

Канонический перечень возможностей:

- docs/datagrid-feature-catalog.md
- docs/datagrid-commercial-packaging-plan.md

Affino DataGrid — это headless и детерминированный движок для таблиц уровня enterprise, рассчитанный на стабильное поведение при тяжёлых сценариях скролла, выделения и редактирования. Core остаётся независимым от фреймворка, а адаптеры (например, Vue) остаются тонкими, с контрактными тестами и performance gate проверками.

Назначение

- Дать стабильный, semver-safe публичный API для моделей, состояния и runtime сервисов.
- Сохранить тонкие адаптеры, вынеся поведение в core и общий orchestration слой.
- Гарантировать детерминизм через строгие контракты и инварианты.
- Контролировать производительность через бюджетные ограничения и CI-гейты.

Архитектура кратко

- @affino/datagrid-core владеет моделями, runtime сервисами, контролем viewport, selection геометрией и детерминированной математикой.
- @affino/datagrid-vue — тонкий Vue-адаптер, который мапит host события и рендерит состояние без пере-владения логикой.
- @affino/datagrid-orchestration — фреймворк-агностичный слой orchestration хелперов, общий для Vue, Laravel и React.

Гайд по выбору режима выполнения

- main-thread: для небольших/средних таблиц с невысоким mutation pressure и минимальной операционной сложностью.
- worker-owned: для интерактивно-нагруженных сценариев (частые patch/edit + sort/group/filter), где bottleneck — main thread responsiveness.
- server-side row model: для очень больших/удаленных датасетов, где фильтрация/группировка/pivot/query shape должны принадлежать backend.

Практическая политика:

- Стартовать с main-thread.
- Переходить на worker-owned, когда синхронное интерактивное давление вызывает UI-столлы.
- Переходить на server-side, когда доминирует backend-owned обработка данных.

Ключевые возможности core

- Стабильный namespace-based фасад `DataGridApi` (`lifecycle/rows/data/columns/view/pivot/selection/transaction/state/events/meta/policy/compute/diagnostics/plugins`).
- Unified state contract (`api.state.get/set`) с partial/strict restore контролями.
- Публичный backpressure control surface (`api.data.pause/resume/flush`) для поддерживаемых server/data-source моделей.
- Typed public event surface (`api.events.on`) с детерминированным in-process порядком событий.
- Row model с сортировкой, фильтрацией, группировкой, пагинацией и управлением viewport диапазоном.
- Column model с каноническими определениями, видимостью, порядком, размерами и pinning.
- Headless edit model с детерминированными снапшотами и ревизиями.
- Selection снапшоты и summary агрегаты (count, countDistinct, sum, avg, min, max).
- Протокол data source с pull, push, invalidation и backpressure диагностикой.
- Viewport controller и виртуализация, рассчитанные на предсказуемую производительность.
- Transaction service с rollback, batching и undo/redo (advanced API).
- Accessibility state machine для ARIA и клавиатурного поведения (advanced API).
- Модель capability для плагинов с fail-fast доступом.

Функциональная поверхность (что можно построить)

- Spreadsheet-подобные сценарии: range selection, fill handle, range move, clipboard copy/paste/cut.
- Editing lifecycle: patch rows, freeze/reapply поведение, детерминированные revision snapshots.
- Pivot-сценарии: динамические pivot columns, subtotal/grand total, export/import layout, drilldown.
- Group/tree-сценарии: детерминированная group projection, expand/collapse, aggregate pipeline.
- Viewport/virtualization: предсказуемая синхронизация visible range и контракты производительного рендера.
- Runtime diagnostics: compute/transport диагностика, quality gates, benchmark baselines.
- Compute/policy control: переключение compute mode и projection policy (`mutable/immutable/excel-like`).
- Extensibility surface: стабильная регистрация плагинов (`api.plugins`) + advanced runtime hooks.

Срез производительности (простым языком)

По последней worker pressure matrix (scaled patch profile):

- 20k строк: worker-owned примерно в 5.4x быстрее main-thread по end-to-end сценарию.
- 100k строк: worker-owned примерно в 1.6x быстрее.
- 200k строк (более тяжелый patch size): worker-owned примерно в 1.34x быстрее.

Как интерпретировать:

- Worker-owned обычно оптимизирует отзывчивость UI.
- Main-thread остаётся валидным для простых/меньших таблиц.
- Server-side — следующий шаг, когда масштаб и shape данных принадлежат backend.

Публичные уровни API

Stable entrypoint: @affino/datagrid-core

- createDataGridCore, createDataGridApi
- createClientRowModel
- createDataGridColumnModel, createDataGridEditModel
- selection summary helpers и канонические типы
- semver protocol helpers и public protocol metadata

Pro stable entrypoint: @affino/datagrid-core/pro

- createServerBackedRowModel, createDataSourceBackedRowModel, createServerRowModel
- createDataGridServerPivotRowId и server/data-source контракты

Advanced entrypoint: @affino/datagrid-core/advanced

- createDataGridRuntime
- createDataGridAdapterRuntime
- createDataGridTransactionService
- createDataGridViewportController
- createDataGridA11yStateMachine

Internal entrypoint: @affino/datagrid-core/internal

- unsafe хелперы без semver гарантий

Vue публичная поверхность

Stable entrypoint: @affino/datagrid-vue

- useAffinoDataGrid, useAffinoDataGridUi
- useDataGridRuntime, useDataGridContextMenu, useDataGridOverlayScrollState
- createDataGridVueRuntime
- DataGrid, AffinoDataGridSimple
- A11y mapping helpers и selectors

Orchestration слой

Этот пакет содержит чистую TypeScript логику, которую переиспользуют адаптеры для единообразного поведения. Здесь централизованы copy, paste, cut, fill, move, pointer и selection lifecycle, а также другие interaction policy, чтобы адаптеры оставались тонкими.

Performance и quality gates

- Контрактные тесты фиксируют детерминизм и инварианты моделей, runtime и orchestration.
- CI-гейты контролируют latency, FPS, память и variance для ключевых бенчмарков.
- Baseline drift lock обеспечивает строгий контроль регрессий.

Ключевые ссылки (доки репозитория)

- docs/datagrid-architecture.md
- docs/datagrid-grid-api.md
- docs/datagrid-core-factories-reference.md
- docs/datagrid-core-advanced-reference.md
- docs/datagrid-state-events-compute-diagnostics.md
- docs/datagrid-gridcore-service-registry.md
- docs/datagrid-model-contracts.md
- docs/datagrid-tree-data.md
- docs/datagrid-data-source-protocol.md
- docs/datagrid-cross-platform-adapter-protocol.md
- docs/datagrid-plugin-capability-model.md
- docs/datagrid-performance-gates.md
- docs/datagrid-perf-by-design-runtime.md
- docs/archive/datagrid/pipelines/datagrid-wave2-enterprise-architecture-pipeline.md

Коммерческая упаковка (SKU-слой)

- `@affino/datagrid`: community-коммерческий фасад с дефолтным community-gating.
- `@affino/datagrid-pro`: пакет активации pro-возможностей (`enableProFeatures`), снимающий pro-gated ограничения рантайма.
- `Enterprise`: операционный слой поддержки/SLA/интеграции поверх Pro-пакета.
