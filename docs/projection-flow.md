# DataGrid Projection Flow

Updated: `2026-03-02`

Scope: projection pipeline execution in client row model.

## Stage Graph

```mermaid
flowchart LR
  F["filter"] --> S["sort"] --> G["group"] --> P["pivot"] --> A["aggregate"] --> PG["paginate"] --> V["visible"]
```

Source: `packages/datagrid-core/src/models/projectionStages.ts`.

## Recompute Entry Points

1. `recomputeFromStage(stage)`  
Used by model mutations (`setSortModel`, `setFilterModel`, `setRows`, etc.).

2. `recomputeWithExecutionPlan(plan)`  
Used by `patchRows` orchestration. The plan comes from `rowPatchAnalyzer`.

3. `refresh()`  
Requests a projection refresh pass and recomputes with current dirty state.

## Execution Semantics

- The engine tracks `requested` vs `computed` revisions per stage.
- Stage execution is `dirty`-driven, with explicit `blockedStages` support.
- A stage can run with `shouldRecompute=false` for identity patching only.
- `finalizeProjectionRecompute(meta)` commits one cycle and updates revision diagnostics.

## Stage Responsibilities

| Stage | Primary Input | Output |
| --- | --- | --- |
| `filter` | `sourceRows`, predicate | `filteredRowsProjection` + `filteredRowIds` |
| `sort` | filtered/source rows + sort model | `sortedRowsProjection` |
| `group` | sorted rows + group/tree config | `groupedRowsProjection` |
| `pivot` | grouped rows + pivot model | `pivotedRowsProjection` + `pivotColumns` |
| `aggregate` | grouped/pivoted rows + aggregation model | `aggregatedRowsProjection` |
| `paginate` | aggregated rows + pagination input | `paginatedRowsProjection` + normalized pagination |
| `visible` | paginated rows | runtime `rows` with display indexing |

## Cache & Identity Rules

- Sort and group value caches are stage-local and revision-aware.
- Tree cache invalidation is controlled by mutation analysis (not by stage handlers directly).
- Pivot/value incremental patches are applied in pivot stage before full rebuild fallback.
- `visible` stage is the last identity stabilization point consumed by UI adapters.

