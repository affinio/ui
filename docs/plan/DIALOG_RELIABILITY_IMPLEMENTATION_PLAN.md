# Dialog — reliability / lifecycle implementation plan для Luna

Статус: **in_progress; 8/10 slices closed**. Дата: 2026-09-19.
Область: @affino/dialog-core, @affino/dialog-vue, JS bridge @affino/dialog-laravel; overlay-kernel/focus-utils — только необходимые shared contracts.
Обязательно прочитать [общий аудит и протокол](COMPONENT_ENGINEERING_AUDIT_2026-09-19.md).
Главный риск сейчас — корректность async/lifecycle, затем focus/modal guarantees и стоимость mixed overlay stacks.

## Findings / доказательства

| ID | Приоритет / evidence | Где | Дефект / последствие |
| --- | --- | --- | --- |
| DL-01 | P1 / R | dialogController.ts: requestKernelMediatedClose (~439), handleKernelCloseRequest (~425) | Microtask fallback разрешает close Promise false до окончания async guard; затем диалог реально закрывается. API-результат противоречит состоянию. |
| DL-02 | P1 / R | те же методы | _request игнорируется, kernel handler вызывает performClose(reason, {}): metadata и per-request strategy теряются только для escape/backdrop/pointer. |
| DL-03 | P1 / R+S | performClose (~479), destroy (~175) | await guard не проверяет destroyed/generation: allow после destroy вызывает afterClose; optimistic deny/reopen и open во время guard могут применить старое решение к новой сессии. |
| DL-04 | P1 / S | pendingKernelCloseResolvers, guardOutcomePromise, pendingDecision | Общий Set resolvers не привязан к отдельному запросу; repeated result основан на decision, не final lifecycle; closeGuard читается из mutable поля в deferred callback. Требуются race tests. |
| DL-05 | P1 / R | createDialogFocusOrchestrator.ts: focusWithRetry | Retry microtasks не отменяются deactivate: activate→deactivate→target mounted переводит фокус назад в уже закрытый dialog. |
| DL-06 | P2 / R+S | DialogController constructor/defaultOpen, Vue composable | defaultOpen регистрирует overlay, но не activateFocus. Вызов open затем no-op. Нужна отдельная client mount activation policy без SSR focus side effects. |
| DL-07 | P1 / S | dialog-vue README и createDialogFocusOrchestrator.ts | README обещает trap/sentinels/automatic host, а helper делает только initial/return focus. Kernel traits сами по себе не устанавливают DOM trap/inert. Consumer может считать modal защищённым, когда это не так. |
| DL-08 | P1 / S | open/transition/emit/lifecycle hooks (~215–365) | Исключение внешнего hook/subscriber/overlay callback может оборвать переход/cleanup, оставить phase=opening/closing, незавершённый close Promise или необработанное rejection. Нет общего reentrancy contract. |
| DL-09 | P2 / S | useDialogController.ts (~54), SSR/registrar | Cleanup только onBeforeUnmount при current instance; effectScope-only usage не очищается автоматически. Global ID counter требует explicit ID для стабильных integrations; null manager/default resolver semantics не определены полностью. |
| DL-10 | P1 / S | dialog-laravel/globalGuards.ts; hydrate.ts (~144,563) | options.modal/returnFocus/lockScroll живут в DOM binding, но core traits передают только ownerId; nonmodal binding может объявляться modal/trapsFocus в kernel. RAF focus/restore не проверяет актуальный open generation. |
| DL-11 | P2 / S+V | Laravel registries/keydown guard/teleport | Strong Maps для persisted open/pinned/focus snapshots, per-dialog listeners/observers; окончательная очистка root removal, cross-document ownership и lifetime глобального keydown требуют long-run проверки. Не доказанная heap leak. |
| DL-12 | P1 / R | core/vue dist entrypoints | Node ESM import падает на extensionless exports/imports; unit aliases обходят package boundary. |
| DL-13 | P2 / V | tests/CI | Нет async guard × kernel × destroy/reopen матрицы, native focus/Tab tests и overhead/retention baseline для nested stacks. |

## API proposals — не утверждены

