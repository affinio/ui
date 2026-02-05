# Laravel Packages Post-Optimization Report (Synthetic)

Date: 2026-02-05
Source script: `scripts/bench-livewire-morph.mjs`
Commands:
- `pnpm run bench:laravel-morph`
- `pnpm run bench:laravel-morph:assert`

## Phase 4 Changes Applied
- Added dev-only adapter instrumentation in `@affino/overlay-kernel`:
  - `recordAdapterMetric(...)`
  - `getAdapterMetricsSnapshot()`
  - Observer/livewire/structure checkpoints now emit counters when `__affinoAdapterMetrics` is enabled.
- Added perf budget assertion mode in benchmark script with thresholds:
  - `PERF_BUDGET_TOTAL_MS`
  - `PERF_BUDGET_MAX_HYDRATE_RATE_PCT`
  - `PERF_BUDGET_MAX_BOOTSTRAP_MS`
  - `PERF_BUDGET_MAX_OPEN_CLOSE_MS`
- Added CI-friendly script:
  - `bench:laravel-morph:assert`

## Current Benchmark Parameters
- `ROOTS_PER_KIND=150`
- `ITERATIONS=800`
- `STRUCTURE_MUTATION_RATE=0.15`

## Baseline vs Current
Baseline source: `docs/laravel-baseline-report.md`

| package | baseline hydrateRate | current hydrateRate | baseline bootstrapMs | current bootstrapMs | baseline openCloseMs | current openCloseMs |
|---|---:|---:|---:|---:|---:|---:|
| dialog | 19.8% | 15.2% | 8.93 | 9.28 | 1.30 | 1.28 |
| menu | 10.6% | 17.5% | 4.25 | 3.60 | 0.81 | 0.82 |
| popover | 11.6% | 16.8% | 3.36 | 3.28 | 0.80 | 0.71 |
| combobox | 12.3% | 12.6% | 3.08 | 5.48 | 0.87 | 1.13 |
| listbox | 15.4% | 14.2% | 2.78 | 2.67 | 0.74 | 0.69 |
| tooltip | 11.1% | 11.6% | 2.33 | 2.81 | 0.71 | 0.66 |

Total elapsed:
- baseline: `1551.92ms`
- current: `1505.42ms`

## Budget Assertion Result
`pnpm run bench:laravel-morph:assert` passed with:
- `PERF_BUDGET_TOTAL_MS=2000`
- `PERF_BUDGET_MAX_HYDRATE_RATE_PCT=25`
- `PERF_BUDGET_MAX_BOOTSTRAP_MS=12`
- `PERF_BUDGET_MAX_OPEN_CLOSE_MS=2`

## Notes
- Synthetic jsdom benchmark remains noisy by run order and random mutation target selection.
- Directional result is positive on total elapsed and several package metrics; some package-level metrics regressed and should be profiled in a deterministic follow-up run (fixed seed + repeated samples).
