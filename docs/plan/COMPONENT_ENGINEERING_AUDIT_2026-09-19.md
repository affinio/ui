# Treeview / Dialog / Diagram — технический аудит и правила исполнения Luna

Дата: 2026-09-19. Статус: **audit complete; implementation not started**.
Объект: текущий рабочий код, включая незакоммиченные изменения других задач; исходники целевых библиотек в этом аудите не изменялись.
Основной охват: core + Vue; дополнительно JS bridges treeview-laravel/dialog-laravel и их зависимости. PHP/Livewire runtime, реальный браузер, accessibility devices и production traces не проверены.

## Вывод

Гарантия «нет bottlenecks, готово для высоконагруженных сложных приложений» сейчас не обоснована.
Есть хорошие основания: разделение core/adapter, immutable tree snapshots, индексы навигации дерева, RAF preview diagram, shared overlay kernel.
Но существующие зелёные тесты пропускают зависание дерева, рассинхронизацию состояния, async lifecycle races и ошибки undo. Diagram выполняет работу по всей сцене даже для локального изменения/камеры.

Планы:
- [Treeview — 10 слайсов](TREEVIEW_RELIABILITY_IMPLEMENTATION_PLAN.md)
- [Dialog — 10 слайсов](DIALOG_RELIABILITY_IMPLEMENTATION_PLAN.md)
- [Diagram — 12 слайсов](DIAGRAM_RELIABILITY_IMPLEMENTATION_PLAN.md)

Каждый план — независимый backlog, все слайсы pending. Приоритет между пакетами: T01, D01–D02, G01–G03; затем реактивность, lifecycle и perf. Общие изменения overlay-kernel согласовывать между планами, не реализовывать две конкурирующие версии.

## Как читать доказательства

- **R** — воспроизведено локальной диагностикой, есть вход и наблюдаемый результат.
- **S** — подтверждено чтением кода/контракта; runtime regression ещё требуется.
- **M** — измерено синтетической пробой; не browser latency/FPS/SLA.
- **V** — проверка отсутствует; это открытый риск, а не доказанный баг.
- P1 — исправить до серьёзной production-нагрузки: зависание, потеря согласованности, неверный lifecycle/контракт.
- P2 — производительность, интеграция, предсказуемость и проверяемость; конкретный профиль нагрузки может повысить приоритет.

Не считать перечисление всех найденных проблем доказательством отсутствия остальных.

## Общий обязательный протокол для Codex / Luna

1. Прочитать AGENTS.md, этот файл, весь выбранный план, актуальный git status и инструкции каталогов. Сохранить чужие изменения, особенно menu/CI.
2. Работать slice by slice: воспроизведение → минимальная реализация → targeted tests/build → документация/журнал → следующий слайс.
3. Начинать с первого pending по зависимостям. Один слайс — отдельно проверяемое изменение; не переписывать пакет целиком.
4. Проба ниже фиксирует текущую ошибку, а не правильное поведение. Превратить наблюдение в regression assertion ожидаемого контракта, показать RED до исправления и GREEN после. Exit 0 диагностического скрипта не означает «дефект исправлен».
5. Core владеет данными/инвариантами; adapter — реактивностью/DOM/lifecycle. Не вводить новые managers, если достаточно расширить существующего владельца.
6. API в планах — **proposal, not approved**. Пользователь поручил подготовить предложения; это не согласование сигнатур. Подготовить конкретный diff контракта, compatibility/migration и дождаться одобрения согласно AGENTS.md. Пока решение ожидается, выполнять независимые совместимые слайсы.
7. Публичный исправленный контракт должен одинаково работать через core, Vue и Laravel bridge, где он поддержан. Не маскировать core-дефект адаптерным refresh.
8. После слайса обновлять его строку и журнал. Разрешённые статусы: pending / in_progress / blocked / done. Записывать точные команды, exit codes, число тестов, платформу, воспроизведение, docs, API decision и незакрытые критерии.
9. **Не помечать done при неполных acceptance criteria.** «Tests pass», отсутствие браузера или оставшийся perf gate не заменяют проверку. Допускается implementation complete / validation blocked, но общий план остаётся open.
10. Не выдавать времена Vitest/build за latency компонента; query throughput за FPS; Node heap sample за доказанное отсутствие утечек; отсутствие функции за утверждённую новую функциональность.
11. Прогонять минимальные проверки пакета, затем affected dependencies. Full workspace — только финальный gate или доказанная потребность. Не ослаблять assertions, исключения или budgets.
12. Не менять API/зависимости без необходимости. Проверить Vue peer floor ^3.3, Node 24, ESM consumers и типы; не копировать непроверенное SSR-ID решение из menu.
13. Для interaction/virtualization изменений выполнить repo preflight по AGENTS.md; если DataGrid references отсутствуют/неприменимы к UI repo, явно записать это, не изобретать контракт.
14. Не коммитить, не публиковать пакеты и не запускать удалённый workflow без поручения. Завершённые планы архивировать по docs/docs-lifecycle-policy.md только после реального закрытия критериев.

