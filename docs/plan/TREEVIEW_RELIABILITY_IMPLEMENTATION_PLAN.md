# Treeview — reliability / performance implementation plan для Luna

Статус: **in_progress; 7/10 slices closed**. Дата аудита: 2026-09-19.
Область: @affino/treeview-core, @affino/treeview-vue, JS bridge @affino/treeview-laravel.
Обязательно прочитать [общий аудит и протокол](COMPONENT_ENGINEERING_AUDIT_2026-09-19.md) целиком перед исполнением.
Цель: предсказуемая модель дерева и virtual adapter с проверенной стоимостью операций, а не обещание отсутствия bottlenecks при любой нагрузке.

## Findings / доказательства

| ID | Приоритет / evidence | Где | Дефект / нагрузочный риск |
| --- | --- | --- | --- |
| TV-01 | P1 / R | TreeviewCore.ts: patchNodeMap, canApplyIncrementalParentPatch, isAncestorOf (~662) | Parent pointers изменяются до проверки; isAncestorOf без visited может бесконечно ходить по новому циклу, не содержащему искомый ancestor. Patch a→b,b→c,c→b зависает. |
| TV-02 | P1 / R | registerNodes (~107), patch (~798), useTreeviewController | Структура/disabled/text изменяются, но state-equality подавляет notification, если active/selected/expanded прежние. Vue state ref не получает invalidation. |
| TV-03 | P1 / R | requestToggle (~327), requestCollapse, search projection | Toggle смотрит persisted expanded, тогда как UI/meta показывают visual expansion от поиска; первое нажатие не закрывает auto-expanded branch. Search-only collapse после focusNext оставляет hidden active=b при visible=[a] и notifications=0. |
| TV-04 | P1 / R | useVirtualTreeviewController.ts: refreshWindow (~61) | ceil(viewportHeight / rowHeight) не учитывает fractional offset первой строки: при overscan=0 появляется видимый пробел внизу. |
| TV-05 | P1 / R+S | useVirtualTreeviewController.ts: refreshAfter (~138) | Обновления окна привязаны к wrappers, а не к core subscription; direct public core mutations оставляют окно/totalHeight старыми. Mutable rowHeight ref не имеет автоматической нормализации/refresh. |
| TV-06 | P1 / M+S | TreeviewCore.ts: rebuildSearchProjection (~958) | Каждый match заново проходит весь ancestor path: O(N·depth), цепочка становится O(N²). 10k-chain search p50 ~1156 ms в пробе. |
| TV-07 | P2 / S | registerNodes, normalizeState, rebuildSourceIndexes, rebuildChildrenForParent | «Incremental» add/reparent всё равно rebuild всех source indexes; reparent K родителей сканирует N для каждого. normalizeState строит visible projection дважды, затем lazy read ещё раз; search rebuild вызывается в source rebuild и registerNodes. |
| TV-08 | P1 / S | treeview-laravel/resources/js/index.ts: collectTreeviewStructure, isSameStructure, setupMutationObserver | Structure equality сравнивает только DOM identities; attributes disabled/parent/value игнорируются, observer видит только childList и ищет новые roots, а не изменения items внутри существующего root. Rehydrate пересоздаёт core с defaults. |
| TV-09 | P2 / S | Laravel renderState/onClick/onKeyDown/resolveModels | На каждый focus пишутся атрибуты всех N items, expanded.includes для каждой ветки; 2N listeners. Nested DOM item events могут обработаться предками, nested roots попадают в querySelectorAll. Проверить boundary и state preservation. |
| TV-10 | P1 / R | treeview-core/vue src/index.ts и dist | Plain Node ESM import падает на extensionless imports; source aliases скрывают дефект. |
| TV-11 | P2 / S+V | public types, Vue wrappers, destroy | Core patch mode не проброшен через wrapper registerNodes; request* results также доступны только через core. Нет явного remove/reorder/batch API, terminal destroy guard; lazy loading/multi-select не заявлять реализованными. |
| TV-12 | P2 / V | package tests/scripts/CI | Нет evidence реального браузера для virtual focus/ARIA; perf gate не подключён в CI. Тесты private counters не гарантируют bounded total work. |

Ограничения существующей архитектуры: flat parent model, single selection, fixed-height virtual rows. Это не баги сами по себе. Новые multi-select, DnD, variable heights и async child loading не включать автоматически в этот план; сначала продуктовый контракт.

## Предлагаемый API — не утверждён

