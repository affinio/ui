# TreeView Core Performance Baseline

Status: initial baseline harness
Scope: `@affino/treeview-core`

## Commands

Build the package before running the benchmark because the harness imports `packages/treeview-core/dist/index.js`.

```sh
pnpm --filter @affino/treeview-core build
pnpm run bench:treeview:core
pnpm run bench:treeview:core:assert
```

The package-level equivalents are:

```sh
pnpm --dir packages/treeview-core run bench
pnpm --dir packages/treeview-core run bench:assert
```

## Workloads

The initial harness measures:

- balanced, wide, and deep replace registration;
- 1% patch registration;
- expand/collapse burst;
- focus next/previous burst;
- active-only focus burst;
- active-only select burst;
- full visible-array read;
- placeholder window read using `getVisibleValues().slice(...)` until the Slice 5 window API exists.

Each workload reports p50, p95, p99, max elapsed time, heap delta, and, where available, emitted snapshot count plus visible/traversal recompute counters.

## Budgets

`bench:treeview:core:assert` uses conservative smoke budgets for 10k nodes. They are intentionally loose until multi-run baselines stabilize.

Supported budget environment variables:

- `PERF_BUDGET_TOTAL_MS`
- `PERF_BUDGET_MAX_REGISTER_REPLACE_P95_MS`
- `PERF_BUDGET_MAX_REGISTER_PATCH_P95_MS`
- `PERF_BUDGET_MAX_EXPAND_COLLAPSE_P95_MS`
- `PERF_BUDGET_MAX_FOCUS_BURST_P95_MS`
- `PERF_BUDGET_MAX_SELECT_BURST_P95_MS`
- `PERF_BUDGET_MAX_VISIBLE_READ_P95_MS`
- `PERF_BUDGET_MAX_HEAP_DELTA_MB`

## Artifact

By default the benchmark writes:

```text
artifacts/performance/bench-treeview-core.json
```

Override with `BENCH_OUTPUT_JSON=/path/to/report.json` when collecting matrix runs.
