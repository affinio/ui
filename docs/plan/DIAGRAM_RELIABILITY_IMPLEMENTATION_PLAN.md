# Diagram — reliability / scalability implementation plan для Luna

Статус: **in_progress; 3/12 slices closed**. Дата: 2026-09-19.
Область: @affino/diagram-core + @affino/diagram-vue, существующие benches/examples.
Перед работой прочитать [общий аудит и протокол](COMPONENT_ENGINEERING_AUDIT_2026-09-19.md), docs/reference/diagram-packages.md и локальные инструкции.
Сохранить единый публичный facade createDiagramEngine; внутренние SceneStore/History/Geometry/SpatialIndex уже существуют.

## Findings / доказательства

| ID | Приоритет / evidence | Где | Дефект / bottleneck |
| --- | --- | --- | --- |
| DG-01 | P1 / R | DiagramEngine.ts: transact (~106), createReplaceScenePatch (~1186), commitPatch (~393) | Replacement возвращает только новые IDs. Пустая сцена меняет internal state, но changedIds пуст, publish/invalidation/revision пропускаются; snapshot/query остаются старыми. Deleted IDs отсутствуют и при непустом replacement. |
| DG-02 | P1 / R+S | DiagramSceneStore.ts: createInternalState/toMap/cloneValue | Внутренняя модель хранит caller-owned entity objects. Внешняя мутация + другой command публикуют новые coords без invalidation geometry: snapshot x=500, cache x=0. Arbitrary metadata object cloning теряет Date/Map и зацикливается на циклах. |
| DG-03 | P1 / R | DiagramEngine.ts: commitPatch/undo/redo | publish происходит до history.record/pushRedo/pushUndo. Subscriber видит неактуальные canUndo/canRedo/depth; повторного уведомления нет. Ошибка subscriber может оставить mutated scene без записи истории (S). |
| DG-04 | P1 / R+S | interaction.ts: pointerUp, DiagramHistory.record, composePatches | Разные drag одного primary используют один historyKey и сливаются: два drag → depth=1, undo отменяет оба. Composed patches — вложенные closures без bound; длинная серия увеличивает память/глубину undo. |
| DG-05 | P1 / R+S | createEditTextPatch (~1132), command creators, Vue text editor | canEditText=false для locked, но editText всё равно изменяет текст. beginTextEdit тоже не проверяет capability. Проверить consistent guards всех mutating commands, dependent deletion semantics. |
| DG-06 | P1 / S | spatialIndex.ts: keysForRect (~55), scene/viewport command inputs | Grid перечисляет каждую клетку площади; огромный rect/edge ведёт к огромной allocation, Infinity может сделать loop незавершаемым. Нет finite/size/ID/reference validation boundary. |
| DG-07 | P1 / M+S | DiagramSceneStore.createSnapshot (~52) | На каждый accepted command clone+freeze всех entities, Maps, order, selection, viewport — O(N+payload). Даже camera update не сохраняет entity identity. 10k простых nodes viewport p50 ~8.48 ms без UI/index rebuild. |
| DG-08 | P1 / S | DiagramEngine.collectInvalidatedIds (~412), DiagramSpatialIndex.ensure | Изменение K nodes сканирует все ports/edges на каждый ID; любой command markDirty всего индекса, lazy query перестраивает все три grid indexes. Selection тоже invalidates выбранные nodes и зависимую geometry. |
| DG-09 | P2 / M+S | createOrderedIds/createOrderIndex (~519), queryVisible/hitTest | Каждый tiny spatial query строит/sorts order всех N entities и Map; стоимость зависит от total scene даже при 3 видимых nodes. Tiny-query 10k p50 ~1.83 ms в пробе. |
| DG-10 | P1 / S | useDiagramVisibleEntities.ts (~31,55) | На каждую publication заново query + createEntityGeometry для всех видимых, минуя core geometry cache и change IDs, затем все render wrappers/arrays. Subscribe сразу вызывает refresh и затем есть второй explicit refresh. |
| DG-11 | P1 / R+S | interaction.ts cancel/clearGesture, Vue pointer controller | cancel оставляет transient tool drag-selection/marquee/resize-selection; следующий pointerDown может обойти select/hitTest. RAF не связан с gesture generation; второй pointer заменяет activePointer; defaults используют client coords как world. |
| DG-12 | P2 / S | useDiagramPointerController.ts: onPointermove (~54) | Core batching есть, но Vue пишет новый state snapshot на каждый raw pointermove и ещё после RAF; idle pointermoves также меняют ref. Capture/release optional, cancel не release capture. |
| DG-13 | P1 / S | useDiagramRenderer.ts, visible projection, docs/reference/diagram-packages.md | getSvgEntityProps/getDomEntityStyle используют rotated AABB как исходный rect и не применяют rotation. Разделение render arrays по kind в примере может нарушить cross-kind z-order, хотя projection.ids отсортирован. |
| DG-14 | P2 / S+V | history, transact, dispose contracts | History без max depth/bytes; transact заменяет model вне history и не сбрасывает старый redo. Нужны политика replacement/history boundary и bounded session retention. Нет engine destroy API; это не leak само по себе, но lifetime contract не определён. |
| DG-15 | P2 / R+S | queryEntities, changedIds, selection/viewport patches | limit=0 возвращает 1 item; pseudo IDs "selection"/"viewport" смешаны с real IDs и могут collide. Snapshot change Sets frozen, но Set.add всё ещё изменяет содержимое. |
| DG-16 | P2 / S+V | benchmarks/tests/CI | bench использует edgeId вместо id для waypoint commands, может мерить no-op; panFpsEstimate — queries без renderer. Source aliases не охватывают package consumers; diagram aliases отсутствуют в общем workspace alias map, Vue tests могут тестировать собранный core вместо текущего source. |
| DG-17 | P2 / S+V | snapToAlignment, metadata queries, viewport/text adapters | Alignment линейно сканирует nodes, excludeIds применён к ports, но не alignment, nearest alignment зависит от order. External viewport ref для editor не watch, ResizeObserver viewport/history policy не определена. Нужны targeted contract checks. |