1. Additive snapshot revisions: readonly modelRevision / projectionRevision, либо отдельная core change subscription. Выбрать **один** observable contract; active-only updates не должны пересоздавать topology projection.
2. Совместимая Vue сигнатура registerNodes(nodes, options?: TreeviewRegisterOptions), request* parity с core.
3. Для интенсивных updates рассмотреть applyNodeChanges({ upserts, removeValues?, order? }) с атомарностью и documented cascade policy. Сначала доказать необходимость: batch существующего registerNodes может оказаться достаточным. Не делать patch-добавление удалением отсутствующих узлов.
4. Virtual refs: readonly наружу + setRowHeight(value) вместо невалидируемых writable refs; это compatibility decision. scrollToValue(value, {align?: "nearest"|"start"|"end"}) — только если нужен реальным renderer.
5. Конфликт cyclic/duplicate inputs: определить policy reject/normalize и диагностику, сохранить существующую normalization для replace, пока breaking contract не одобрен.

## Прогресс

| Слайс | Задача | Зависит | Статус |
| --- | --- | --- | --- |
| T01 | Завершимость и атомарность topology patch | — | done |
| T02 | Core revisions и Vue invalidation | T01; API decision | done |
| T03 | Search expansion / active invariants | T02 | done |
| T04 | Полное покрытие virtual viewport | — | done |
| T05 | Единый owner virtual updates / lifecycle | T02,T04 | done |
| T06 | Линейная search projection | T03 | done |
| T07 | Стоимость patch / batching / registration API | T01,T02,T06 | in_progress |
| T08 | Laravel dynamic DOM и event ownership | T02,T03 | done |
| T09 | Packed consumers / docs / accessibility contract | T05,T07,T08 | done |
| T10 | Нагрузочные и browser gates | T01–T09 | pending |

## T01 — Cycle-safe topology (TV-01)

Файлы: core TreeviewCore.ts, treeviewCore.test.ts.
- Изолированный RED в worker/child с timeout: nodes a,b,c roots; patch a→b,b→c,c→b. Не класть зависающий вызов в основной Vitest process.
- Проверять prospective graph до публикации pointers; bounded cycle detection без рекурсии. Обеспечить завершимость и для additions с зависимыми новыми nodes, mixed add/reparent и invalid parents.
- Согласовать нормализацию/отказ; не оставлять partially mutated graph после invalid input.
- Проверка: chain 10k без stack overflow; cycles двух/трёх узлов, вход в чужой цикл, self-parent, missing parent, duplicates и повтор patch; сравнить topology/visible/depth с reference traversal.
- Done: все пути завершаются, atomic outcome, существующие replace tests сохранены. Убрать необходимость timeout только для исправленного успешного regression, не для диагностики старой версии.

## T02 — Observable structure (TV-02, TV-11)

Файлы: core registerNodes/patch/types; Vue useTreeviewController.
- RED: подписаться, добавить root b при неизменном active=a; computed/read view остаётся старым. Также patch disabled у неактивного leaf, text при активном search, replace/reorder с прежним selection.
- Выбрать revision/change contract из proposal. Уведомление должно происходить ровно раз после согласованной модели; no-op patch — ноль.
- Проверить emit:false: модель действительно меняется, семантика дальнейшего read/notification документирована. Не менять default emit.
- Done: consumer читает актуальные visible/count/meta после любого accepted update, active-only notification не вызывает full topology recompute; contract test для Vue computed.

## T03 — Search state invariants (TV-03)

Файлы: requestExpand/Collapse/Toggle, getSearchEffectiveExpanded, normalizeActive.
- RED: query needle раскрывает родителя, первый toggle должен сразу менять visual state. Проверить две операции, clearing query, user expansion до/во время поиска.
- Дополнительный RED: search-only expansion, focusNext в ребёнка, collapse родителя → active обязан стать видимым и subscription получить изменение. В текущем overlay-only branch сравнение нового snapshot со старым подавляет emission.
- При collapse/search change active должен оставаться enabled/visible либо явно documented null; selected может сохраняться hidden только по определённому контракту.
- Сделать persisted/user expansion и search overlay явно согласованными; не сливать их в одну неявную структуру.
- Done: один жест — одно visual изменение; notification/change result согласованы; не теряются expansion preferences после clear search.

## T04 — Virtual range math (TV-04)

Файл: useVirtualTreeviewController.ts и tests.
- RED: rowHeight=32, viewport=320, scrollTop=1, overscan=0, 20 roots; last row bottom 320 < viewport bottom 321.
- End вычислять из абсолютной нижней границы viewport; guard non-finite values, empty count, zero height, fractional pixels и bottom clamp.
- Проверять property coverage: все пересекающие viewport строки включены; padding/overscan bounded; no off-by-one при scrollTop=k*h±epsilon.
- Done: диапазон полностью покрывает viewport, DOM count ограничен viewport+overscan+boundary rows.

## T05 — Virtual ownership / focus / dispose (TV-05, TV-12)

