# Diagram Table T5 Validation

This note records the finalization changes and validation run for the current graphical Table milestone. It describes current behavior, not a claim of complete cross-browser or vector-export equivalence.

## Layout cache and hit testing

`DiagramGeometryService` retains a resolved local layout for the current immutable Table snapshot, keyed by table ID and text measurement provider identity/revision. Each live table keeps at most four provider entries. Replacing a Table snapshot replaces that entry; deleting a Table evicts it. The cached layout is recursively frozen. Parent transforms, viewport changes, and selection changes do not replace the local Table snapshot. Provider revision changes resolve new text layout without changing the model.

`engine.getTableCellAt()` reuses the cached layout, converts world coordinates through the existing hierarchy utilities, and binary-searches cumulative row and column edges. Internal boundaries are owned by the following track; the outer maximum edge belongs to the last track. Covered positions map through the same resolved anchor matrix as visible-cell rendering.

## Text measurement

Core accepts `DiagramTextMeasurementProvider.measureText(text, resolvedStyle)` in document units. Metrics include width and line height, with optional ascent and descent. The provider's `revision` must change when fonts or its measurement behavior changes. Core owns wrapping, explicit newlines, alignment, line positions, clipping bounds, and overflow status.

The deterministic headless fallback uses estimated glyph advances (0.56 em for Latin code points, 1 em for other code points) and 1.2 em line height. It is reproducible, not typographically exact. Vue's `createCanvasTextMeasurementProvider()` measures with browser Canvas and increments its revision when the browser reports font loading changes. The renderer consumes Core-resolved lines and positions. Exporters should consume the same resolved layout and provide matching font inputs/metrics when typography equivalence is required; no PDF adapter is implemented here.

## Border operations

`setTableCellBorders` applies `all`, `outside`, `inside`, a selected side, `none`, or `reset` to an expanded logical-cell range in one command. An explicit hidden side suppresses the shared segment. When both adjacent cells define a boundary, the left or top owner's explicit setting wins; otherwise the right or bottom owner's explicit setting is used, then the table grid default. Physical shared segments resolve once. Covered internal edges are omitted. A merged anchor's explicit outer side is emitted only where its merged region meets the corresponding outside table edge. `none` stores explicit hidden sides; `reset` removes overrides and inherits table defaults.

Row and column style defaults remain deferred. Current inheritance is table defaults followed by cell overrides.

## Benchmark method and results

Run `pnpm --filter @affino/diagram-core build` then `node scripts/bench-diagram-table.mjs`. The script uses 35 samples per case, varied track sizes, styled cells, and regularly spaced 2×2 merges. Cached queries and cached hit tests average 100 operations per sample. Values are Core processing time in milliseconds, p50/p95/p99; browser rendering and automation are excluded.

| Table | Cold layout | Cached layout | Uncached hit query | Cached engine hit query | Resize preview | Resize commit | Style update | Insert + delete row | Serialize document |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10×10 | 0.164 / 0.352 / 0.439 | 0.000080 / 0.000207 / 0.000312 | 0.082 / 0.211 / 0.238 | 0.000289 / 0.001444 / 0.001974 | 0.007 / 0.057 / 0.654 | 0.002 / 0.134 / 0.273 | 0.162 / 0.441 / 0.470 | 0.297 / 0.651 / 0.669 | 0.025 / 0.043 / 0.113 |
| 50×20 | 0.853 / 1.866 / 2.147 | 0.000095 / 0.000156 / 0.000180 | 0.775 / 2.567 / 3.699 | 0.000299 / 0.001106 / 0.002880 | 0.005 / 0.013 / 0.035 | 0.691 / 0.752 / 1.538 | 1.152 / 2.117 / 2.858 | 1.890 / 3.189 / 3.288 | 0.235 / 0.256 / 0.261 |
| 100×50 | 4.234 / 6.957 / 11.210 | 0.000042 / 0.000043 / 0.000073 | 4.170 / 5.535 / 5.963 | 0.000273 / 0.000409 / 0.000417 | 0.005 / 0.007 / 0.045 | 3.688 / 7.442 / 29.694 | 7.861 / 9.916 / 10.148 | 9.771 / 11.268 / 11.483 | 1.112 / 1.281 / 1.302 |