Уровень доказательств указан намеренно: S/V пункты требуют RED/runtime evidence до исправления. Не выдавать каждый потенциальный профиль за измеренный bottleneck.

## Предложения API — decision checkpoint

1. Сохранить immutable getScene()/subscribe(scene,change), но расширить change domains:
   entities/geometry/order/selection/viewport/history, deletedIds, revisions. Не использовать reserved pseudo entity IDs для domain changes.
2. Replace/import: отдельная явная политика history (reset | record | preserve с определённой rebase semantics). transact legacy behavior мигрировать осознанно; silent replacement при старом undo недопустим.
3. History: begin/end transaction или historyGroup token на один gesture; options maxEntries/maxBytes и clearHistory. Не вводить все варианты одновременно; выбрать минимальный контракт.
4. Typed input validation / diagnostics: invalid numeric geometry, duplicate cross-kind IDs, dangling references, metadata format; documented result/error вместо partial mutation или hang.
5. Viewport/selection history policy: документировать, включаются ли camera/selection changes в undo. Если добавить history: "record"|"skip" per dispatch/options — сохранить старые defaults до согласования.
6. Pointer adapter: world mapping contract через viewport+element/mapper, lifecycle hooks for capture/lostcapture, один cancel path; не считать client coordinates world coordinates без явного opt-in.
7. Readonly cache-safe geometry snapshot; ordered renderer projection preserving cross-kind z-order; readonly refs/validated setters для adapter.
8. destroy/dispose facade добавлять только при доказанной потребности retained engine, с ясным owned vs externally supplied engine contract.

## Прогресс

| Слайс | Задача | Зависит | Статус |
| --- | --- | --- | --- |
| G01 | Atomic replacement / input ownership | — | done |
| G02 | Consistent transaction publication / history state | G01 | done |
| G03 | Gesture-scoped bounded history | G02; API decision | in_progress |
| G04 | Command capability и validation | G01,G02 | done |
| G05 | Immutable snapshots с structural sharing | G01,G02 | pending |
| G06 | Domain invalidation / adjacency / incremental indexes | G04,G05 | pending |
| G07 | Cached order / bounded spatial queries / snapping | G04,G06 | in_progress |
| G08 | Incremental Vue projection / subscriptions | G05–G07 | in_progress |
| G09 | Pointer ownership / frame budget / cancellation | G03,G04 | pending |
| G10 | Rendering geometry / ordering / editor / viewport | G08,G09 | pending |
| G11 | Correct benchmarks / consumers / docs | G01–G10 | pending |
| G12 | Stress, browser, retention, CI regression gates | G11 | pending |

