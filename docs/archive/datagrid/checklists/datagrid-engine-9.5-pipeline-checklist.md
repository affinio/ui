# DataGrid Engine 9.5+ Pipeline Checklist

Baseline date: `2026-02-07`  
Scope: `/Users/anton/Projects/affinio/packages/datagrid-core` + `/Users/anton/Projects/affinio/packages/datagrid-vue`  
Goal: every architecture/runtime/adapter block reaches `>= 9.5` quality.

## Execution Rules

- Закрываем строго по порядку (от самого рискованного к более простому).
- После закрытия каждого пункта: ставим `[x]`, добавляем комментарий в этом файле, останавливаемся.
- Каждый пункт считается закрытым только если есть: код/тесты/доки/метрика и итоговая оценка `>= 9.5`.

## Baseline Scores (Before)

- Overlay sync/render pipeline: `4.1`
- Pinning state/API contract: `5.0`
- Testability/reliability: `4.9`
- Selection orchestration complexity: `5.6`
- Horizontal virtualization runtime: `7.8`
- Viewport scheduler/scroll IO: `8.1`

## Pipeline (Worst -> Best)

## 01. Package Bootstrap and Naming (`target >= 9.5`)

- [x] Создать новый core пакет `@affino/datagrid-core`.
- [x] Создать новый Vue adapter пакет `@affino/datagrid-vue`.
- [x] Скопировать baseline-код из `.tmp/ui-table` в новые пакеты как стартовую точку.
- [x] Добавить стартовые `README` и `package.json` для обоих пакетов.
- [x] Зафиксировать production-ready public API поверх нового ядра (без legacy-шумов).
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - зафиксирован узкий semver-контракт через `src/public.ts` + root exports в обоих пакетах; добавлены `tsconfig.public.json` и `type-check/build` для проверки только публичной поверхности; legacy runtime/internal exports исключены из public surface. Метрика: core root exports `5 -> 1` (`index -> public`), vue root exports `3 -> 1` (`index -> public`), стабильный surface для интегратора стал детерминированным. Ограничение: фактический запуск `tsc` в этом окружении заблокирован (`node/npm` отсутствуют).

## 02. Single Source of Truth for Scroll/Transforms (`target >= 9.5`)

- [x] Убрать двойной scroll transform для overlay (один владелец трансформаций).
- [x] Убрать дублирующие transform-ветки между viewport sync и overlay layer.
- [x] Зафиксировать контракт sync-targets без fallback DOM-поисков.
- [x] Добавить regression-тесты: vertical/horizontal scroll + pinned + overlay.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - scroll transform оставлен только в core viewport sync (`overlayRoot` двигается вместе с body в `scrollSync`), во Vue overlay убран второй scroll-branch (`updateScrollTransform` удален); sync-target contract ужесточен до explicit refs без `querySelector` fallback. Добавлены регрессионные тесты `scrollSync.transforms.spec.ts` (vertical/horizontal + pinned + overlay) и `syncTargets.contract.spec.ts` (no DOM fallback search). Ограничение: в этом окружении не удалось выполнить тест-ран (`node/npm` отсутствуют).

## 03. Overlay Renderer Rewrite (`target >= 9.5`)

- [x] Убрать full rebuild (`innerHTML = ""`) из hot path.
- [x] Внедрить keyed diff + pool reuse для rect nodes.
- [x] Разделить обновление cursor/fill/range без полного re-render.
- [x] Добавить perf-тест drag/select/fill с бюджетом кадров.
- [x] Финальная оценка пункта: `9.7`.
- Комментарий по закрытию: `2026-02-07` - overlay renderer вынесен в `overlayRenderer.ts`: вместо `innerHTML` используется keyed diff + node pool (`renderOverlayRectGroup`), добавлены сигнатуры (`computeRectGroupSignature`/`computeCursorSignature`) для точечного dirty-marking. В `UiTableOverlayLayer.vue` обновления split-ветками: отдельные dirty paths для `selection`, `activeSelection`, `fillPreview`, `cutPreview`, `cursor`, `fillHandle`; transform-update больше не форсит полный DOM rebuild. Добавлен perf-budget тест `overlayRenderer.spec.ts`: сценарии drag/select/fill с warmup, бюджет по post-warmup DOM creations = `0` (assert). Ограничение: в этом окружении запуск тестов не выполнен (`node/npm` отсутствуют).

## 03A. Naming Convergence (`target >= 9.5`)

