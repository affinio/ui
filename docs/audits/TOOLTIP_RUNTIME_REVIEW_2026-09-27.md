# Tooltip: проверка текущей реализации

Дата: 2026-09-27. Область: `tooltip-core`, `tooltip-vue`, браузерный адаптер `tooltip-laravel`, используемые `surface-core`, `overlay-host`, `overlay-kernel`.

Аудит выполнен по рабочему дереву с уже существующими незакоммиченными изменениями. Во время проверки менялся `useTooltipController.ts`; воспроизведения и Vue suite повторно запущены после изменения. Это дополнение к [предыдущему статическому аудиту](TOOLTIP_TECHNICAL_AUDIT_2026-09-27.md), а не оценка только HEAD. При составлении отчёта код реализации не менялся; последующие исправления зафиксированы в конце документа.

## Вердикт

Разделение framework-neutral state/geometry и адаптеров удачное. Геометрия перебирает ограниченное число вариантов; core не содержит DOM-измерений; Vue использует shallow state; scroll/resize пересчёты коалесцируются через rAF. Переписывать всю архитектуру оснований нет.

Однако текущая реализация ещё не обеспечивает требуемую надёжность базового компонента. Подтверждены ошибки отмены открытия, cleanup, hover, keyboard dismissal и позиционирования. Для массового использования есть нежелательная зависимость стоимости от количества закрытых tooltip. Зелёные unit tests и build эти сценарии не обнаруживают.

P1 ниже — дефект базового поведения или поддерживаемого способа потребления; P2 — ограничение отдельного режима либо масштабирования. Это приоритет исправления, не оценка security.

## Подтверждённые проблемы

### 1. P1 — close не отменяет ожидающее открытие