## G01 — Atomic state replacement и ownership (DG-01,DG-02,DG-14)

Файлы: DiagramEngine.transact/createReplaceScenePatch, DiagramSceneStore, tests.
- RED empty replacement из непустой сцены: scene/query/geometry/version/revision/subscription должны согласованно показывать пустоту.
- Изменения должны включать union старых/новых IDs и domain changes даже без entities; invalidate удалённые cache entries, сбалансировать versions map, geometry/spatial caches.
- Clone/own input на boundary по defined metadata contract; внешняя mutation input не должна менять engine. Не делать full clone на каждый read.
- RED caller modifies initial node/edge points/metadata после constructor/transact; следующее viewport изменение не должно «подмешивать» caller changes.
- Подготовить replacement/history API decision; проверить stale redo после transact. Runtime validation до commit, не после partial mutation.
- Done: serializable roundtrip, empty/nonempty replace, removed dependency IDs и input mutation tests; immutable published snapshots не изменяются с последующими commands.

## G02 — Publication boundary (DG-03,DG-15)

Файлы: commitPatch/undo/redo, DiagramSceneStore.publish, DiagramHistory.
- RED subscriber читает canUndo/depth на первом dispatch, canRedo после undo, changed IDs после delete.
- State, revisions, indexes-invalidations и history должны достигнуть согласованного commit до observable notification.
- Не смешивать mutable native Set и readonly guarantees; задать runtime/typing contract для change collections.
- Subscription throws/reentrant dispatch: определить error isolation, snapshot consistency для всех observers, no half-recorded command.
- Done: subscriber видит единую committed revision с верной history; no-op не публикуется; exception path не оставляет scene без undo при принятом edit.

## G03 — History transactions и retention (DG-04,DG-14)

Файлы: DiagramHistory.ts, composePatches, interaction.pointerUp, public types.
- RED два отдельных drag выбранного node без промежуточного selection: ожидаются две gesture entries. Аналогично resize и pan; repeated undo/redo.
- Внутри одного drag core уже коммитит один command на pointerUp — не вводить per-move history. Использовать unique gesture session вместо постоянного primaryId ключа.
- Для нуджей/grouped commands: bounded coalescing, не recursive closure chain на тысячи updates; проверить 10k grouped moves/undo без stack overflow.
- Proposal maxEntries/bytes, reset/replacement policy и history skip для transient camera решать явно.
- Done: undo отменяет одно пользовательское действие, redo детерминирован, history budget/eviction не оставляет dangling references; long-lived engine memory стабилизируется при выбранном лимите.

## G04 — Command and input invariants (DG-05,DG-06,DG-15)

Файлы: all command creators, types, SceneStore input boundary, Vue text editor.
- RED locked/readOnly editText при canEditText=false; beginTextEdit должен следовать core capability.
- Matrix move/resize/rotate/align/text/waypoints/endpoints/create/delete/paste/keyboard + locked/readOnly/nonDeletable; document ancestor deletion vs protected dependent entity.
- Validate finite coords, dimensions/zoom/radius/query limit; duplicate IDs across kinds, invalid endpoint/port owner, unknown selection IDs, reserved-string IDs как обычные пользовательские ID.
- Grid pathological bounds проверять только isolated timeout/memory-bound process до исправления. Не пытаться создать Infinity-sized index в основном Vitest worker.
- Metadata: определить JSON-only schema или допустимые rich objects; reject/copy циклы предсказуемо, не recursion overflow.
- Done: capabilities и accepted commands согласованы, rejected/no-op command не меняет scene/history; limit=0 → [] по утверждённому контракту.

## G05 — Structural sharing snapshot (DG-07,DG-02)