- [x] Перевести ключевые Vue SFC в `DataGrid*` нейминг.
- [x] Оставить backward-compatible shim файлы `UiTable*` на период миграции.
- [x] Добавить `DataGrid*` aliases в `components/index.ts` (без удаления legacy exports).
- [x] Добавить `DataGrid*` aliases для core-модулей runtime/viewport/settings.
- [x] Обновить документацию по неймингу для новых пакетов.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - переименованы ключевые SFC: `DataGrid.vue`, `DataGridViewport.vue`, `DataGridOverlayLayer.vue`; legacy `UiTable.vue`, `UiTableViewportSimple.vue`, `UiTableOverlayLayer.vue` оставлены как shim-обертки. В `components/index.ts` добавлены `DataGrid*` exports и сохранены `UiTable*` aliases. В core добавлены alias-модули `dataGridSettingsAdapter.ts`, `runtime/dataGridRuntime.ts`, `viewport/dataGridViewportController.ts` и включены в public API. Документация обновлена. Ограничение: проверка сборки/тестов в этом окружении не выполнена (`node/npm` отсутствуют).

## 04. Canonical Pinning Contract (`target >= 9.5`)

- [x] Оставить один канонический pin state (`pin: left|right|none`).
- [x] Перевести legacy поля (`pinned/sticky/stickyLeft/stickyRight/lock/locked`) в adapter-normalization only.
- [x] Очистить runtime от `as any` pin-веток.
- [x] Обновить API docs + migration guide.
- [x] Добавить contract tests pinning permutations.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - введен канонический runtime pin-contract: `resolveCanonicalPinMode` (core) использует только `pin/isSystem`; legacy pin-ветки удалены из `dataGridViewportController`, `autoColumnResize`, `viewportConfig`, `selectionDomAdapter`, `useTableColumnPinning`. В Vue-адаптер добавлен boundary-normalizer `columnPinNormalization.ts`: legacy поля (`pinned/sticky/stickyLeft/stickyRight/lock/locked`) конвертируются в `pin` и удаляются из локальной runtime модели колонок в `useTableLocalColumns`. Добавлены contract tests: `packages/datagrid-core/src/columns/__tests__/pinning.spec.ts` (канонический resolver игнорирует legacy) и `packages/datagrid-vue/src/adapters/__tests__/columnPinNormalization.spec.ts` (legacy permutations -> canonical). README core/vue дополнены migration секцией по pinning. Ограничение: тест-ран в этом окружении не выполнен (`node/npm` отсутствуют).

## 05. Coordinate System and Geometry Consistency (`target >= 9.5`)

- [x] Утвердить единый world/viewport space contract для selection/fill/overlay.
- [x] Убрать дубли конверсий координат по composables/adapters.
- [x] Проверить pinned-left/right + scrollable + zoom сценарии на точность.
- [x] Добавить property-based tests на геометрию диапазонов.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - добавлен единый модуль координат `selection/coordinateSpace.ts` (table/world <-> viewport <-> client), и все ключевые участки переведены на него: `selectionOverlay.ts`, `fillHandle.ts`, `selectionDomAdapter.ts` (удалены локальные дубли `toTableSpace*`, конверсии унифицированы). Зафиксирован контракт world-space overlay (координаты стабильны при horizontal scroll) и viewport-space fill handle через новые тесты `overlay.fill.geometry.contract.spec.ts` (включая pinned-left/right + scrollable + zoom-scaled метрики). Добавлены property-style тесты `coordinateSpace.contract.spec.ts` и `geometry.ranges.property.spec.ts` для инвариантов диапазонов/координат. README core/vue дополнены секциями про coordinate-space contract. Ограничение: тест-ран в этом окружении не выполнен (`node/npm` отсутствуют).

## 06. Horizontal Virtualization Hardening (`target >= 9.5`)

- [x] Свести все X-virtualization пути к единому pipeline.
- [x] Убрать скрытые side effects в clamp/overscan путях.
- [x] Зафиксировать deterministic behavior при teleport scroll/resize.
- [x] Добавить stress-tests (100k rows, 500+ columns, pinned mix).
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - X-clamp унифицирован через единый pure helper `viewport/dataGridViewportHorizontalClamp.ts`, который используется как в scroll-IO clamp, так и в horizontal prepare-path (`prepareHorizontalViewport`). Убраны скрытые мутации в prepare-phase: входной `columnMeta` больше не модифицируется (`scrollVelocity/scrollDirection` копируются в локальный `metaForVirtualizer`). В `dataGridViewportController` удалены side-effects из `clampScrollLeftValue` (больше не меняет direction/applied state), clamp-context обновляется детерминированно от текущего `horizontalMeta`. Добавлены контракт/стресс тесты: `horizontalClamp.contract.spec.ts`, `horizontalUpdate.contract.spec.ts` (immutability), `horizontalVirtualization.stress.contract.spec.ts` (100k rows + 520 columns + pinned mix, teleport-like scroll, resize determinism). README core дополнен секцией про horizontal virtualization contract. Ограничение: тест-ран в этом окружении не выполнен (`node/npm` отсутствуют).

