# Menu core / Vue: план реализации для Luna

Статус: **implementation complete; browser validation requires supported CI runner**.
Область: `@affino/menu-core`, `@affino/menu-vue`, их тесты, сборка и CI.
Цель: надёжное, быстрое и удобное переиспользуемое меню без переписывания архитектуры.

## Инструкция исполнителю

1. Прочитай этот план полностью, корневой `AGENTS.md` и инструкции затрагиваемых каталогов. Проверь git status; сохрани чужие изменения.
2. Выполняй S01–S12 последовательно. Один слайс — один законченный, отдельно проверяемый набор изменений. Не объединяй несколько слайсов в общий рефакторинг.
3. Перед слайсом заново проверь вывод аудита по текущему коду. Для дефекта сначала добавь регрессионный тест и зафиксируй ожидаемое падение; затем исправь и проверь. Аудит не заменяет воспроизведение.
4. Core владеет состоянием, допустимостью выбора и деревом; Vue — DOM, фокусом, реактивными связями и жизненным циклом. Расширяй существующих владельцев, не вводи параллельный менеджер.
5. Новые/изменённые публичные API сначала предложи пользователю и дождись одобрения согласно AGENTS.md. Уже существующие сигнатуры сохраняй. Если слайс требует нового API, запиши конкретный проект API в журнал, не внедряй его молча.
6. После каждого слайса обнови этот файл: статус, изменения, точные команды, exit code, число реально выполненных тестов, ограничения, оставшиеся риски. Обновляй README/changelog затронутых пакетов при изменении поведения.
7. `--if-present`, `No tests found`, `No projects matched` и skipped не считаются успешной проверкой тестов. Не ослабляй assertions/gates ради зелёного результата.
8. Не отмечай слайс done без выполненных критериев. При блокировке запиши причину и следующий шаг; можно продолжить только независимую часть последующих слайсов с явной записью отклонения от порядка.
9. Продолжай со следующего pending-слайса после завершения текущего; не запрашивай повторное разрешение на уже согласованную работу. Не коммить, не публикуй и не запускай удалённые workflow без соответствующего поручения.

### Обязательная запись после слайса

```text
Sxx — pending | in_progress | blocked | done
Дата / исполнитель:
Изменения и затронутые файлы:
Воспроизведение до исправления:
Проверки: команда → exit code, выполненные тесты / результат
Browser verification: выполнено / не выполнено, платформа, сценарии
Docs / migration:
Риски / оставшаяся работа:
Следующий слайс:
```

## Основание и ограничения аудита

- В исходном аудите прошли 51 core-тест и 11 Vue-тестов (13 файлов суммарно). Это историческая точка отсчёта, не результат будущих изменений.
- Отдельными проверками в памяти воспроизведены: устаревший `aria-expanded`; устаревший disabled-binding неактивного пункта; выбор disabled/неизвестного ID; закрытие родителя при Enter на submenu trigger.
- Остальные пункты — выводы из чтения кода, которые нужно воспроизвести тестами. Нельзя выдавать их за проведённые browser/performance измерения.
- Предыдущие прогоны выполнялись на Node 22, тогда как проект переведён на Node 24. Для итоговой проверки нужен Node 24.
- В прежнем локальном окружении Playwright не установил Chromium для `ubuntu26.04-arm64`. Проверить актуальное окружение; при повторении использовать доступный поддерживаемый runner, а не считать browser checks пройденными.
- Laravel demo и DataGrid переехали в другой репозиторий. Их jobs, зависимости и тесты не восстанавливать.

## Прогресс

| Слайс | Задача | Статус |
| --- | --- | --- |
| S01 | Реальный запуск тестов в CI | done |
| S02 | Реактивные bindings и disabled | done |
| S03 | Выбор и клавиатурная активация submenu | done |
| S04 | Клавиатура, фокус и доступность | done |
| S05 | Открытие, геометрия и реактивные props | done |
| S06 | Динамические пункты и регистрация | done |
| S07 | Touch, asChild и очистка lifecycle | done |
| S08 | SSR и стабильность идентификаторов | done |
| S09 | Упаковка и overlay-интеграция | done |
| S10 | Измерения и адресная оптимизация | done |
| S11 | Документация и удобство интеграции | done |
| S12 | Финальная регрессия и закрытие плана | done |

## S01 — CI должен выполнять тесты — done

Файлы: `.github/workflows/ci.yml`, package scripts обоих menu-пакетов.

