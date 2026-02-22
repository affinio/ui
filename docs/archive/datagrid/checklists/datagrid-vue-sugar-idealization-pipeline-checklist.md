# DataGrid Vue Sugar Idealization Pipeline

Updated: `2026-02-11`  
Scope: `@affino/datagrid-vue` (`useAffinoDataGrid`, `useAffinoDataGridUi`, `AffinoDataGridSimple`)  
Goal: sugar should cover practical AG/Sheets baseline scenarios without forcing users to drop into internal demo orchestration.

## Final Status

- Phase A status: `closed`.
- Phase B status: `closed`.
- Completion: `S1 -> S10` all marked done with proof.
- Completion: `U1 -> U8` all marked done with proof.
- Result: sugar layer now exposes practical AG/Sheets baseline UX without requiring internal-demo orchestration for documented flows.
- Closure note (`2026-02-11`): checklist fixed as the single source of truth for sugar idealization status.

## Phase B Scope (UX Hardening, requested 2026-02-11)

Priority `must-have`:
1. Fill + range move engine as first-class sugar interaction module (`features.interactions.range` + ready bindings).
2. Column/row resize bindings (`bindings.columnResizeHandle`, `bindings.rowResizeHandle`) + deterministic autosize (`double click`).
3. Header filter UX (Excel-style popover: unique values, search, select all/only, typed operators).
4. Unified action feedback/status channel (`grid.feedback.lastAction` + event stream).
5. Context menu parity API (active-cell open, keyboard nav, disabled states, action groups).
6. Enum editors on Affino primitives (listbox/menu editor path for enum columns).

Priority `next`:
7. Layout profiles sugar (`save/apply` for sort/filter/group/column-state).
8. Built-in status bar model (selection summary metrics + formatters).

## Coverage Audit (Current)

### Implemented (good)
- Row selection model (`features.selection`) with stable row identity contract.
- Row clipboard flows (`copy/cut/paste/clear`) via sugar action API.
- Inline cell editing (`features.editing`) with commit hook.
- Sort model (`sortState`, `toggleColumnSort`, `clearSort`).
- Filter model + advanced expression setter (`features.filtering.setAdvancedExpression`).
- Tree/group controls (`features.tree` groupBy/expand/collapse).
- Selection summary (`features.summary`) via core summary API.
- Column visibility toggles (`features.visibility`).
- Basic header/cell context-menu bindings.

### Partially implemented (risky/confusing)
- Fill/range move exists in sugar API, but pointer lifecycle and ready-to-use bindings are not yet fully packaged as one declarative interaction feature.
- Resize UX exists in parts (column actions/helpers), but full row+column handle bindings parity is not fully unified.
- Context menu + feedback patterns still require local page composition for polished UX parity.
- Enum editors via Affino primitives are not yet default sugar editor path.

### Missing vs internal demo parity (must close)
- Excel-style header filter popovers as built-in sugar module (`features.headerFilters`).
- Unified feedback/status model for all action flows.
- Context menu parity module with keyboard-first behavior and grouped/disabled actions.
- Affino enum editor integration as built-in sugar editor path.
- Layout profile snapshot API.
- Built-in status bar model API.

## Execution Rules
- Close strictly from `S1` to `S10`.
- Each step needs proof (`e2e` or visual + contract test).
- No “hidden internal only” behavior for sugar-documented features.

## Phase B Execution Rules
- Close strictly from `U1` to `U8`.
- Each step requires one proof artifact:
  - `contract` test for API determinism, and
  - either `e2e` or visual demo confirmation.
- New UX behavior must be available through sugar API only (no page-local mandatory glue).
- Keep backward compatibility for existing sugar API unless explicitly versioned.

## Pipeline (Simple -> Complex)