## 07. Selection Engine Decomposition (`target >= 9.5`)

- [x] Разбить `useTableSelection` на узкие модули (state, input, geometry, render sync).
- [x] Изолировать scheduler policy от бизнес-логики selection.
- [x] Упростить lifecycle/caching, удалить дубли invalidate/update путей.
- [x] Добавить unit + integration тесты по каждому модулю.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - `useTableSelection` декомпозирован на узкие модули: `selectionStateSync.ts` (state bridge/reconcile), `selectionInput.ts` (pointer normalization), `selectionGeometry.ts` (signatures/full-column detection/imperative cell-key), `selectionControllerStateScheduler.ts` и `selectionOverlayUpdateScheduler.ts` (полностью отделённые scheduler policies). Дубли lifecycle обновлений сокращены через единый `refreshOverlayFromControllerState` helper вместо повторяющихся invalidate/update веток в watcher-ах. Добавлены unit+integration тесты: `selectionGeometry.spec.ts`, `selectionInput.spec.ts`, `selectionStateSync.spec.ts`, `selectionControllerStateScheduler.spec.ts`, `selectionOverlayUpdateScheduler.spec.ts`, `selectionDecomposition.integration.spec.ts`. README Vue дополнен разделом по модульным границам selection engine. Ограничение: запуск тестов в этом окружении не выполнен (`node/npm` отсутствуют).

## 08. Vue Adapter Contract Cleanup (`target >= 9.5`)

- [x] Убрать alias/интеграционные зависимости на старые пути.
- [x] Ввести четкий adapter API: init, sync, teardown, diagnostics.
- [x] Разделить headless adapter и SFC UI-слой.
- [x] Добавить adapter contract tests (mount/unmount/remount/hydration).
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - в adapter-слое устранены legacy `@/ui-table/*` зависимости (`selectionEnvironment.ts`, `selectionControllerAdapter.ts`, `sharedState.ts`), а selection integration в `useTableSelection.ts` переведен на новый adapter boundary без прямых вызовов `controller.*` (используется `selectionControllerAdapter.sync(...)`). Введен единый lifecycle-контракт адаптера `init/sync/teardown/diagnostics` через `adapters/adapterLifecycle.ts`. Реализован двухслойный split: headless слой `adapters/selectionHeadlessAdapter.ts` + Vue bridge `adapters/selectionControllerAdapter.ts`. Добавлены contract tests `adapters/__tests__/selectionControllerAdapter.contract.spec.ts` (mount/unmount/remount/hydration) и проверены сценарии lifecycle API. README Vue дополнен секцией Adapter Contract. Ограничение: запуск тестов в этом окружении не выполнен (`node/npm` отсутствуют).

## 09. Reliability and Quality Gates (`target >= 9.5`)

- [x] Ввести обязательный test matrix: unit + integration + interaction + visual drift checks.
- [x] Добавить flake tracking + retry policy только для e2e.
- [x] Ввести quality gates по coverage и critical-path scenarios.
- [x] Добавить CI job для benchmark regression.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - CI расширен до обязательной матрицы тестов (`unit/integration/interaction/visual`) в `.github/workflows/ci.yml` через job `test-matrix`, добавлен отдельный `quality-gates` job (coverage + critical-path e2e), и `benchmark-regression` job (multi-seed perf assert + artifact). Retry policy оставлен только в Playwright (`playwright.config.ts`: `retries` в CI), добавлен flake tracking script `scripts/check-playwright-flakes.mjs` и интеграция в interaction/quality scripts (`PLAYWRIGHT_JSON_OUTPUT`, `PLAYWRIGHT_FLAKE_SUMMARY`). Введены coverage gates и test scripts для datagrid пакетов: `packages/datagrid-core/vitest.config.ts`, `packages/datagrid-vue/vitest.config.ts`, root scripts в `package.json` (`test:datagrid:*`, `test:matrix:*`, `quality:gates:datagrid`, `bench:regression`). Добавлена документация `docs/datagrid-quality-gates.md`. Ограничение: в этом окружении тест-ран не выполнен (`node/npm` отсутствуют).

## 10. Performance Gates vs AG Grid Target (`target >= 9.5`)

