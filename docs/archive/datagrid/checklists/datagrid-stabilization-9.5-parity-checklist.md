# DataGrid Stabilization and Parity Checklist (AG-level Track)

Baseline date: `2026-02-07`  
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core` + `/Users/anton/Projects/affinio/packages/datagrid-vue`  
Goal: стабилизировать runtime-проблемы (pinning/virtualization/overlay sync) и поднять каждый блок до `>= 9.5`.

## Execution Rules

- Работаем one-by-one: закрываем один пункт, ставим `[x]`, оставляем комментарий и останавливаемся.
- Пункт закрывается только если есть: code + tests + doc update + оценка.
- Приоритет: от самого рискованного к менее рискованному.

## Baseline (Before Stabilization Sprint)

- Pinning correctness and layout invariants: `6.1`
- Horizontal virtualization under pinning: `6.4`
- Overlay/fill-handle sync with pinned/scroll: `5.9`
- Scroll/resize determinism under stress: `7.0`
- API/DX predictability for integration: `8.3`

## Pipeline (Worst -> Best)

## 01. Pinning Math and Invariants (`target >= 9.5`)

- [x] Убрать synthetic index inset из viewport math (без phantom width).
- [x] Зафиксировать single-source math: `effectiveViewport = viewportWidth - pinnedLeftWidth - pinnedRightWidth`.
- [x] Убрать double counting pinned width из content width estimate.
- [x] Добавить contract tests на pinning-мета инварианты.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - в `dataGridViewportHorizontalMeta` удалён synthetic `INDEX_COLUMN_WIDTH` inset (`indexColumnWidth` теперь compatibility field = `0`, `containerWidthForColumns` опирается на реальный `viewportWidth`), `effectiveViewport` теперь вычитает только реальные pinned-width. В `dataGridViewportController` убран double-count (`totalPinnedWidth` без `indexColumnWidth`) и отключены горизонтальные pinned-offset shifts в sync-path (`left/right = 0`). Добавлен контракт-тест `packages/datagrid-core/src/viewport/__tests__/horizontalMeta.pinning.contract.spec.ts`.

## 02. Horizontal Virtualization + Pinning Coupling (`target >= 9.5`)

- [x] Закрыть инварианты range/clamp при resize + teleport scroll с pinned mix.
- [x] Ввести deterministic clamp envelope для wide datasets (500+ columns).
- [x] Добавить regression tests для pinned+horizontal stress path.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - стабилизирован coupling горизонтальной виртуализации и pinning: в `horizontalVirtualizer.ts` добавлена инвалидация clamp/range cache по overscan и mode (`virtualizationEnabled`), что убирает stale-range на одинаковом offset при изменении overscan. В `dataGridViewportHorizontalMeta.ts` signature расширен `nativeScrollLimit` для детерминированной версии meta при resize/scroll-width изменениях. В `scrollLimits.ts` добавлен deterministic clamp envelope: при сильном drift `nativeLimit` относительно virtualization bounds maxScroll ограничивается вокруг virtualization-предела вместо неконтролируемого прыжка в native-limit. Добавлены regression tests: `packages/datagrid-core/src/viewport/__tests__/horizontalCoupling.contract.spec.ts`.

## 03. Overlay and Fill-Handle Sync (`target >= 9.5`)

- [x] Нормализовать transform contract для pinned-left/right overlays.
- [x] Синхронизировать overlay/fill-handle с core scroll-sync без drift.
- [x] Добавить contract tests на pinned overlay geometry + fill-handle alignment.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - overlay transform контракт расширен до явного scroll-state (`scrollLeft`, `scrollTop`) в `UiTableOverlayTransformInput`; добавлен единый transform-builder (`composables/selectionOverlayTransform.ts`) и подключён в `useSelectionOverlayAdapter.ts`. В `DataGridOverlayLayer.vue` добавлена компенсация root scroll-transform для fill-handle через `components/overlayFillHandle.ts`, а также reapply fill-handle при каждом transform update (исключён drift при scroll). Для pinned-right смещение нормализовано к real max-scroll baseline (`totalWidthDom - viewportWidth`) в `DataGrid.vue`; `selectionOverlayColumnSurfaces` переведён в world-space координаты для детерминированной геометрии pinned/center/right. Добавлены contract tests: `src/composables/__tests__/selectionOverlayTransform.contract.spec.ts`, `src/components/__tests__/overlayFillHandle.contract.spec.ts`.

## 04. Scroll/Resize Determinism Hardening (`target >= 9.5`)

- [x] Зафиксировать idempotent update semantics на repeated refresh.
- [x] Добавить stress regressions для resize storm + scroll storm.
- [x] Включить fail-fast quality lock для новых regression suites.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - стабилизирована idempotency repeated refresh: в `dataGridViewportVirtualization.ts` row-pool version больше не инкрементируется на неизменном окне, `onRows` теперь эмитится только при реальном изменении snapshot/геометрии; в `dataGridViewportController.ts` добавлен dedupe для `onColumns` и `onScrollSync` (signature-based), чтобы forced refresh без state-delta не генерировал повторные imperative events. Для resize-storm в `dataGridViewportScrollIo.ts` добавлен guard: heavy update от ResizeObserver запускается только при изменении layout-метрик (`captureLayoutMetrics` возвращает `boolean`). Добавлен regression suite `packages/datagrid-core/src/viewport/__tests__/scrollResizeDeterminism.contract.spec.ts` (idempotent forced refresh + deterministic replay resize/scroll storm), и fail-fast lock через `packages/datagrid-core/package.json` (`test:regressions`) + root `package.json` (`test:datagrid:regressions` включён в `quality:lock:datagrid`).

## 05. Integration and DX Polish (`target >= 9.5`)

- [x] Обновить integration docs и migration notes под stabilized contracts.
- [x] Закрыть API ambiguities по pinned/overlay state exposure.
- [x] Добавить примеры deterministic integration setup.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - добавлен явный semver-safe viewport snapshot API (`getIntegrationSnapshot`, `getViewportSyncState`) в `dataGridViewportController.ts` + тип `ViewportIntegrationSnapshot` (`dataGridViewportTypes.ts`) и DataGrid alias `DataGridViewportIntegrationSnapshot` (`viewport/dataGridViewportController.ts`, `public.ts`) для закрытия ambiguities по pinned/overlay exposure без чтения внутренних signals/DOM. Добавлен contract test `packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts` (deterministic snapshot + copy semantics). В `@affino/datagrid-vue` стабильная публичная поверхность расширена deterministic overlay helpers (`buildSelectionOverlayTransform*`) через `src/public.ts` и закреплена `src/__tests__/publicApi.contract.spec.ts`. Обновлены integration/migration docs и добавлен пример setup: `docs/datagrid-vue-adapter-integration.md`, `docs/datagrid-migration-guide.md`, `docs/datagrid-grid-api.md`, `docs/datagrid-deterministic-integration-setup.md`, а также package READMEs.

## Close Log

- `2026-02-07`: создан stabilization parity checklist.
- `2026-02-07`: закрыт пункт `01` (Pinning Math and Invariants), оценка `9.5`.
- `2026-02-07`: закрыт пункт `02` (Horizontal Virtualization + Pinning Coupling), оценка `9.5`.
- `2026-02-07`: закрыт пункт `03` (Overlay and Fill-Handle Sync), оценка `9.5`.
- `2026-02-07`: закрыт пункт `04` (Scroll/Resize Determinism Hardening), оценка `9.5`.
- `2026-02-07`: закрыт пункт `05` (Integration and DX Polish), оценка `9.6`.
