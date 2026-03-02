# DataGrid Client Runtime Diagram

Updated: `2026-03-02`

Scope: client-side row model internals in `@affino/datagrid-core`.

## Runtime Map

```mermaid
flowchart TD
  API["DataGridApi / adapter calls"] --> CRM["createClientRowModel(...)"]

  CRM --> STATE["clientRowRuntimeStateStore"]
  CRM --> ORCH["clientRowProjectionOrchestrator"]
  CRM --> ENG["clientRowProjectionEngine"]

  CRM --> MUT["clientRowStateMutationsRuntime"]
  CRM --> ROWM["clientRowRowsMutationsRuntime"]
  CRM --> PATCH["clientRowPatchCoordinatorRuntime"]
  CRM --> SNAP["clientRowSnapshotRuntime"]
  CRM --> HANDLERS["clientRowProjectionHandlersRuntime"]

  PATCH --> PATCHRT["clientRowPatchRuntime + rowPatchAnalyzer"]
  HANDLERS --> BASIC["projection basic stages\nfilter/sort/paginate/visible"]
  HANDLERS --> GROUP["group stage runtime"]
  HANDLERS --> PIVOT["pivot stage runtime"]
  HANDLERS --> AGG["aggregate stage runtime"]

  GROUP --> TREE["treeProjectionRuntime"]
  GROUP --> AGGENG["aggregationEngine"]
  AGG --> AGGENG
  AGG --> INC["incrementalAggregationRuntime"]

  CRM --> EXP["clientRowExpansionRuntime"]
  CRM --> DRILL["clientRowPivotDrilldownRuntime"]

  ENG --> ORCH
  ORCH --> HANDLERS
  SNAP --> STATE
```

## Ownership Boundaries

- `clientRowModel.ts`: composition root, lifecycle wiring, and public model API.
- `clientRowProjectionHandlersRuntime.ts`: stage-handler assembly + stage finalization policy.
- `clientRowPatchCoordinatorRuntime.ts`: orchestration for patch path only.
- `treeProjectionRuntime.ts` / `pivotRuntime.ts`: heavy projection subsystems.
- `incrementalAggregationRuntime.ts`: delta application path for group/tree aggregation.

## Intent

The split is not for abstraction count.  
It keeps the core orchestration readable while preserving deterministic projection behavior and patch performance paths.