Шаблон записи после каждого слайса:

```text
Txx / Dxx / Gxx — status:
Дата / исполнитель / исходный revision:
Finding IDs:
RED: вход, ожидаемый контракт, фактический результат
Реализация / затронутые файлы:
API decision / compatibility:
Validation: команда → exit code, tests/files
Browser: платформа, сценарии либо not run
Performance: fixture, warmup, samples, p50/p95, counters, artifacts
Docs / migration:
Открытые критерии / следующий слайс:
```

## Фактическая baseline validation

Среда: Linux arm64, Node v22.23.2, pnpm 11.5.0; проект требует Node ^24.0.0. Изменения Node/lockfile для аудита не выполнялись.

```sh
pnpm --filter '@affino/treeview-*' --filter '@affino/dialog-*' --filter '@affino/diagram-*' test
pnpm --filter '@affino/treeview-*' --filter '@affino/dialog-*' --filter '@affino/diagram-*' build
```

Обе команды → exit 0. 8 пакетов, 16 test files, **153 tests**:
treeview-core 32 / treeview-vue 11 / treeview-laravel 4;
dialog-core 31 / dialog-vue 13 / dialog-laravel 22;
diagram-core 25 / diagram-vue 15.
Это baseline, не доказательство исправления findings. Build включает type declarations; PHP тесты не запускались.

После сборки прямой Node import dist/index.js:
- treeview-core, treeview-vue, dialog-core, dialog-vue → ERR_MODULE_NOT_FOUND на extensionless relative imports.
- diagram-core, diagram-vue → import успешен.
Это воспроизведение Node 22; отдельный Node 24 и packed consumer gate обязателен. Source-alias tests такого дефекта не обнаруживают.

## Воспроизводимые пробы

Сохранён [диагностический скрипт](evidence/component-audit-probes.mjs). Vite загружает текущие source modules, aliases локальны скрипту, библиотечные файлы не меняются. Он пишет наблюдения в stdout; без assertion gate. Для DOM режима используется установленный jsdom dialog-vue.

```sh
node docs/plan/evidence/component-audit-probes.mjs
node docs/plan/evidence/component-audit-probes.mjs --dom
# Изолировать потенциальное зависание! До исправления ожидается timeout exit 124.
timeout 4s node docs/plan/evidence/component-audit-probes.mjs --cycle
# Запускать отдельно от тестов/build; это не CI perf gate.
node docs/plan/evidence/component-audit-probes.mjs --perf
```

Подтверждённые наблюдения:
- tree add root b к a: visible = [a,b], notifications = 0.
- cyclic patch a→b, b→c, c→b: дошёл до registerNodes; не вернулся, timeout exit 124.
- search auto-expansion: первый toggle помечает persisted expansion, визуально оставляет узел открытым; второй toggle закрывает.
- search-only collapse после focusNext: active остаётся b, visible=[a], notifications=0; hidden active и отсутствие уведомления воспроизведены.
- virtual rowHeight=32, viewport=320, scrollTop=1, overscan=0: низ отрисованных строк 320 вместо >=321.
- virtual direct core patch: count=21, totalHeight=640 вместо 672.
- dialog.close(escape-key, metadata) с async allow: Promise рано возвращает false; позже phase=closed; metadata не дошла до guard.
- destroy dialog во время pending guard: после allow вернулся true, afterClose вызван 1 раз уже после destroy.
- defaultOpen dialog: focus activate не вызван (0); контракт initial client activation надо определить без DOM side effects на SSR.
- activate→deactivate focus orchestrator→поздний target: microtask переводит фокус на panel уже после deactivate.
- diagram transact(()=>({nodes:[]})): changed=false, revision=0, старый snapshot/query продолжают показывать a, internal state уже заменён.
- diagram subscriber при первом move: canUndo=false; после dispatch canUndo=true, повторного уведомления нет.
- locked text: canEditText=false, но editText changed=true и текст заменён.
- два отдельных drag одного узла: x=20, history depth=1; undo возвращает x=0 вместо отмены только последнего drag.
- cancel drag: tool остаётся drag-selection.
- mutation исходного node.x=500 + viewport command: snapshot x=500, cached geometry x=0.
- queryEntities({limit:0}) возвращает один элемент.