Файл: existing DiagramSceneStore, не parallel store.
- Baseline entity identity/recomputed objects/bytes: camera-only, selection-only, one node, group move, metadata-rich entity.
- Immutable unchanged entities/order/maps должны переиспользоваться там, где безопасно. TS ReadonlyMap не обеспечивает runtime immutability сам по себе; сохранить контракт snapshots.
- Не превращать public immutable snapshot в view поверх mutable state. Old snapshots должны оставаться корректными после edits/undo/replace.
- Для changed map возможна O(N) persistent/map-copy стоимость: честно измерить; минимальный target — убрать deep clone всех unchanged payloads, camera/selection не трогают entity maps.
- Done: identity/correctness tests + before/after operation allocation; camera-only O(1) по entities или явно доказанный другой предел без fake counters.

## G06 — Incremental invalidation/indexes (DG-08,DG-15)

Файлы: collectInvalidatedIds, GeometryService, SpatialIndex/UniformGridIndex.
- Разделить domain invalidation: viewport/selection/history не rebuild геометрию/индексы, z-order не geometry edit.
- Поддержать node→ports/edges, port→edges adjacency; корректно обновлять при paste/delete/replace/waypoint/undo.
- Spatial insert/update/remove affected entries вместо markDirty всех indexes. При huge replacement full rebuild допустим с явным критерием.
- Проверять oracle indexed query vs brute force после randomized command sequences, включая ports dependent on rotated/resized nodes.
- Done: move одного isolated node не сканирует все edges/ports; selected flag не пересчитывает geometry; index touched entries ~changed dependency closure, не N.

## G07 — Query/order/grid/snap (DG-06,DG-09,DG-17)

Файлы: createOrderedIds/createOrderIndex, spatialIndex.ts, snapping.
- Cache order/index по order revision; invalidate membership/layer/zIndex changes и undo, не каждый query.
- Oversized geometry: bounded fallback/large-object bucket/иной existing-index extension; query огромного viewport не создаёт unbounded список empty cell keys.
- Measurable query contract: cost зависит от bounded cells/candidates + output order, не от повторной full sort N.
- Snapping: exclude moving selection от alignment, nearest/deterministic tie policy; оптимизация по измерению, не добавлять ещё один индекс без evidence.
- Done: nearest-port/hit/visible oracles, sparse/clustered/overlapping/long-edge scenes и viewport huge/offscene корректны; cap/fallback documented.

## G08 — Vue projection (DG-10,DG-15)

Файлы: useDiagramVisibleEntities, useDiagramEngine, useDiagramSelection.
- Использовать core cached geometry и change domains/versions; stable entity wrappers для неизменных rows. Camera-only update не должен повторно создавать geometry.
- Устранить duplicate initial refresh; refreshVisible(customBounds) scope/персистентность явно определены.
- Unrelated offscreen edit не перестраивает все visible wrappers; selection updates затрагивают affected selected entities/handles; offscreen selected entities остаются доступны.
- Snapshot/change refs должны давать coherent revision даже для sync consumers; external engine updates, effectScope.stop/manual dispose, reentrant subscribers.
- Done: identity + recompute counters tests, multiple projections на одном engine, no callbacks после disposal; реальный renderer не получает full rerender при unrelated command.

## G09 — Pointer lifecycle and frame cost (DG-11,DG-12)

Файлы: interaction.ts, useDiagramPointerController.ts.
- RED cancel during drag → click empty area должен стать marquee/select, не двигать предыдущую selection.
- Active pointer identity: второе касание/другая кнопка не захватывают первый gesture; release/cancel/lostcapture/Escape/unmount работают одинаково.
- Stale RAF от предыдущего gesture не сбрасывает framePending и не обновляет новый. Scheduler cancellation/token внутри existing interaction owner.
- Vue state публиковать при actual state change/один раз на frame; raw idle pointermove no-op. Не добавлять reactive writes на каждый pointer event.
- World mapping: offsets/container scroll/CSS scaling/zoom/pan; capture lifecycle и prevention policy touch/pen/desktop проверить в browser.
- Done: один pointerUp → один commit, cancel → ноль commits, stale frames harmless, no listener/capture leak; nonzero scroll и zoom 0.25/1/4 корректны.

## G10 — Render and viewport contract (DG-13,DG-17)

