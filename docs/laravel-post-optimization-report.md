# Laravel Packages Post-Optimization Report (Synthetic)

Date: 2026-02-05
Source script: `scripts/bench-livewire-morph.mjs`
Commands:
- `pnpm run bench:laravel-morph`
- `pnpm run bench:laravel-morph:assert`

## Current Benchmark Parameters
- `ROOTS_PER_KIND=150`
- `ITERATIONS=800`
- `STRUCTURE_MUTATION_RATE=0.15`
- `BENCH_SEED=1337`

## Baseline vs Current
Baseline source: `docs/laravel-baseline-report.md`

| package | baseline hydrateRate | current hydrateRate | baseline bootstrapMs | current bootstrapMs | baseline openCloseMs | current openCloseMs |
|---|---:|---:|---:|---:|---:|---:|
| dialog | 19.8% | 12.1% | 8.93 | 8.72 | 1.30 | 2.46 |
| menu | 10.6% | 14.8% | 4.25 | 9.88 | 0.81 | 0.97 |
| popover | 11.6% | 14.1% | 3.36 | 3.59 | 0.80 | 1.29 |
| combobox | 12.3% | 16.5% | 3.08 | 3.27 | 0.87 | 1.51 |
| listbox | 15.4% | 14.0% | 2.78 | 2.85 | 0.74 | 1.04 |
| tooltip | 11.1% | 16.5% | 2.33 | 2.60 | 0.71 | 0.96 |
| tabs | n/a | 14.2% | n/a | 3.71 | n/a | 0.76 |
| disclosure | n/a | 14.9% | n/a | 2.41 | n/a | 0.58 |

Total elapsed:
- baseline: `1551.92ms`
- current: `2802.11ms`

## Budget Assertion Result
`pnpm run bench:laravel-morph:assert` failed with:
- `PERF_BUDGET_TOTAL_MS=3000`
- `PERF_BUDGET_MAX_HYDRATE_RATE_PCT=25`
- `PERF_BUDGET_MAX_BOOTSTRAP_MS=12`
- `PERF_BUDGET_MAX_OPEN_CLOSE_MS=2`

Failure:
- `tooltip`: `openCloseMs=2.53` exceeded `PERF_BUDGET_MAX_OPEN_CLOSE_MS=2.00`

Assert run total elapsed: `2230.37ms`

## Notes
- `tabs` and `disclosure` were added after the original baseline snapshot, so baseline values are marked as `n/a`.
- Synthetic jsdom runs remain noisy; compare trends using repeated runs and median values before tightening budgets.