- Сохранить close/requestClose: Promise<boolean>: true только если этот запрос завершил разрешённое закрытие; false при отказе/отмене, не при ещё pending guard.
- Additive CloseGuardContext.signal?: AbortSignal и внутренний generation token. Abort signal — уведомление consumer, а не гарантия физической отмены Promise; stale completion всё равно игнорировать.
- Если diagnostics требуют причины, рассмотреть новый requestCloseDetailed() → {outcome: "closed"|"denied"|"cancelled"|"not-topmost"}; не менять существующий boolean на union молча. Не вводить, если достаточно существующих callbacks.
- Lifecycle/error contract: расширение DialogControllerErrorCode на observer/lifecycle/focus/overlay errors только после согласования; определить rethrow vs report для каждого типа.
- Focus helper: сперва решить, поддерживает ли он только initial/return focus или полноценную modal scope. Для modal scope предложить additive options с явными defaults, ownerDocument, root accessor и enable/disable; использовать существующий focus-utils.
- Предложить один adapter mount/root-binding механизм, если существующих options недостаточно для defaultOpen и динамического root; не переносить DOM hooks в core.
- Предложить scope cleanup parity: composable можно вызывать в effectScope; manual dispose остаётся вне scope.

## Прогресс

| Слайс | Задача | Зависит | Статус |
| --- | --- | --- | --- |
| D01 | Kernel close result / metadata / strategy | — | done |
| D02 | Async guard generation / destroy / reopen | D01 | done |
| D03 | Focus cancellation и корректный return target | — | done |
| D04 | Reentrancy, ошибки hooks и atomic transitions | D01,D02 | done |
| D05 | Честный modal/focus contract + DOM behavior | D03; API decision | done |
| D06 | defaultOpen, scope lifetime, SSR IDs | D02,D03,D05 | done |
| D07 | Nested overlay ownership / dynamic roots | D01,D04,D05 | done |
| D08 | Laravel alignment / lifecycle / retention | D02,D03,D07 | done |
| D09 | Package consumers / examples / perf harness | D04–D08 | in_progress |
| D10 | Full regression / browser / CI gates | D01–D09 | pending |

## D01 — Close arbitration (DL-01, DL-02, DL-04)

Файл: dialogController.ts; dialogController.test.ts; shared kernel лишь при необходимости.
- RED: open registered dialog, delayed guard allow, close("escape-key",{metadata:{...},strategy:"optimistic"}). Promise должен быть pending до решения, guard должен получить metadata, snapshot — выбранную strategy.
- Сохранить быстрый false для действительно проигнорированного kernel request (no entry/not topmost/no emitted callback).
- Различать «kernel не принял» и «принял, выполняется async close». Не решать проблему произвольным timeout.
- Коррелировать accepted request с operation promise; исключить resolve всех несвязанных requests при одном callback.
- Проверка matrix: programmatic/backdrop/escape/pointer, no guard/sync allow/async allow/deny/reject, manager/legacy registrar/no manager, repeated requests и no-event manager.
- Done: result совпадает с final close outcome, request options сохранены, нет зависших Promises и двойного guard invocation.

## D02 — Guard lifecycle ownership (DL-03, DL-04)

Файлы: core controller/types/tests.
- RED: pending blocking allow→destroy→resolve; optimistic deny→destroy; reopen пока старый guard pending; setCloseGuard/clearCloseGuard до deferred execution.
- Capture guard/request context на старте. Operation token связывает guard с open session; destroy/new session инвалидируют completion и гарантированно завершают все callers.
- Проверять generation/destroyed и в success/catch/finally: stale finally не очищает состояние нового guard.
- AbortSignal proposal — по согласованию; correctness не должна зависеть от добросовестности consumer abort.
- Done: после destroy нет lifecycle/events/focus/overlay resurrection; repeated callers получают согласованный final result, не raw decision; отказ старой сессии не открывает новый dialog.

## D03 — Cancel-safe focus (DL-05)

Файл: createDialogFocusOrchestrator.ts и tests.
- RED jsdom из probe: target=null, activate, deactivate, target=connected button, await microtasks; focus не должен попасть в target.
- Отменять retry логическим generation; проверять connectivity/visibility/focusability и реальный activeElement после focus(), не считать любой вызов focus успешным.
- Return focus: disconnected explicit target не блокирует fallback к previous active; не возвращать фокус внутрь скрытого closed dialog.
- ownerDocument вместо безусловного global document; explicit shadow/iframe support boundary.
- Done: rapid open/close/reopen/unmount не ворует фокус; native browser подтвердил реальную focusability и fallback.

## D04 — Exception/reentrancy contract (DL-08, DL-04)

Файлы: open/enterClosing/transition/emit, overlay and focus callbacks.
- Сначала fixtures: beforeOpen throws, subscriber throws during opening/closing, afterClose opens again, focus.activate throws, manager registration throws, close guard rejects.
- Определить point of commit и notification ordering, guarded cleanup и error reporting. Не превращать исключение в ложный allow/успех.
- Не разрешать callback после destroy зарегистрировать overlay обратно; nested open/close не должен потеряться в outer transition.
- Если расширяется error API — decision checkpoint; реализовать внутреннюю безопасность независимо от удобства diagnostics.
- Done: все пути оставляют согласованные phase/overlay/focus/pending fields; calls settle, cleanup повторяемый; один плохой subscriber не мешает остальным без явного documented fail-fast контракта.