Файлы: renderer helpers, visible projection, text editor/viewport composables, examples.
- RED rotated node: helper geometry должна соответствовать real corners, а не растянутому AABB. AABB используется для culling, исходные bounds+rotation — для rendering.
- Cross-kind order: привести renderer/sample к ordered entities/IDs; mixed edges/shapes/nodes/text порядок одинаков для visual/hit test; offscreen selection union не переупорядочивает stack.
- Text baseline/bounds, multiline/font sizing — определить supported approximation, не обещать pixel-perfect без измерения шрифта.
- Editor external viewport ref/zoom changes, readonly text, delete edited entity, dispose/reopen; explicit edit lifecycle.
- Viewport: world bounds vs CSS size invariant, ResizeObserver zero-size/zoom, history policy для resize/pan, SSR без RAF/document.
- Done: browser screenshot/geometry assertions для rotation 0/45/90, world screen roundtrip, group resize и text overlay alignment.

## G11 — Benchmark integrity / package / docs (DG-16)

- Исправить bench waypoint API edgeId→id; каждый измеряемый command подтверждать changed/revision/final state. Отдельно no-op benchmarks.
- Заменить single-shot/FPS claims на repeated warmup+samples p50/p95/p99; разделить setup/index dirty vs warm query, core dispatch vs Vue/DOM/paint.
- Корректно измерять full interaction pipeline: setViewport→query→projection→paint, move→dependency invalidation→index→render, а не только caches.
- Проверить source vs dist coverage: общий alias map не содержит diagram, поэтому сделать источник unit tests явным и отдельный packed consumer gate без alias.
- docs/reference/diagram-packages.md: исправить waypoint example, z-order rendering recipe, capabilities promises и supported data limits. API migration и readonly ownership examples.
- Done: reproducible fixtures sparse/dense/metadata-heavy/edge-heavy, output assertions, CI artifact format, packed Node24/Vite/Vue/types smoke.

## G12 — Финальная приёмка (все DG)

- Commands: pnpm --filter '@affino/diagram-*' test; pnpm --filter '@affino/diagram-*' build; pnpm --filter @affino/diagram-core bench; new perf gates после калибровки; git diff --check.
- Workloads: 1k/5k/10k/50k entities с фиксированным viewport и varying visible count; metadata size/deep payloads; dense clusters, long edges, repeated replace/undo/redo, multi-selection.
- Browser: drag/resize/rotate/pan/zoom/marquee/text edit/keyboard, rapid cancel/new gesture, pointer capture/touch, mixed z-order, overlays.
- Retention: repeated mount/dispose, caller-held old snapshots, bounded/unbounded history distinction, created/deleted IDs, resize observers, RAF callbacks.
- Оценивать p95/p99 и GC/frame stalls целевого renderer; budgets под реальные SLA и calibrated runner, не произвольные «16ms всегда».
- Done: P1 закрыты, perf counters доказывают локальность, browser assertions выполнены на Node24 pipeline, documented workload envelope. Без browser/bench evidence план остаётся open.

## Журнал

2026-09-19: аудит, baseline diagram core 25 tests и Vue 15 tests, builds passed, direct Node ESM import обоих dist успешен на Node 24. Закрыты G01/G02/G04: replacement publishes old+new IDs включая empty scene, input entities owned at boundary, history state committed before publication, locked text и limit=0 guards. G03/G09 продвинуты: unique gesture history keys, cancel resets tool, stale frame callbacks ignored, coalesced history patches flatten steps вместо nested closure chains; long gesture regression покрыт 1000 updates, bounded history policy остаётся отдельным решением. G05 продвинут: readonly snapshot entity values переиспользуются по identity через WeakMap cache; добавлен regression на unchanged entity sharing, но полноценная incremental snapshot benchmark validation остаётся открытой. G06 начат: dependency index локализует node→port→edge invalidation и перестраивается только при topology/entity membership changes; основной node move больше не сканирует все edges/ports, focused regression сохранился. G07 продвинут: UniformGridIndex ограничивает cell expansion и делает bounded full-entry fallback для huge/invalid rect, а render order index кешируется на revision между повторными spatial/hit queries. G08 продвинут: Vue visible projection использует core geometry cache, stable render entity wrappers для неизменной geometry и больше не делает duplicate initial refresh. G11 начат: benchmark и package docs используют публичное поле id для waypoint commands; waypoint benchmark теперь проверяет changed результат каждого edit/undo, Node24 smoke на 1k entities прошёл. Остальные acceptance gates остаются открыты: incremental indexes, rendering order, browser/perf/CI.