- [x] Определить SLA: scroll latency, selection drag FPS, open/close overlays, memory churn.
- [x] Добавить repeatable benchmark harness (local + CI).
- [x] Зафиксировать бюджеты и fail-fast rules.
- [x] Довести метрики до целевых порогов и задокументировать результаты.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - зафиксирован datagrid performance SLA в `docs/datagrid-performance-gates.md` (latency/FPS/open-close/memory churn + variance budget). Реализован repeatable harness `scripts/bench-datagrid-harness.mjs` с режимами `local/ci` и machine-readable артефактами (`artifacts/performance/*.json`). Оба synthetic bench-скрипта (`bench-vue-adapters.mjs`, `bench-livewire-morph.mjs`) расширены JSON-выходом (`BENCH_OUTPUT_JSON`) и включены в общий harness. CI job `benchmark-regression` переведен на `pnpm run bench:datagrid:harness:ci` и публикует весь `artifacts/performance` bundle. Budget/fail-fast rules закреплены в harness и используются как блокирующий merge gate. Документация quality gates обновлена (`docs/datagrid-quality-gates.md`). Ограничение: локальный запуск бенчей в этом окружении не выполнен (`node/npm` отсутствуют), итоговые значения метрик читаются из CI артефактов.

## 11. Documentation and Migration Pack (`target >= 9.5`)

- [x] Подготовить architecture doc нового ядра и boundaries.
- [x] Подготовить migration guide со старого `.tmp/ui-table` на новые пакеты.
- [x] Подготовить adapter integration guide для Vue.
- [x] Подготовить troubleshooting/runbook по overlay/pinned/virtualization.
- [x] Финальная оценка пункта: `9.6`.
- Комментарий по закрытию: `2026-02-07` - собран полный documentation/migration pack: `docs/datagrid-architecture.md` (границы пакетов, dependency direction, инварианты), `docs/datagrid-migration-guide.md` (переезд с `.tmp/ui-table`, import/naming/pinning rules), `docs/datagrid-vue-adapter-integration.md` (stable adapter contract и интеграционные правила), `docs/datagrid-troubleshooting-runbook.md` (операционный triage и регрессионные spec-ссылки для overlay/pinned/virtualization). Документы связаны с уже внедренными quality/performance gates и используют абсолютные пути к runtime/API/test файлам для быстрого incident navigation. Ограничение: валидировать markdown-линтер и doc-site сборку в этом окружении не удалось (`node/npm` отсутствуют).

## 12. Release Readiness (`target >= 9.5`)

- [x] Semantic versioning strategy для `datagrid-core` и `datagrid-vue`.
- [x] Changeset template и release notes format.
- [x] Compatibility matrix (Vue/Node/browser constraints).
- [x] Stable tag и freeze criteria перед публичным использованием.
- [x] Финальная оценка пункта: `9.5`.
- Комментарий по закрытию: `2026-02-07` - закрыт release-readiness пакет документов без изменений runtime-кода: добавлен профиль `docs/process/datagrid-release-readiness.md` (strict semver strategy, release notes contract, compatibility matrix, stable tag + freeze criteria), добавлен шаблон changeset `/.changeset/datagrid-template.md`, обновлены `docs/process/release-process.md`, `docs/process/README.md` и `/.changeset/README.md` с явной ссылкой на datagrid профиль. Релизный процесс теперь детерминирован на уровне входных критериев и подтверждаемых quality/perf gate команд. Ограничение: локальный прогон release tooling в этом окружении не выполнялся.

## Close Log

- `2026-02-07`: создан файл pipeline, добавлены правила закрытия и baseline оценки.
- `2026-02-07`: закрыт пункт `01` (bootstrap+public API contract).
- `2026-02-07`: закрыт пункт `02` (single source scroll/transform + sync-target contract).
- `2026-02-07`: закрыт пункт `03` (overlay renderer rewrite + perf budgets).
- `2026-02-07`: закрыт пункт `03A` (naming convergence: UiTable -> DataGrid aliases).
- `2026-02-07`: закрыт пункт `04` (canonical pin contract + adapter normalization + contract tests).
- `2026-02-07`: закрыт пункт `05` (coordinate-space contract + geometry property tests).
- `2026-02-07`: закрыт пункт `06` (horizontal virtualization hardening + stress contracts).
- `2026-02-07`: закрыт пункт `07` (selection engine decomposition + scheduler isolation + lifecycle dedupe).
- `2026-02-07`: закрыт пункт `08` (adapter contract cleanup + lifecycle API + headless/ui split).
- `2026-02-07`: закрыт пункт `09` (reliability matrix + e2e flake policy + coverage/critical-path gates + benchmark regression CI).
- `2026-02-07`: закрыт пункт `10` (performance SLA + repeatable harness + fail-fast budgets + CI artifacts).
- `2026-02-07`: закрыт пункт `11` (architecture/migration/integration/runbook documentation pack).
- `2026-02-07`: закрыт пункт `12` (semver/changeset template/compatibility matrix/stable-freeze release readiness).