Источник: [TooltipCore.ts:178](../../packages/tooltip-core/src/core/TooltipCore.ts#L178), [SurfaceCore.ts](../../packages/surface-core/src/core/SurfaceCore.ts).

`closeWithSource()` выходит, если состояние ещё closed; open timer остаётся. Базовый `SurfaceCore.close()` тоже отменяет таймер только после изменения состояния.

Воспроизведение: pointerenter → `close()` до истечения 80 ms → advance 80 ms → `open === true`. Аналогичный сценарий с `window.blur` в Vue также открывает tooltip уже после потери фокуса окна.

Исправление: отмена pending intent должна происходить независимо от наличия видимого tooltip. Нужны контракты pending-open → close/blur/visibilitychange, с повторным наведением после возвращения.

### 2. P1 — Laravel teardown не уничтожает TooltipCore

Источник: [hydrate.ts:436](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L436).

Cleanup снимает подписки/observers и удаляет handle, но нигде не вызывает `tooltip.destroy()`. Ожидающие open/close timers продолжают работу. Отдельные focus/pinned rAF callbacks также не входят в общий набор отменяемых задач.

Воспроизведение: сохранить старый handle → pointerenter → teardown → удалить root → advance 100 ms. Старый handle показывает `open === true`. Это подтверждение незавершённого жизненного цикла и удержания объектов до выполнения таймера; бессрочная утечка heap этим тестом не доказана.

Исправление: один идемпотентный teardown, который уничтожает core и инвалидирует все отложенные задачи. Покрыть повторную гидратацию и сохранённый старый handle.

### 3. P1 — Laravel не удерживает tooltip при наведении на его поверхность

Источник: [hydrate.ts:528](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L528).

`bindTooltipProps()` превращает функции `onPointerEnter/onPointerLeave` в строковые атрибуты `on-pointer-enter/on-pointer-leave`. Обработчики событий не устанавливаются. Поэтому вход на поверхность не отменяет close timer от trigger.

Воспроизведение: открыть → pointerleave trigger → pointerenter surface → advance 160 ms: tooltip закрывается. Ошибка возникает и при штатной вложенной Blade-разметке; teleport для её проявления не требуется.

Исправление: корректно связать и очистить surface event handlers. Дополнительно проверить пересечение gutter: глобальный pointer guard может закрыть tooltip раньше closeDelay, когда target вне root.

### 4. P1 — стандартное использование Vue/Laravel не закрывается по Escape

Источники: [useTooltipController.ts](../../packages/tooltip-vue/src/useTooltipController.ts), [hydrate.ts](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts), [overlay-kernel](../../packages/overlay-kernel/src/index.ts).

Нет keydown wiring для tooltip. Регистрация в overlay manager сама по себе не подключает DOM keyboard listener. Laravel создаёт core без менеджера. В обоих адаптерах после открытия и bubbling `KeyboardEvent('keydown', {key: 'Escape'})` tooltip остаётся открыт.

Исправление: определить одного владельца Escape, согласовать dismissal с верхним overlay и не закрывать заодно родительский dialog. Проверять сохранение фокуса и отсутствие немедленного повторного открытия.

Escape и удержание hover соответствуют описанному [WAI tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) — сам APG отмечает этот pattern как work in progress. Требования dismissible/hoverable/persistent объяснены в [WCAG 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html); вывод о соответствии всего приложения требует учёта исключений и реальной разметки.

### 5. P1 — Laravel считает границы viewport как 10000 × 10000

Источники: [hydrate.ts:117](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L117), [computePosition.ts](../../packages/surface-core/src/positioning/computePosition.ts).

Адаптер не передаёт viewportWidth/viewportHeight. В core fallback — 10000. Добавленный resize listener этого не исправляет: после resize расчёт всё ещё использует неправильные размеры.

Воспроизведение с mocked rects: viewport JSDOM 1024 × 768; trigger `(900, 740, 60, 20)`, surface `200 × 80`, bottom/start. Результат выходит за правую и нижнюю границы viewport.

Исправление: передавать актуальные размеры соответствующего window; проверить края viewport, resize и mobile visual viewport в браузере.

### 6. P2 — strategy:absolute использует координаты viewport

Источники: [useFloatingTooltip.ts:70](../../packages/tooltip-vue/src/useFloatingTooltip.ts#L70), [hydrate.ts:117](../../packages/tooltip-laravel/resources/js/tooltip/hydrate.ts#L117).

Оба адаптера читают `getBoundingClientRect()` и напрямую присваивают результат в `left/top`, меняя только CSS position. Для absolute необходим перевод в систему координат containing block. Например, при offset родителя 100 px назначение viewport-left 150 px даст положение около 250 px вместо 150 px, без учёта border/scroll.

Статически подтверждено отсутствие преобразования; реальное браузерное смещение не измерялось. Аналогичный риск есть у fixed внутри transformed ancestor при custom teleport target.

Исправление: определить систему координат каждого поддерживаемого strategy и покрыть positioned/scrolled/transformed container реальными браузерными тестами.

### 7. P2 — Vue relayout неполон

Источники: [useFloatingTooltip.ts:120](../../packages/tooltip-vue/src/useFloatingTooltip.ts#L120), [overlay-host](../../packages/overlay-host/src/index.ts).

- Watch open-state не immediate. При `defaultOpen:true` refs могут обеспечить первое измерение, но resize/scroll listeners не активируются до следующего закрытия/открытия. Воспроизведение подтвердило ноль регистраций этих listeners при создании уже открытого tooltip.
- ResizeObserver отсутствует: изменение размеров trigger или текста поверхности при сохранении refs не вызывает автоматический пересчёт. Shared relayout helper наблюдает только window scroll/resize. Это статическая проверка, без браузерного измерения.

Исправление: синхронизировать relayout с начальным состоянием; наблюдать размеры обоих элементов только в необходимый период и очищать наблюдение. Сохранить единый rAF scheduler.

### 8. P2 — закрытые Vue tooltip создают массовую глобальную нагрузку

Источники: [useTooltipController.ts:58](../../packages/tooltip-vue/src/useTooltipController.ts#L58), [TooltipCore.ts](../../packages/tooltip-core/src/core/TooltipCore.ts), [overlay-kernel getDescendants/emit](../../packages/overlay-kernel/src/index.ts#L587).

На финальном проверенном состоянии 100 закрытых controllers зарегистрировали 100 window blur + 100 document visibilitychange listeners. Каждый также регистрируется в overlay manager в closed-состоянии, с `releaseOnIdle:false`, и подписывается на общий close-requested event.

При N независимых tooltip:

- память и global listener count растут O(N), даже когда все закрыты;
- manager requestClose сканирует entries и рассылает событие подписчикам: O(N);
- последовательный destroy всех записей вызывает повторные getDescendants scans: O(N²) по числу записей, при независимых roots.

Сложность установлена по коду; latency/heap бюджет в браузере не измерялся. Это риск плотных таблиц и списков, а не доказанное число пропущенных кадров.

Исправление: уменьшить стоимость idle instances, переиспользуя существующие lifecycle/overlay механизмы. Проверить ленивую регистрацию и shared document listener с явным lifecycle; не вводить параллельный tooltip manager без необходимости. У Laravel дополнительно остаются три MutationObserver и один ResizeObserver на каждый hydrated root, включая закрытые; измерить цену больших форм и morph bursts.

### 9. P1 для Node ESM/SSR — собранные entrypoints не импортируются

Источники: [tooltip-core/src/index.ts](../../packages/tooltip-core/src/index.ts), [tooltip-vue/src/index.ts](../../packages/tooltip-vue/src/index.ts), [существующий ESM gate](../../scripts/check-components-esm-specifiers.mjs).

После успешных builds прямой Node import обоих `dist/index.js` даёт `ERR_MODULE_NOT_FOUND`: относительный `./core/TooltipCore` не имеет `.js`. Vue падает через core; его собственные emitted imports тоже без расширений. Существующий components ESM gate не включает tooltip.

Это ограничивает native Node ESM и SSR с externalized dependencies; не означает, что Vite client bundling сломан. Source-alias unit tests не проверяют опубликованный entrypoint.

Исправление: привести emitted imports tooltip и его dependency chain к native ESM и добавить smoke import фактических dist/tarball entrypoints в существующий gate.

## Покрытие и проверка

Выполнено:

- `pnpm --filter @affino/tooltip-core --filter @affino/tooltip-vue --filter @affino/tooltip-laravel test`: **45 passed** — core 16, Vue 10, Laravel 19.
- Повторный `pnpm --filter @affino/tooltip-vue test` после изменения рабочего дерева: **10 passed**.
- Builds всех трёх пакетов: **passed**, включая TypeScript/declaration generation.
- Временные девять диагностических Vitest/JSDOM сценариев: **9/9 подтвердили описанное дефектное поведение либо idle listener count**. Эти assertions проверяли воспроизведение текущей проблемы, а не правильность контракта. Первоначальное ожидание трёх глобальных listeners скорректировано до двух после параллельного изменения controller; повторный запуск прошёл. Временные файлы удалены после аудита.
- Native Node imports core/Vue dist: **оба неуспешны**, ошибка указана выше.

Не выполнялись: browser visual/layout matrix, Laravel/PHP integration, screen readers, нагрузочные browser latency/heap benchmarks. JSDOM с mocked rects подтверждает ошибку передачи размеров, но не заменяет реальный layout engine. Существующий `bench-vue-adapters.mjs` обозначен как synthetic proxy; его результаты не являются измерением actual tooltip controller.

Дополнительные открытые проверки: SSR hydration ID stability (в surface-core используется module-global counter), touch/pen pointer policy, browser zoom, layout shifts без resize, nested overlays. Они не включены в список runtime-подтверждённых дефектов.

## Последовательность исправлений

1. Отмена pending-open и полноценный teardown; затем hover и Escape contracts.
2. Viewport/absolute geometry и полный Vue relayout lifecycle.
3. Native ESM entrypoints и idle overhead.
4. Browser matrix: viewport edges, nested scroll, content resize, initial-open, teardown/morph, hover transit, Escape внутри dialog. Затем нагрузка 1/100/1000 смонтированных tooltip с одним активным: frame latency, allocations, listener/observer counts, mount/dispose и возврат heap к baseline.

Часть прежнего аудита уже устарела: Vue revalidation после nextTick, Laravel scroll/resize wiring, focus-relatedTarget guard, перенос ARIA и нормализация arrow inputs присутствуют.

## Результат исправлений

В последующем срезе закрыты все девять кодовых замечаний выше:

1. `TooltipCore.close()` отменяет ожидающее открытие даже при закрытом состоянии; Vue blur/visibility используют один document runtime и закрывают pending hover.
2. Laravel teardown отменяет scheduled work, закрывает открытую подсказку, уничтожает core и удаляет его из внутреннего registry. Отложенная Livewire rehydrate проверяет dispose.
3. Laravel назначает pointer handlers поверхности через `addEventListener`; функции больше не сериализуются в HTML-атрибуты.
4. Vue использует один document Escape/blur/visibility handler на набор активных tooltip. Laravel использует общий Escape guard и общий overlay-kernel manager; Escape проходит к диалогу, если tooltip не верхний.
5. Laravel передаёт размеры viewport owner window в geometry.
6. Vue/Laravel переводят viewport coordinates в координаты containing block для absolute positioning и fixed positioning внутри transformed containing block.
7. Vue активирует relayout при исходном `defaultOpen` и наблюдает размеры обеих ссылок только пока tooltip открыт. Laravel включает `ResizeObserver` только во время открытия.
8. Закрытый core освобождает kernel регистрацию; Vue делит document listeners между активными tooltip. Laravel свёл три локальных `MutationObserver` к одному и отключает `ResizeObserver` после close.
9. Relative ESM imports исправлены в tooltip/surface dist цепочке; ESM gate теперь проверяет tooltip packages и импортирует их собранные entrypoints.

Добавлены регрессии для pending open/blur/Escape, hover-перехода trigger → surface, teardown, viewport bounds, absolute/fixed containing-block offsets, начального открытого состояния, ResizeObserver lifecycle, shared listener count и ESM imports. После финального среза: core 17, Vue 16, Laravel 24, surface-core 10, overlay-kernel 5 тестов пройдены; builds пяти пакетов, ESM gate и прямые Node imports core/Vue пройдены.

Остаются проверки, которые нельзя подтвердить текущим окружением: реальный layout engine/визуальная матрица, screen readers, Laravel/PHP integration, touch/zoom и browser latency/heap budget. Chromium/Firefox в окружении не установлены. JSDOM lifecycle probe измерил максимумы пяти серий для 100/1000 закрытых controllers: mount 5.15/2.27 ms, open-close 0.39/0.12 ms, dispose 0.13/0.22 ms. Это synthetic probe без отображения DOM и не performance gate.