The prior implementation report recorded 100×50 layout at 2.98 / 7.59 / 9.42 ms and hit testing p99 at 11.82 ms. The present expanded harness is not byte-for-byte the same as that historical run, so this is directional context rather than a controlled before/after claim. In the current run, cached engine hit testing is below 0.001 ms at p99. A cold 100×50 layout remains several milliseconds. `hitAfterInvalidation` also measured mutation dispatch and cache rebuild, so it is not a pure cache-rebuild timing; p50/p95/p99 were 21.270 / 23.608 / 24.750 ms. Cold 100×50 hit testing resolving layout each time measured 4.170 / 5.535 / 5.963 ms, which reinforces use of the cached engine query. Structural and style mutation costs grow with matrix size and are not optimized by layout caching; high p95/p99 values are sensitive to GC/runtime noise at only 35 samples.

## Browser verification

The reproducible script `node scripts/accept-diagram-table.mjs` drives Chromium against `/diagram/table` with actual pointer, keyboard, and inspector input. It loads Basic, Engineering Title Block, Revision, Nested Transformed, and 25×12 Stress fixtures. It passed rectangular/Shift/row/column selection, horizontal/vertical/2×2 merge and unmerge, content-conflict rejection, range borders and typography, fixed/flexible/exact sizing, fixed resize at zoom and after pan, asymmetric padding/background/all nine alignments/reset, wrapping/clipping, multiline Unicode commit/cancel, nested/root transformed selection/editing, track resizing, row/column insert/delete with history, and document save/restore plus post-restore editing. Artifacts are `artifacts/diagram-table/workbench-table.png`, `artifacts/diagram-table/workbench-title-block.png`, `artifacts/diagram-table/workbench-final.png`, and `artifacts/diagram-table/workbench-final-trace.zip`.

`node scripts/smoke-diagram-connectors.mjs` also passed all 48 connector browser checks in the integrated tree. The Core suite covers table rotation, group transforms, hierarchy-aware hit testing, resize preview/cancel, metadata, serialization, and history. The Vue component suite covers table rendering, merged editing bounds, pointer range interaction, and resize previews. The full T1–T4 browser matrix was not executed; see the completion report for the remaining browser scenarios.

### T1–T4 and integration scenario status

Statuses below combine direct Core/Vue evidence with the current browser script. `PASS` means the named behavior was asserted by that method. Browser acceptance beyond these exercised cases is `NOT RUN`, even when related unit coverage exists.