## Измерения и их ограничения

Повторная синтетическая серия: Vite source loader, Node 22 linux/arm64, 3 warmups + 15 измерений, p50=8-й и p95=15-й sorted sample, performance.now, без принудительного GC.
Diagram: N простых прямоугольников на одной линии, tiny query видит около 3 элементов; viewport/move measurements **не включают** последующий index rebuild, Vue/DOM/paint.
Tree: цепочка N узлов, каждый текст match, чередование query match/mat; это намеренно худший профиль глубины, не typical balanced tree.

| N | Tree deep search p50 / p95 ms | Diagram viewport p50 / p95 ms | Move one p50 / p95 ms | Tiny query p50 / p95 ms |
| --- | --- | --- | --- | --- |
| 1 000 | 8.72 / 9.83 | 0.99 / 3.56 | 0.80 / 1.27 | 0.18 / 0.58 |
| 5 000 | 246.22 / 268.96 | 4.76 / 7.42 | 4.20 / 5.46 | 0.90 / 1.43 |
| 10 000 | 1156.09 / 1449.97 | 8.48 / 11.16 | 8.40 / 9.75 | 1.83 / 2.68 |

Первый прогон пересёкся с package tests и имел tree 10k p95 4743.67 ms; не использовать его как budget. Повторная серия началась с краткого (<4s) соседнего cycle probe, поэтому младшие размеры также имеют шум. Вывод об O(N·depth) tree search и global diagram work подтверждается исходниками, а не одним числом. Для release нужны новые изолированные Node 24/browser измерения.

## Общие незакрытые gates

- Node 24 frozen install + scoped test/build + packed consumer import/types/Vite SSR.
- Реальные browser keyboard/focus/pointer/teleport/scroll/zoom checks, mixed overlay stack; jsdom не выполняет native Tab navigation.
- Before/after p50/p95/p99 и operation counters на representative data; CI host калибруется до выбора budgets.
- Длительные mount/dispose, open/close, scene replacement и edit/undo traces с retained objects/listeners/history bounds.
- Найти и зафиксировать поддерживаемые объёмы, формы данных и пределы; не обещать 100k/60fps без evidence.
- Tree bench: registerPatchOnePercent включает создание дерева, поэтому разделить setup/operation; счётчики private methods не заменяют нагрузочный контракт.
- Diagram bench: single-shot measure, panFpsEstimate основан на query loops без DOM; waypoint commands передают edgeId, но actual API требует id. Эти timings могут измерять no-op. Проверять changed/revision/state в каждой измеряемой операции.
- CI сейчас запускает unit/visual, но отдельного treeview/diagram perf gate нет; отсутствие регрессий производительности не контролируется автоматически.

## Implementation evidence addendum — 2026-09-19

The implementation plans are now the authoritative progress record; the baseline above remains historical evidence. Current acceptance status is:

- Treeview: 8/10 slices closed. Node24 calibrated benchmark, Vue virtual benchmark, local tarball consumer, demo build, CI Playwright smoke, and additive core/Vue API parity are covered. `registerNodes(..., options)` now returns change/topology flags; Vue and virtual adapters forward patch options and all core `request*` results while preserving legacy methods. The published @affino/treeview-core@0.2.2 still fails Node24 ESM because its registry dist has an extensionless internal import; T09 therefore remains open until a refreshed artifact is published. T10 also awaits GitHub browser evidence.
- Dialog: 8/10 slices closed; D09 is in progress and D10 remains pending. Mixed owner-cascade, stale disposer, owner-cycle, dynamic Teleport root updates, Node24 lifecycle benchmark, isolated tarball/Vite SSR consumer, and CI dialog smoke are covered. Actual browser execution remains open.
- Diagram: G01–G05 are closed; G06–G12 remain in progress. Structural sharing/retention, bounded `history.maxEntries`, dependency indexing, query benchmarks with cold/warm separation, isolated Node/Vite SSR consumer import, demo build, and CI dialog/diagram smoke are covered. Browser execution and remaining renderer/index retention evidence remain open.

The CI visual matrix now builds `demo-vue`, runs the existing treeview smoke, and runs `scripts/smoke-components-demo.mjs` for dialog and diagram after installing Chromium. Local browser execution is unavailable on the current Ubuntu 26.04 arm64 environment because Playwright does not ship a compatible Chromium binary there; this is a validation limitation, not a passing browser result.

The Node24 verify job also runs `bench:components:ci`: calibrated treeview assertions, the dialog lifecycle harness, and cold/warm diagram workloads. This provides CI regression evidence; diagram/dialog budgets remain observational until runner baselines are calibrated.
