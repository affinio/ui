# Vue Packages Baseline Report (Synthetic)

Date: 2026-02-05
Source script: `scripts/bench-vue-adapters.mjs`
Command: `pnpm run bench:vue-adapters`

## Benchmark Parameters
- `ROOTS_PER_KIND=120`
- `CONTROLLER_ITERATIONS=2000`
- `RELAYOUT_ITERATIONS=1600`
- `BENCH_SEED=1337`

## Metrics Captured
- Bootstrap proxy cost per package:
  - `bootstrapMs`
- Controller lifecycle churn proxy:
  - `controllerChurnMs`
- Floating relayout proxy (surface packages):
  - `relayoutMs`

## Results
| package | roots | bootstrapMs | controllerChurnMs | relayoutMs |
|---|---:|---:|---:|---:|
| dialog-vue | 120 | 7.42 | 1.03 | 3.24 |
| menu-vue | 120 | 1.14 | 0.40 | 0.44 |
| popover-vue | 120 | 0.77 | 0.09 | 0.17 |
| tooltip-vue | 120 | 0.70 | 0.08 | 0.17 |
| selection-vue | 120 | 0.77 | 0.44 | 0.00 |
| grid-selection-vue | 120 | 1.00 | 0.63 | 0.00 |

Total elapsed: `39.57ms`

## Validation Snapshot
Current test status (all green):
- `pnpm --filter @affino/dialog-vue test`
- `pnpm --filter @affino/menu-vue test`
- `pnpm --filter @affino/popover-vue test`
- `pnpm --filter @affino/tooltip-vue test`
- `pnpm --filter @affino/selection-vue test`
- `pnpm --filter @affino/grid-selection-vue test`

## Notes
- This benchmark is synthetic and intended for directional tracking during refactors.
- `controllerChurnMs` and `relayoutMs` are proxy signals in jsdom, not browser-RUM equivalents.
- Re-run after each phase to track trend deltas.