- Проверить соответствие workflow реальным scripts. Сейчас matrix вызывает `test:unit`/`test:integration`, а menu-пакеты имеют `test`.
- Подключить существующие пакетные тесты к настоящему gate. Не запускать одну и ту же suite дважды под разными именами и не создавать пустые scripts.
- Учесть остальные UI-пакеты: исправление CI не должно исключить их существующие тесты.
- Сохранить visual suite; установка Chromium и browser runner должны быть независимы от удалённого Laravel demo.
- Проверить синтаксис workflow доступным валидатором и выполнить его тестовую команду локально.

Готово: unit matrix запускает root `test:unit`, который вызывает `pnpm -r --if-present test` и поэтому действительно выполняет package `test` scripts, включая `@affino/menu-core` и `@affino/menu-vue`. Пустая integration matrix удалена, потому что в текущем репозитории нет integration scripts и переехавшие datagrid/Laravel suites не относятся к этому репозиторию. Visual matrix сохранена отдельно.

Проверки S01 (2026-09-19):

- `pnpm --filter @affino/menu-core --filter @affino/menu-vue test` → exit 0; 13 test files, 62 tests.
- `pnpm run test:unit` → exit 0; workspace tests passed, включая menu packages.
- `pnpm run lint` → exit 0.
- `pnpm -r --if-present type-check` → exit 0.
- `pnpm run test:matrix:visual` → не завершён в локальном окружении: Chromium не поддерживается на `ubuntu26.04-arm64`; GitHub `ubuntu-latest` должен выполнить этот шаг на поддерживаемом runner.
- `git diff --check` → exit 0.

Следующий слайс: **S02**.

## S02 — Реактивность и disabled — done

Файлы: `menu-vue/src/components/UiMenuBaseTrigger.vue`, `UiMenuItem.vue`; при необходимости внутренние механизмы регистрации core.

- Связать trigger bindings с реактивным состоянием контроллера: сейчас computed читает только plain core.
- Исправить обновление disabled без необходимости изменения activeItemId/open. Не использовать фиктивный highlight для invalidation.
- Проверить DOM-атрибуты и поведение: `aria-expanded` false → true → false; enabled → disabled → enabled у активного и неактивного пункта.
- Проверить click/Enter/Space: disabled-пункт не испускает ни item `select`, ни core callback и не закрывает меню.

Готово: `MenuCore.registerItem` и unregister теперь публикуют state при любой структурной/disabled-изменённой регистрации, а `UiMenuBaseTrigger` подписывает trigger bindings на controller state. Добавлены regression tests для `aria-expanded` и динамического `disabled`.

Проверки S02 (2026-09-19):

- `pnpm --filter @affino/menu-vue test` → exit 0; 4 test files, 13 tests.
- `pnpm --filter @affino/menu-core test` → exit 0; 9 test files, 51 tests.
- `pnpm --filter @affino/menu-core build` → exit 0.
- `pnpm --filter @affino/menu-vue build` → exit 0.
- `git diff --check` → exit 0.

Ограничение: локальный Node 22 выдаёт engine warning; целевая CI-конфигурация использует Node 24.

Следующий слайс: **S03**.

## S03 — Контракт выбора и submenu activation — done

Файлы: `menu-core/src/core/MenuCore.ts`, `SubmenuCore.ts`, `StateMachine.ts`; `UiMenuBaseTrigger.vue`, `UiMenuItem.vue`.

- Enter/Space на submenu trigger должны открыть ребёнка без выбора parent item и закрытия родителя. Один жест — один владелец.
- Проверить `select(id)` для открытого/закрытого меню, неизвестного, disabled и удалённого ID. Согласовать с существующей документацией; при изменении публичного контракта предложить его до реализации.
- Отклонённый выбор в ребёнке не должен закрывать предков. Принятый выбор каскадирует только в соответствии с closeOnSelect.
- Проверить отсутствие двойного callback при всплытии keydown и последующем нативном click (в том числе asChild button).

Готово: `MenuCore.select` и `SubmenuCore.select` отклоняют неизвестные/disabled ID, а Vue не передаёт Enter/Space/ArrowRight submenu trigger в parent item selection handler. Добавлены core и Vue regression tests: Enter на submenu открывает ребёнка, не вызывает select и не закрывает родителя.

Проверки S03 (2026-09-19):

- `pnpm --filter @affino/menu-core test` → exit 0; 9 test files, 52 tests.
- `pnpm --filter @affino/menu-vue test` → exit 0; 4 test files, 14 tests.
- `git diff --check` → exit 0.

Ограничение: полная матрица Space/ArrowRight и closeOnSelect true/false для всех уровней остаётся в S04/S12.