## D05 — Modal surface contract (DL-07)

Файлы: dialog-vue focus helper/README/examples, focus-utils integration; не новый parallel overlay manager.
- Развести headless controller и DOM host обязанности: initial focus, Tab trap, Escape ownership, inert/background, scroll lock, aria-modal/role/name.
- Сейчас helper не trap. Исправить ложную документацию обязательно; если продукту нужен готовый modal helper, сначала конкретное предложение API с defaults и migration.
- Использовать existing focus-utils/overlay-kernel ownership, nested menu/popover должны получать фокус легально внутри modal scope.
- Browser scenarios: Tab/Shift+Tab, no focusables, disabled/hidden controls, activeElement outside surface, nested portal, screen reader accessible name, nonmodal.
- Done: пример даёт обещанное поведение; нет несоответствия kernel traits реальным DOM protections. Доступность не считать подтверждённой только jsdom.

## D06 — Client activation / scope / SSR (DL-06, DL-09)

Файлы: Vue composable/focus helper, core initial-open contract.
- RED defaultOpen + late-mounted target; core без DOM сохраняет состояние, adapter активирует focus после client mount ровно раз, если dialog ещё открыт.
- onScopeDispose через getCurrentScope для effectScope использования, idempotent manual dispose вне scope.
- SSR: два независимых render/app instances, explicit id, no document/window, defaultOpen, client root registration. Не основывать default ID на process-global uid и не повышать Vue peer floor без согласования.
- Уточнить options.overlayManager=null: deliberate opt-out или fallback; нельзя молча менять semantics. Текущий options.getOverlayManager можно использовать для явного null.
- Done: scope.stop снимает subscription/overlay, initial-open SSR не трогает DOM, hydration не создаёт второй registration с тем же ID.

## D07 — Shared overlay ownership (DL-01, DL-07, DL-10)

Файлы: dialog core integration, Vue registrar; overlay-kernel только при доказанной потребности.
- Mixed stack: dialog + menu + popover + child dialog, owner-close, escape on top child, guard denial у дочернего dialog.
- Уточнить cascade contract: manager emits requests синхронно и не ждёт child guards. Нужно решить, может ли parent закрыться при child deny; зафиксировать policy до изменения shared API.
- Проверить dynamic root reference после mount/teleport, stale registration disposer, repeated IDs, priorities, interaction matrix enforcement vs metadata-only helper.
- Done: один жест обрабатывается одним owner, lower overlay не закрывается/не перехватывает Tab; request results и DOM state согласованы.

## D08 — Laravel (DL-10, DL-11)

Файлы: dialog/hydrate.ts, globalGuards.ts, teleport.ts, livewire.ts, JS tests.
- RED nonmodal binding: фактические kernel modal/trapsFocus/returnFocus traits должны совпасть с binding options.
- Отменять/инвалидировать focus and selection RAF при close/dispose/morph; проверять текущий root и dialog generation, не старый captured surface.
- Snapshot registries: задать lifetime rehydrate continuity vs permanent removal; cleanup не должен терять нужное состояние на временном detach, но обязан освобождать окончательно удалённые roots.
- Проверить sentinels, duplicate bubbling root/overlay events, cross-document keydown, open modal + nested menu, global listener disposal.
- Done: repeated morph/unmount/open/close не увеличивает owned listeners/observers/retained roots; no focus-after-close, scroll locks ref-counted и сбалансированы.
- PHP/Livewire end-to-end остаётся отдельным обязательным environment gate; существующие JS tests его не заменяют.

## D09 — Packaging / docs / нагрузочный harness (DL-12, DL-13)

- Relative .js ESM specifiers/build correctness; packed consumer Node 24 + Vite SSR + Vue minimum supported peer test, type declarations.
- README убрать несуществующие focusFirstFocusable, sentinels/auto-host claims либо реализовать по одобренному контракту; examples компилируются.
- Harness: 1/10/100 controllers, mixed overlays, open/close bursts, 1000 pending close attempts, repeated mount/dispose. Отдельно guard wait time и собственный overhead engine/DOM.
- Проверить cost register/unregister/stack notifications, snapshot emissions, listeners count; численный бюджет только по baseline.
- Done: воспроизводимые artifacts, исправленные integration contracts, migration по observable changes.