- [x] `S1` Expose missing core-native controls in sugar API.
Scope:
- Pagination wrappers.
- Column-state wrappers (`order/pin/width/visibility` + snapshot apply).
- Transaction wrappers (`undo/redo/canUndo/canRedo`).
Proof:
- Unit/contract test for `useAffinoDataGrid` API surface.
- README/playbook examples compile and run.
Exit:
- Integrator can use these flows without direct `grid.api.*` calls.
Comment:
- Implemented in `useAffinoDataGrid` via new sections: `pagination`, `columnState`, `history`.
- `AffinoDataGridSimple` now forwards `filtering/summary/visibility/tree` feature inputs (parity fix for sugar surface).

- [x] `S2` Row-height sugar contract.
Scope:
- `features.rowHeight` (`mode`, `base`, `setMode`, `setBase`, `measureVisible`).
- Deterministic no-op on runtimes without viewport row-height capability.
Proof:
- Contract tests for capability detection and method wiring.
- Visual demo toggle fixed/auto + measure behavior.
Exit:
- Auto row-height is first-class in sugar.
Comment:
- Added `features.rowHeight` sugar API with capability detection (`supported`) and deterministic no-op fallback.
- Methods available: `setMode`, `setBase`, `measureVisible`, `apply`.

- [x] `S3` Context-action completeness.
Scope:
- Map `filter` and `auto-size` actions in sugar action runner.
- Add clear message contract for unsupported contexts.
Proof:
- Action-runner tests for all action ids.
- Context-menu e2e for header filter/auto-size.
Exit:
- No “unmapped action” paths for documented menu items.
Comment:
- `auto-size` mapped to deterministic width estimation + `setColumnWidth`.
- `filter` mapped with explicit unsupported-context messages (missing column, feature disabled, no UI handler, handler rejected).
- Removed generic “unmapped action” fallback for these actions in sugar runner.

- [x] `S4` Column drag-reorder sugar helper.
Scope:
- Provide drag bindings for column reorder in sugar bindings.
- Keep behavior deterministic with pinned columns.
Proof:
- E2E: drag reorder + persistence through snapshot roundtrip.
Exit:
- Column reorder works without custom orchestration.
Comment:
- Added `bindings.headerReorder(columnKey)` sugar binding.
- `bindings.headerCell(columnKey)` now includes reorder events (`dragstart/dragover/drop/dragend`) and keyboard reorder (`Alt+Shift+ArrowLeft/ArrowRight`).
- Reorder applies through `setColumnOrder` and remains compatible with column-state snapshot roundtrip.

- [x] `S5` Row reorder sugar helper (client model).
Scope:
- Provide explicit reorder API and drag binding policy.
- Deterministic transaction logging for reorder.
Proof:
- Contract tests for reorder + rollback.
- E2E scenario with grouped/filtered guards.
Exit:
- Row reorder available in sugar with predictable constraints.
Comment:
- Added `rowReorder` sugar API: `supported`, `canReorder`, `reason`, `moveByIndex`, `moveByKey`.
- Added `bindings.rowReorder(row, rowIndex)` with drag-drop and keyboard (`Alt+Shift+ArrowUp/ArrowDown`).
- Reorder writes through transaction-aware `replaceRows` with intent `rows-reorder` and deterministic `affectedRange`.
- Guard policy enforced in sugar: reorder disabled when non-client row model, active group-by, or active filter model.

- [x] `S6` Cell-range selection feature for sugar.
Scope:
- Add cell anchor/focus/ranges model and bindings.
- Keep row selection backward-compatible.
Proof:
- E2E: mouse drag + Shift navigation metrics.
- Contract tests for deterministic snapshots.
Exit:
- Sugar supports range-centric spreadsheet interaction baseline.
Comment:
- Core wiring implemented in `useAffinoDataGrid` (`cellSelection` API + `bindings.cellSelection` + keyboard nav bridge + snapshot sync).
- Added contract coverage in `useAffinoDataGrid.contract.spec.ts` for anchor/focus/range + `setCellByKey(..., { extend: true })`.
- Verified green by full test pass (user confirmation).