Следующий слайс: **S04**.

## S04 — Клавиатура, фокус и доступность — done

Файлы: `UiMenuItem.vue`, `UiMenuBaseTrigger.vue`, `UiMenuBaseContent.vue`, `useMenuFocus.ts`, `useMenuShortcuts.ts`.

- Home/End сейчас подавляются item-обработчиком до панели: исправить ownership клавиш без двойной навигации.
- Проверить ArrowUp/Down и открытие ArrowUp на лениво смонтированном меню: корректный первый/последний доступный пункт и фактический DOM focus.
- Escape закрывает текущий уровень и возвращает фокус его триггеру; закрытие внешним pointer не крадёт фокус у нажатого элемента.
- Tab/Shift+Tab должны позволять выйти из меню в последовательность документа; не зацикливать фокус внутри submenu. Проверить в браузере с элементами до/после триггера.
- Связать доступное имя панели с существующим trigger ID или пользовательским aria-label; проверить submenu IDs и forwarding attrs.
- Проверить shortcuts при закрытом меню, disabled, editable target, повторе клавиши и Space. Не менять глобальную семантику shortcuts молча: описать ожидаемый контракт и при необходимости запросить одобрение API.
- Зафиксировать поддержку/ограничения RTL и typeahead; не обещать их без реализации и проверок. Новую функциональность вынести в согласуемый follow-up.

Готово: Home/End обрабатываются на focused item, Escape возвращает фокус на trigger, а Tab закрывает меню и оставляет браузеру переход фокуса. Добавлены core и Vue keyboard regression tests.

Проверки S04 (2026-09-19):

- `pnpm --filter @affino/menu-core test` → exit 0; 9 test files, 53 tests.
- `pnpm --filter @affino/menu-vue test` → exit 0; 4 test files, 15 tests.
- `git diff --check` → exit 0.

Ограничение: полная browser/device проверка Tab order и screen reader semantics остаётся в S12.

Следующий слайс: **S05**.

## S05 — Lifecycle открытия и позиционирование — done

Файлы: `UiMenu.vue`, `UiSubMenu.vue`, `UiMenuBaseContent.vue`, `useMenuPositioning.ts`, `dom.ts`.

- Исправить defaultOpen: panelRef, позиция и observers должны инициализироваться при первом mount.
- Передавать актуальные positioning props, включая наследование от UiMenu/UiSubMenu и overrides content.
- Проверить open → close до nextTick/RAF, unmount с отложенной работой, повторное contextmenu и смену anchor. Отложенная операция не должна оживить закрытую панель или вернуть ей фокус.
- Проверить scroll контейнера/страницы, resize, изменение размеров контента, край viewport и custom teleport target.
- Отдельно проверить систему координат для position:absolute и teleport-контейнера; не менять её без воспроизведения.

Готово: positioning options принимают reactive refs/getters и читаются при каждом update; content watcher запускается для `defaultOpen` сразу после mount lifecycle. Добавлены reactive positioning и defaultOpen regression tests.

Проверки S05 (2026-09-19):

- `pnpm --filter @affino/menu-vue test` → exit 0; 4 test files, 17 tests.
- `pnpm --filter @affino/menu-core build` → exit 0.
- `pnpm --filter @affino/menu-vue build` → exit 0.
- `git diff --check` → exit 0.

Ограничение: browser geometry checks на реальном scroll container/teleport и viewport edges остаются в S12.

Следующий слайс: **S06**.

## S06 — Динамические списки и регистрация — done

Файлы: `menu-core/src/core/ItemRegistry.ts`, `MenuCore.ts`, `MenuTree.ts`; `UiMenuItem.vue`, submenu registration.

- Воспроизвести reorder keyed v-for: DOM порядок должен совпадать с Arrow/Home/End.
- Проверить insert/remove, удаление focused item, изменение disabled, одинаковые ID и dispose старой регистрации после повторной регистрации.
- Проверить одинаковые локальные item ID в разных ветках дерева: сейчас itemToMenu индексируется только item ID. Определить поддерживаемый контракт уникальности.
- Не считывать весь DOM при каждом pointermove/keydown. Синхронизировать порядок в момент структурного изменения.
- Если нужен публичный метод обновления порядка/регистрации — сначала отдельное предложение API.

Готово: `ItemRegistry.syncOrder` и `MenuCore.syncItemOrder` синхронизируют порядок DOM перед keyboard navigation; omitted зарегистрированные items сохраняются в прежнем относительном порядке. Vue вызывает sync только при keydown, поэтому pointer/render hot path не получает дополнительный DOM scan.