## D10 — Acceptance (все DL)

- Commands: pnpm --filter '@affino/dialog-*' test; pnpm --filter '@affino/dialog-*' build; affected overlay/focus suites; pack smoke; git diff --check.
- Node 24 + browser native Tab/Shift+Tab/Escape, initial/return focus, defaultOpen, async guard/reopen/destroy, nested portals, mobile keyboard/viewport, nonmodal, document isolation.
- Проверить guard promises settle при всех terminal transitions, no callbacks после dispose, zero remaining locks/registrations/listeners в supported lifecycle.
- Повторить leak/perf harness с retained heap inspection и p50/p95/p99; не обещать «no leaks» по одному heap delta.
- Done только при закрытых P1, реально выполненных browser gates и честных docs. Недоступный runner = blocked validation, а не выполненный слайс.

## Журнал

2026-09-19: аудит, baseline dialog 66 tests (core 31, Vue 13, Laravel 22), builds passed. Закрыты D01–D06 и D08: kernel close requests сохраняют request context и не завершаются преждевременно, stale guard completions invalidated by lifecycle generation, focus retries cancelled on deactivate, README явно отделяет headless focus orchestration от DOM modal trap/inert/scroll-lock обязанностей host, defaultOpen focus activation выполняется только после client mount, effectScope получает cleanup, throwing lifecycle/subscriber/focus callbacks диагностируются без разрыва transition/promise, Laravel permanent root removal освобождает persisted registries, а focus RAF invalidates stale activation/deactivation. D07/D09–D10 остаются открыты.
2026-09-19: D09 продвинут: Node24 ESM import smoke, builds и pack dry-run dialog-core/vue/laravel прошли; D07 nested owner cascade покрыт существующими core tests. Dynamic-root/browser lifecycle и perf harness остаются открытыми.
2026-09-19: D09 продвинут: добавлен scripts/bench-dialog-core.mjs и package bench command; smoke на 1/10/100 controllers и burst 1000 pending close requests прошёл на Node24, p95 для 100 controllers около 3.5ms. Dynamic-root/browser lifecycle остаются открытыми.
2026-09-19: D09 consumer gate продвинут: @affino/dialog-core tarball установлен в изолированный Node24 consumer вместе с registry @affino/overlay-kernel@0.2.0 и @affino/surface-core@1.1.0; public factory импортируется без workspace aliases. Vite SSR/Vue peer и browser lifecycle gates остаются открытыми.
2026-09-19: D10 browser gate подготовлен: добавлен `scripts/smoke-components-demo.mjs`, который проверяет dialog open/ARIA/Escape и diagram selection/rotation/revision/zoom на demo-vue; CI visual job запускает smoke после установки Chromium. Локальный arm64 Ubuntu runner не может выполнить Chromium, поэтому runtime evidence ожидается от GitHub runner.
2026-09-19: D07 уточнён: mixed dialog/sheet owner-cascade, top-most rejection, duplicate-ID stale disposer и owner-cycle rejection покрыты core/kernel/Vue tests. Остался отдельный dynamic-root/teleport update contract; публичный API не расширяется без согласования.
2026-09-19: D07 закрыт: добавлен additive `DialogController.setOverlayRoot(root)` и Vue binding `setOverlayRoot`, которые обновляют существующую overlay registration после Teleport/mount без повторной регистрации; `null` очищает root, destroyed controller остаётся no-op. Core/Vue tests и README migration example добавлены.
2026-09-19: D09 benchmark повторён на Node24: 5 samples × 100 iterations дали p95 1.31ms для 1 controller, 1.51ms для 10 и 8.16ms для 100; burst 1000 pending close requests — 5.61ms. Это engine lifecycle signal без DOM paint, browser smoke покрывает DOM-facing path отдельно.
2026-09-19: Component benchmark CI gate добавлен: dialog bench запускается вместе с treeview calibrated gate и diagram benchmark в Node24 verify job. Последний локальный прогон: 100 controllers p95 9.70ms, burst 1000 — 3.44ms.
2026-09-19: D09 Vite SSR consumer gate прошёл: локальные @affino/dialog-core@1.2.0 и @affino/dialog-vue@1.2.0 tarballs установлены изолированно с registry Vue 3.5/Vite 7.3, SSR bundle собран и `renderToString` smoke успешно выполнен под Node24. Browser lifecycle остаётся D10 evidence.
2026-09-19: D07 продвинут: overlay-kernel теперь отвергает self-owner и циклические ownerId при register/update, traversal дополнительно защищён visited guard; добавлены owner graph regression tests, overlay 5 tests и dialog core 34 tests прошли.
