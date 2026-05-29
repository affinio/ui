# TreeView Performance Baseline

Status: initial baseline harness
Scope: `@affino/treeview-core`, `@affino/treeview-vue`

## Commands

Build the packages before running the benchmarks because the harnesses import built `dist` files.

```sh
pnpm --filter @affino/treeview-core build
pnpm --filter @affino/treeview-vue build
pnpm run bench:treeview:core
pnpm run bench:treeview:core:assert
pnpm run bench:treeview:vue:virtual
pnpm run bench:treeview:vue:virtual:assert
```

The package-level equivalents are:

```sh
pnpm --dir packages/treeview-core run bench
pnpm --dir packages/treeview-core run bench:assert
```

## Workloads

The core harness measures:

- balanced, wide, and deep replace registration, including deep-chain stack-safety coverage;
- 1% patch registration;
- no-op patch registration fast-path coverage;
- disabled-only patch registration without source topology rebuilds;
- expand/collapse burst;
- focus next/previous burst;
- active-only focus burst;
- active-only select burst;
- indexed focus next/previous over the visible projection, including active-only expanded snapshot reuse;
- full visible-array read;
- window read using `getVisibleWindow(start, end)`, with unit coverage for same-window cache reuse.

Each core workload reports p50, p95, p99, max elapsed time, heap delta, and, where available, emitted snapshot count, committed visible projection recomputes, projection version, navigation lookups, and legacy traversal-order read counters. Expand/collapse should keep traversal-order reads at 0 now that canonical expanded sorting uses the preorder index; normalization-only visible reads should not advance projection counters.

The Vue virtual harness uses a jsdom-mounted `useVirtualTreeviewController()` fixture and measures:

- scroll-window updates across a 10k default wide tree;
- rendered row min/max counts for the virtual window;
- blank viewport count;
- total elapsed time, per-sample scroll p50/p95/p99/max, and heap delta.

It is not a browser frame benchmark. It protects controller/render-window churn until a real route exists for Playwright frame timing.

## Budgets

`bench:treeview:core:assert` and `bench:treeview:vue:virtual:assert` use conservative smoke budgets for 10k nodes. They are intentionally loose until multi-run baselines stabilize.

Supported budget environment variables:

- `PERF_BUDGET_TOTAL_MS`
- `PERF_BUDGET_MAX_REGISTER_REPLACE_P95_MS`
- `PERF_BUDGET_MAX_REGISTER_PATCH_P95_MS`
- `PERF_BUDGET_MAX_EXPAND_COLLAPSE_P95_MS`
- `PERF_BUDGET_MAX_FOCUS_BURST_P95_MS`
- `PERF_BUDGET_MAX_SELECT_BURST_P95_MS`
- `PERF_BUDGET_MAX_VISIBLE_READ_P95_MS`
- `PERF_BUDGET_MAX_HEAP_DELTA_MB`
- `PERF_BUDGET_MAX_SCROLL_P95_MS` for the Vue virtual harness
- `PERF_BUDGET_MAX_BLANK_VIEWPORTS` for the Vue virtual harness

## Artifact

By default the benchmark writes:

```text
artifacts/performance/bench-treeview-core.json
artifacts/performance/bench-treeview-vue-virtual.json
```

Override with `BENCH_OUTPUT_JSON=/path/to/report.json` when collecting matrix runs.
