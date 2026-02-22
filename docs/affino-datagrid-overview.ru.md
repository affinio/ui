# Обзор Affino DataGrid

Актуально: 2026-02-10

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

Ключевые возможности core

- Row model с сортировкой, фильтрацией, группировкой, пагинацией и управлением viewport диапазоном.
- Column model с каноническими определениями, видимостью, порядком, размерами и pinning.
- Headless edit model с детерминированными снапшотами и ревизиями.
- Selection снапшоты и summary агрегаты (count, countDistinct, sum, avg, min, max).
- Протокол data source с pull, push, invalidation и backpressure диагностикой.
- Viewport controller и виртуализация, рассчитанные на предсказуемую производительность.
- Transaction service с rollback, batching и undo/redo (advanced API).
- Accessibility state machine для ARIA и клавиатурного поведения (advanced API).
- Модель capability для плагинов с fail-fast доступом.

Публичные уровни API

Stable entrypoint: @affino/datagrid-core

- createDataGridCore, createDataGridApi
- createClientRowModel, createServerBackedRowModel
- createDataGridColumnModel, createDataGridEditModel
- selection summary helpers и канонические типы
- semver protocol helpers и public protocol metadata

Advanced entrypoint: @affino/datagrid-core/advanced

- createDataGridRuntime
- createDataGridAdapterRuntime
- createDataGridTransactionService
- createDataGridViewportController
- createDataSourceBackedRowModel
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
- docs/datagrid-gridcore-service-registry.md
- docs/datagrid-model-contracts.md
- docs/datagrid-tree-data.md
- docs/datagrid-data-source-protocol.md
- docs/datagrid-cross-platform-adapter-protocol.md
- docs/datagrid-plugin-capability-model.md
- docs/datagrid-performance-gates.md
- docs/datagrid-perf-by-design-runtime.md
- docs/archive/datagrid/pipelines/datagrid-wave2-enterprise-architecture-pipeline.md