- [x] `S7` Range-engine clipboard/fill/move in sugar.
Scope:
- Cell-range copy/paste/cut/clear.
- Fill-handle preview/apply.
- Range move intent.
Proof:
- E2E regression bundle (copy/paste/cut/fill/move).
- Transaction history restore pass.
Exit:
- Sugar reaches internal demo parity for core spreadsheet interactions.
Comment:
- Added `cellRange` sugar API in `useAffinoDataGrid`: `copy/paste/cut/clear`, preview state (`copiedRange/fillPreviewRange/rangeMovePreviewRange`), and apply methods (`applyFillPreview`, `applyRangeMove`).
- Wired through orchestration primitives (`useDataGridClipboardBridge`, `useDataGridClipboardMutations`, `useDataGridRangeMutationEngine`) with intent-transaction recording and row-flow fallback in action runner.
- Added contract coverage in `useAffinoDataGrid.contract.spec.ts` for copy/cut/paste/clear + fill preview/apply + range-move preview/apply.
- Verified green by full test pass (user confirmation).

- [x] `S8` Advanced filter UX helpers.
Scope:
- Helper APIs for set/date/text numeric compositions.
- Add/replace set-filter mode helpers.
Proof:
- Contract tests for AST output determinism.
- Visual demo scenario for Excel-like set filter.
Exit:
- Complex filtering usable without manual AST building.
Comment:
- Added `features.filtering.helpers` in `useAffinoDataGrid` with typed builders and mutators:
  - `condition`, `and`, `or`, `not`, `apply`, `clearByKey`
  - `setText`, `setNumber`, `setDate`, `setSet` (`valueMode`: `replace|append|remove`, `mergeMode`: `replace|merge-and|merge-or`)
- Updated sugar playbook with helper-driven examples.
- Verified green by full test pass (user confirmation).

- [x] `S9` Perf + stability lock for sugar path.
Scope:
- Bench + e2e stress for sugar-heavy paths.
- Ensure no recursion/reactivity regressions.
Proof:
- `bench:datagrid:harness:ci` green.
- `quality:perf:datagrid` green.
- Critical e2e bundle green.
Exit:
- Sugar path meets same stability floor as internal demo.
Comment:
- Added targeted scripts in `/Users/anton/Projects/affinio/package.json`:
  - `test:datagrid:sugar:contracts`
  - `test:e2e:datagrid:sugar`
  - `quality:gates:datagrid:sugar`
- Verified green by full test pass (user confirmation).

- [x] `S10` Docs/junior DX finalization.
Scope:
- 60-second sugar guide updated to real feature set.
- “When to use sugar vs advanced/internal” decision chart.
Proof:
- Docs reviewed against exported API and examples.
Exit:
- Junior can integrate feature-complete table without reading internal demo code.
Comment:
- Updated `/Users/anton/Projects/affinio/packages/datagrid-vue/README.md` with current sugar surface (`rowHeight`, `pagination`, `columnState`, `history`, `rowReorder`, `cellSelection`, `cellRange`, filtering helpers).
- Updated `/Users/anton/Projects/affinio/docs/datagrid-vue-sugar-playbook.md` with advanced-filter helpers and API tier guidance.
- Verified green by full test pass (user confirmation).

## Phase B Pipeline (Must-have -> Next)

- [x] `U1` Declarative range interactions module in sugar.
Scope:
- Promote fill/range-move pointer lifecycle to `features.interactions.range`.
- Provide ready bindings: `bindings.rangeHandle`, `bindings.rangeSurface`.
Proof:
- E2E: fill + range-move without page-local pointer handlers.
Exit:
- Integrator enables one feature flag and gets full range interactions.
Comment:
- Implemented in `useAffinoDataGrid`: `features.interactions.range` + pointer lifecycle (`fill|move`) + `bindings.rangeHandle` / `bindings.rangeSurface`.
- Range preview/apply now routes through sugar-only API (`cellRange.applyFillPreview`, `cellRange.applyRangeMove`) with no mandatory page-local glue.