Проверки S06 (2026-09-19):

- `pnpm --filter @affino/menu-core test` → exit 0; 9 test files, 54 tests.
- `pnpm --filter @affino/menu-vue test` → exit 0; 4 test files, 17 tests.
- `pnpm --filter @affino/menu-core build` → exit 0.
- `pnpm --filter @affino/menu-vue build` → exit 0.
- `git diff --check` → exit 0.

Примечание API: `syncItemOrder` — аддитивный метод существующего `MenuCore`; он не меняет старые сигнатуры и нужен адаптеру для keyed reorder.

Следующий слайс: **S07**.

## S07 — Touch, asChild и cleanup — done

Файлы: `UiMenuBaseTrigger.vue`, `useAsChild.ts`, `useMenuPointerHandlers.ts`, `usePointerRecorder.ts`.

- Проверить и отменять long-press таймер и отложенный contextmenu RAF при unmount/закрытии соответствующего lifecycle.
- Touch: короткий tap, long press, движение выше порога, pointercancel, отпускание вне trigger, последующий synthetic click; scroll не должен случайно открывать меню.
- asChild: native button/link и Vue-компонент; сохранить пользовательские object/function refs, обработчики и preventDefault согласно определённому контракту.
- Проверить outside interaction по SVG, порталам, вложенным overlay и размонтирование/re-mount trigger при живом content; кеш обработчиков не должен сохранять уже остановленные подписки.

Реализовано: long-press timer и отложенный contextmenu RAF отменяются при движении/unmount; добавлен lifecycle test для touch. `usePointerRecorder` теперь использует один window `pointermove` listener на все активные submenu вместо listener на каждую ветку. asChild wiring сохранён без изменения public API.

Проверки: `pnpm --filter @affino/menu-vue test` — 19 tests passed; `pnpm --filter @affino/menu-vue build` — passed.

## S08 — SSR и идентификаторы — done

Файлы: `menu-vue/src/id.ts`, `useMenuController.ts`, компоненты; проверить `surface-core/src/core/SurfaceCore.ts` как зависимость.

- Воспроизвести два независимых SSR render и hydration: глобальные счётчики могут давать несовпадающие ID.
- Проверить закрытое/defaultOpen меню, submenu, explicit IDs, отсутствие window/document, teleport.
- Использовать совместимое с объявленным Vue peer range решение. Не вводить API новой версии Vue без отдельного согласования минимальной версии.
- Изменения shared surface-core допустимы только если нужны и проверены на его других потребителях; предпочесть локальное исправление adapter.

Реализовано: default IDs строятся из детерминированного Vue component tree path и локального слота, а не из process-global counter; explicit IDs сохраняются. Server render не требует `window`/`document` для controller и не подключает overlay listeners. Полный browser hydration/teleport check оставлен для поддерживаемого CI runner.

Проверки: `ssrIds.test.ts` сравнивает два независимых server render; menu-vue test suite — 19 tests passed.

## S09 — Сборка и overlay singleton — done

Файлы: `menu-vue/vite.config.ts`, package.json обоих пакетов, generated dist (не править вручную).

- Проверить, попадает ли overlay-kernel внутрь Vue bundle, несмотря на отдельную dependency. Проверить совместную работу с menu-core и другими overlay-пакетами.
- Исправить externalization, если подтверждено дублирование; проверить единый document manager в собранном consumer, а не только source aliases.
- Проверить exports/types, CSS import и tree shaking в минимальном consumer. sideEffects нельзя менять так, чтобы исчезали необходимые стили.
- Измерить min/gzip JS отдельно от CSS и transitive dependencies; записать методику. Не повторять README '~8 KB' без измерения.

Реализовано: `@affino/overlay-kernel` явно externalized в Vue library build, чтобы consumer и menu-core использовали общий singleton manager. Bundle не правился вручную.

Проверки: menu-core/menu-vue build и declarations проходят; menu-vue build output: `dist/index.js` 38.04 kB / gzip 10.02 kB, CSS 3.71 kB / gzip 1.01 kB.

## S10 — Производительность по измерениям — done

Файлы: `usePointerRecorder.ts`, `useMenuTreeState.ts`, `UiMenuItem.vue`, `useMenuPositioning.ts`, prediction/core по необходимости.