| Scenario | Status | Verification |
|---|---|---|
| T1-01 single-cell selection | PASS | Browser |
| T1-02 pointer rectangular range | PASS | Browser + Vue |
| T1-03 Shift range extension | PASS | Browser |
| T1-04 full row/column selection | PASS | Browser |
| T1-05 horizontal merge | PASS | Browser |
| T1-06 vertical merge | PASS | Browser |
| T1-07 rectangular merge | PASS | Browser + Core |
| T1-08 partial merged-range rejection | PASS | Core |
| T1-09 non-destructive content conflict | PASS | Core + Browser |
| T1-10 keep-anchor metadata policy | PASS | Core |
| T1-11 unmerge | PASS | Core + Browser |
| T1-12 insert row through merge | PASS | Core |
| T1-13 insert column through merge | PASS | Core |
| T1-14 delete merged anchor track | PASS | Core |
| T1-15 active logical-cell enumeration | PASS | Core |
| T1-16 topology undo/redo | PASS | Core + Browser |
| T2-01 default padding | PASS | Core + Browser screenshot |
| T2-02 individual padding | PASS | Core + Browser |
| T2-03 asymmetric padding | PASS | Core + Browser |
| T2-04 merged-cell padding | PASS | Core + Vue |
| T2-05 cell background | PASS | Browser |
| T2-06 range background | PASS | Core |
| T2-07 individual border sides | PASS | Core |
| T2-08 outside borders | PASS | Core + Browser |
| T2-09 inside borders | PASS | Core |
| T2-10 no borders | PASS | Core |
| T2-11 shared-border conflict resolution | PASS | Core |
| T2-12 merged internal-border suppression | PASS | Core + Vue |
| T2-13 individual typography | PASS | Core + Browser |
| T2-14 range typography | PASS | Core + Browser |
| T2-15 reset inherited appearance | PASS | Core + Browser |
| T2-16 appearance undo/redo | PASS | Core |
| T3-01 exact column width | PASS | Core + Browser |
| T3-02 exact row height | PASS | Core + Browser |
| T3-03 fractional dimensions | PASS | Core |
| T3-04 flexible column resize | PASS | Core + Browser |
| T3-05 flexible row resize | PASS | Core + Browser |
| T3-06 fixed column-boundary resize | PASS | Core + Browser |
| T3-07 fixed row-boundary resize | PASS | Core |
| T3-08 minimum track constraints | PASS | Core |
| T3-09 merged-region track resize | PASS | Core |
| T3-10 pointer resize preview | PASS | Core + Browser |
| T3-11 preview/commit equality | PASS | Core |
| T3-12 resize cancellation | PASS | Core |
| T3-13 exact overall width | PASS | Core + Browser |
| T3-14 exact overall height | PASS | Core |
| T3-15 resize under zoom and pan | PASS | Browser |
| T3-16 resize inside transformed group | PASS | Core |
| T3-17 repeated resize stability | PASS | Core, 100 fixed-resize cycles on fractional row/column tracks |
| T3-18 resize undo/redo | PASS | Core + Browser |
| T4-01 single-line text | PASS | Core + Browser |
| T4-02 multiline text | PASS | Core + Browser |
| T4-03 Unicode text | PASS | Core + Browser |
| T4-04 all nine alignments | PASS | Core + Browser |
| T4-05 merged-cell alignment | PASS | Core + Vue |
| T4-06 asymmetric-padding alignment | PASS | Core + Browser |
| T4-07 long-text clipping | PASS | Core + Vue |
| T4-08 wrapping | PASS | Core + Vue |
| T4-09 explicit newlines | PASS | Core + Browser |
| T4-10 height overflow | PASS | Core controlled-provider test |
| T4-11 edit commit | PASS | Browser |
| T4-12 edit cancel | PASS | Browser |
| T4-13 keyboard navigation | PASS | Vue |
| T4-14 edit merged logical cell | PASS | Vue |
| T4-15 edit transformed Table | PASS | Browser |
| T4-16 text edit preserves metadata | PASS | Core |
| T4-17 text edit undo/redo | PASS | Core + Browser |
| TI-01 serialize full styled Table | PASS | Core + Browser |
| TI-02 restore equivalent Table | PASS | Core + Browser |
| TI-03 duplicate identities | PASS | Core |
| TI-04 legacy Table load | PASS | Core |
| TI-05 nested retained hierarchy | PASS | Core |
| TI-06 rotated Table hit testing | PASS | Core + Browser |
| TI-07 reflected range selection | PASS | Browser, nested transformed fixture |
| TI-08 edit overlay under parent transform | PASS | Browser, nested transformed fixture |
| TI-09 headless API | PASS | Core |
| TI-10 invalid-operation atomicity | PASS | Core |
| TI-11 metadata visibility after merge | PASS | Core |
| TI-12 metadata and appearance after structural edits | PASS | Core |

Not all browser variants were repeated at every zoom, pan, transform, or style combination. In particular, full save/reload in a separately started page, shared-border visual conflict cases, and font fallback-versus-Canvas glyph comparisons remain browser `NOT RUN`; their relevant Core/Vue contracts are covered where listed above.

## Deferred and unavailable capabilities

- Row and column style defaults are deferred; table and cell/range styles are implemented.
- Ellipsis, auto-fit, automatic content-driven track growth, rich text, and spreadsheet behavior are deferred.
- Dynamic application text presentation overrides are not exposed as a distinct generic API. Applications can resolve text externally and issue cell-content updates; opaque metadata remains preserved.
- PDF/export integration is limited to headless resolved geometry and line layout. There is no PDF package dependency or typography parity claim.
- The Workbench provides representative generic table editing controls, not a complete production Inspector or exhaustive acceptance console.