Файлы: Vue controllers/tests и production-shaped example.
- Subscribe к core model/projection changes вместо ручной зависимости только от wrappers; исключить double refresh.
- RED direct core.registerNodes/focus/search/request*; writable ref rowHeight=0/NaN/изменение высоты; pending RAF→dispose.
- Определить readonly/setter API. Не сканировать все visible values на scroll, сохранять стабильные refs при неизменном окне.
- Virtual focus: при keyboard навигации за окно active item должен быть отрисован до DOM focus/aria-activedescendant. Явно определить ответственность renderer vs controller.
- Done: direct core и wrapper дают одинаковое окно, одна frame-update на burst scroll; disposed controller не получает callbacks, effectScope cleanup и clamp при collapse above viewport покрыты.
- Browser: scroll с fractional pixels, focus через границу окна, Home/End/search, resize.

## T06 — Search cost (TV-06)

Файлы: rebuildSearchProjection и bench-treeview-core.mjs.
- Baseline отдельно flat/balanced/deep, match ratio 0/1/50/100%, N=1k/10k/50k в пределах безопасного времени.
- Заменить повторное прохождение общих ancestor paths на marked-path stop / bottom-up propagation; сохранить semantics search visibility и ancestor expansion.
- Измерять visits/counters: при many matches на цепочке ancestor work bounded O(N), не только elapsed time.
- Done: correctness oracle для matches/ancestors, before/after на тех же fixtures, typed search bursts не создают повторных full scans сверх документированного pass.

## T07 — Patch amplification (TV-07, TV-11)

Файлы: patchNodeMap, rebuildSourceIndexes, normalizeState, Vue API; bench.
- Измерить add-one/reparent-one/disabled-one/text-one/no-op отдельно от constructor.
- Устранить duplicate search rebuild, ненужные projections; reparent affected-parent processing одним проходом/adjacency updates.
- Не обещать O(1) произвольному reparent: source preorder изменение имеет стоимость затронутого диапазона. Зафиксировать реальный cost model.
- Добавлять batch/remove/reorder API только после конкретного согласования; request results и patch mode пробросить последовательно.
- Done: deterministic counters на batch, no-op zero recompute, isolated field update не перестраивает topology; remove active/selected/ancestor, duplicate IDs, cross-parent order и exception rollback проверены.

## T08 — Laravel bridge (TV-08, TV-09)

Файл: treeview-laravel/resources/js/index.ts, index.spec.ts.
- RED: изменить disabled attribute существующего item; добавить/remove child внутри существующего root; сохранить selection/expansion после Livewire-style morph.
- Наблюдать owning root и релевантные attributes; own render writes не должны вызывать observer loop. Обновлять existing core вместо reset-to-default по каждому morph.
- Делегирование root events допустимо после ownership tests; filter nearest tree root/item, один click/key action при nested markup/SVG/custom controls.
- Diff DOM state: active/selection-only updates затрагивают старый/новый items, structural update — affected set. Использовать Set для expanded.
- Done: mutation bursts coalesced, nested tree изолирован, remount cleanup verified; benchmark DOM writes/listeners 1k/10k, явный nonvirtual DOM support ceiling.

## T09 — Package and consumer contract (TV-10, TV-11, TV-12)

- Исправить ESM relative specifiers/build при сохранении export map; проверить pack → temporary consumer без workspace aliases: Node 24 import, Vue build, declarations.
- README/examples: fixed-height only, single selection, data identity/unique value contract (null reserved), patch replace distinction, manual dispose вне scope, revisions и API migration.
- Tree semantics: проверить owner focus strategy, aria-level/posinset/setsize/expanded/selected, typeahead/RTL support или documented absence. Не добавлять ARIA semantics в core DOM-кодом.
- Done: реальные integration examples build; никаких обещаний, что core автоматически обеспечивает DOM accessibility.

## T10 — Final gates (все TV)

- Commands: pnpm --filter '@affino/treeview-*' test; pnpm --filter '@affino/treeview-*' build; package bench / calibrated bench:assert; pack consumer; git diff --check.
- Browser: flat/balanced/deep, scrolling, rapid search, viewport resize, active row removal, keyboard/Tab, DOM morph, repeated mount/unmount.
- Benchmark: core 1k/10k/50k + adapter fixed viewport; p50/p95/p99, initial registration, field patch, topology patch, search, focus burst, scroll, allocation/retention.
- CI budgets из baseline целевого runner; budgets проверяют operation counts и latency отдельно. Сохранить artifacts, fixture shape и runtime.
- Done: нет открытых P1, все acceptance checks выполнены на Node 24 и поддерживаемом браузере; limitations явно утверждены. Без этого статус in_progress/blocked, не done.

## Журнал

2026-09-19: аудит и baseline treeview 47 tests (core 32, Vue 11, Laravel 4), builds passed на Node 24. Закрыты T01–T06, T08 и T09: prospective cycle normalization, structural notifications/no-op replace, search active invariants, fractional virtual range, core-owned virtual invalidation, bottom-up search projection, attribute-aware Laravel rehydrate с сохранением selection/expansion и explicit consumer/accessibility envelope в README + ESM consumer verification. T07 начат: topology patch больше не перестраивает search projection второй раз. T10 остаётся открытым; T07 требует полного calibrated patch cost model.