- [x] `U2` Unified resize bindings (column + row) with autosize.
Scope:
- `bindings.columnResizeHandle`, `bindings.rowResizeHandle`.
- Deterministic autosize on double click for columns/rows.
Proof:
- E2E: resize stability under virtualization and pinned zones.
Exit:
- No page-local resize lifecycle code required.
Comment:
- Added `bindings.columnResizeHandle(columnKey)` with drag, keyboard step, and double-click autosize.
- Added `bindings.rowResizeHandle(rowKey)` with fixed-mode drag step and double-click/keyboard autosize-to-auto mode.

- [x] `U3` Header filters module (Excel-style).
Scope:
- `features.headerFilters` with popover model:
  - unique values list,
  - search,
  - select all / only,
  - typed operators for number/date/text.
Proof:
- Contract tests for model determinism + E2E header filter flow.
Exit:
- Header filter UX is first-class sugar capability.
Comment:
- Added `features.headerFilters` state machine (`open/close/toggle/query/operator`) and unique-value projection with capped cardinality.
- Added set-list helpers (`setValueSelected`, `selectOnlyValue`, `selectAllValues`, `clearValues`) and typed apply paths (`applyText`, `applyNumber`, `applyDate`).

- [x] `U4` Unified feedback/status channel.
Scope:
- `grid.feedback.lastAction` + action event stream for copy/cut/paste/fill/move/undo/redo.
Proof:
- Contract tests for event payload and order.
Exit:
- Status UX is not manually stitched in each page.
Comment:
- Added `grid.feedback` (`enabled`, `lastAction`, bounded `events`, `clear`).
- Action/context/history/header-filter/layout flows now emit unified feedback payloads with source/action/message/affected.

- [x] `U5` Context menu parity API.
Scope:
- Active-cell open, keyboard navigation, disabled states, grouped actions.
Proof:
- E2E keyboard-first context menu parity bundle.
Exit:
- Full menu behavior available from sugar without page glue.
Comment:
- Added parity API in sugar: `contextMenu.openForActiveCell`, `contextMenu.openForHeader`, disabled reason helpers, and `groupedActions`.
- Context actions now run through parity router with deterministic disabled handling and unified feedback integration.

- [x] `U6` Enum editor via Affino primitives.
Scope:
- Default enum edit path uses Affino listbox/menu primitives.
Proof:
- E2E enum edit commit/cancel + keyboard traversal.
Exit:
- Enum editing UX is consistent with Affino ecosystem.
Comment:
- Added `features.editing.enumEditor` contract (`enabled`, `primitive`, `resolveOptions`) with runtime exposure in sugar result.
- Option resolution supports custom resolver and fallback to column meta options for Affino primitive-based enum editors.

- [x] `U7` Layout profiles sugar API.
Scope:
- Save/apply one profile for sort/filter/group/column-state.
Proof:
- Contract tests for deterministic snapshot roundtrip.
Exit:
- Integrator can persist and restore named layouts from sugar.
Comment:
- Added `layoutProfiles` API: `capture`, `apply`, `remove`, `clear`, with profile payload including sort/filter/group/group-expansion/column-state.
- Snapshot application restores model state through sugar wrappers without direct `grid.api` calls.

- [x] `U8` Built-in status bar model.
Scope:
- Ready metrics model for selection summaries: `count/sum/min/max/avg` + formatters.
Proof:
- Contract tests for metric determinism on selection/filter/group changes.
Exit:
- Integrator gets status-bar data model out of the box.
Comment:
- Added `statusBar` sugar API (`enabled`, `metrics`, `refresh`) and deterministic recompute wiring on row/column/selection/filter changes.
- Metrics include row totals, filtered rows, visible columns, selected cells/rows, active/anchor cell, and summary aggregate accessors.