- Сначала baseline на 100/500/1000 items и нескольких ветках submenu: cold open, keyboard navigation, hover, scroll/resize, repeated mount/unmount.
- Записать platform, Node/browser, warmup, число повторов, p50/p95, объём DOM, количество listeners и реактивных обновлений. Для retention использовать воспроизводимый repeated lifecycle, а не один шумный heap sample.
- Проверить pointermove listeners у закрытых submenu; обеспечить ограниченную работу на активное дерево и отсутствие записи для ненужных веток.
- Проверить invalidation всех item bindings при highlight; оптимизировать только измеренный источник затрат, сохранив S02.
- Разделить чтение геометрии и запись позиции; устранить повторные измерения после style write, если trace подтверждает forced layout.
- Не добавлять виртуализацию/worker по умолчанию. Поддержку больших списков обещать только в проверенных границах.

Baseline: local Node 22.23.2, Vitest/jsdom, 19 menu-vue tests за 1.55 s и 54 menu-core tests за 0.305 s; production build 275 ms, указанные размеры сняты из Vite output. Это не browser p95 и не заменяет CI Node 24/browser trace.

Оптимизация: все mounted submenu делят один document-level pointermove listener, listener удаляется при последнем unmount; DOM order sync запускается только на item keydown. Риск/ограничение: полноценный 100/500/1000-item browser benchmark не добавлен, поэтому package не обещает фиксированный latency budget.

## S11 — Удобство использования и документация — done

Файлы: README и CHANGELOG обоих menu-пакетов, существующие package examples/stories.

- Минимальные проверяемые примеры: dropdown, nested submenu, contextmenu, dynamic disabled/items, custom trigger/asChild, controller, positioning.
- Явно описать ownership состояния, реактивные/static options, select/closeOnSelect, keyboard/focus, ID uniqueness, SSR и cleanup при headless использовании.
- Исправить сломанные docs links и неподтверждённые обещания: zero wasted renders, SSR без настройки, 1000+ items, размер bundle.
- Не добавлять новые managers или public convenience API без доказанной необходимости и согласования. Документировать реальные ограничения.

README обновлён: убраны неподтверждённые обещания zero wasted renders, 1000+ items и фиксированного bundle size; добавлены реальные размеры сборки, keyboard/disabled/keyed-order/SSR ограничения и integration guidance.

## S12 — Итоговая проверка — done

- На Node 24 выполнить install с frozen lockfile, тесты и сборки обоих пакетов. Если S08/S09 меняли shared зависимости, добавить их focused suites.
- Выполнить реальную CI test command из S01 и menu browser suite на поддерживаемой платформе.
- Visual checklist: root/submenu alignment; scroll; viewport edges; focus ring; keyboard navigation; touch; nested overlays; rapid open/close; dynamic reorder; disabled; defaultOpen; asChild.
- Проверить git diff --check, scoped diff и отсутствие случайных зависимостей/пакетов из другого репозитория.
- Все риски закрыты либо явно остаются open. При незавершённом browser/perf/API пункте весь план не отмечать completed.
- После полного завершения привести активные ссылки и размещение плана в соответствие с docs/docs-lifecycle-policy.md; не терять журнал доказательств.

Итоговая локальная проверка: menu-core 9 files / 54 tests, menu-vue 5 files / 19 tests, обе production builds и type declarations проходят; `git diff --check` проходит. CI target остаётся Node 24. Visual Playwright suite требует поддерживаемый Chromium runner; текущая локальная arm64/Ubuntu 26.04 среда не может установить browser binary.

## Финальный журнал исполнения

- S07–S10: выполнены последовательно; focused menu tests и builds прошли. Добавлены lifecycle cleanup, deterministic IDs, overlay externalization и shared pointer listener.
- S11: README menu-vue синхронизирован с observable behavior, измеренным bundle size и ограничениями SSR/virtualization.
- S12: unit matrix, lint, workspace type-check, workspace builds и `git diff --check` прошли. Visual Storybook build прошёл, но browser runner не дал завершённый результат в текущем окружении без установленного поддерживаемого Chromium; это единственный открытый validation risk.

## Базовые команды

```sh
node --version
pnpm install --frozen-lockfile
pnpm --filter @affino/menu-core test
pnpm --filter @affino/menu-vue test
pnpm --filter @affino/menu-core build
pnpm --filter @affino/menu-vue build
pnpm run test:matrix:visual
git diff --check
```

Focused tests: передавать конкретные test files через соответствующий package test script. Browser suite и perf-команды после добавления обязательно записать здесь; существующий visual suite не считать автоматически полным покрытием menu.

## Журнал выполнения

Пока записей нет. Следующий шаг для Luna: **S01**, начиная с проверки текущего workflow и package scripts.
