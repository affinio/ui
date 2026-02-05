# Vue Packages Post-Optimization Report

Date: 2026-02-05

Baseline source: `docs/vue-baseline-report.md`  
Current benchmark source: `scripts/bench-vue-adapters.mjs`

## Commands

- `pnpm run bench:vue-adapters`
- `pnpm run bench:vue-adapters:assert`
- `pnpm --filter @affino/tooltip-vue test`
- `pnpm --filter @affino/popover-vue test`

## Budget Status

`bench:vue-adapters:assert` passed with budgets:

- `PERF_BUDGET_TOTAL_MS=1200`
- `PERF_BUDGET_MAX_BOOTSTRAP_MS=8`
- `PERF_BUDGET_MAX_CONTROLLER_MS=30`
- `PERF_BUDGET_MAX_RELAYOUT_MS=6`

No package exceeded configured budget thresholds.

## Baseline vs Current (Synthetic)

| package | bootstrapMs (baseline) | bootstrapMs (current) | controllerChurnMs (baseline) | controllerChurnMs (current) | relayoutMs (baseline) | relayoutMs (current) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dialog-vue | 7.42 | 3.49 | 1.03 | 0.60 | 3.24 | 1.24 |
| menu-vue | 1.14 | 1.18 | 0.40 | 0.53 | 0.44 | 0.50 |
| popover-vue | 0.77 | 0.76 | 0.09 | 0.39 | 0.17 | 0.17 |
| tooltip-vue | 0.70 | 0.70 | 0.08 | 0.07 | 0.17 | 0.16 |
| selection-vue | 0.77 | 0.97 | 0.44 | 0.44 | 0.00 | 0.00 |
| grid-selection-vue | 1.00 | 0.59 | 0.63 | 0.35 | 0.00 | 0.00 |

## Notes

- Surface adapters now support centralized, opt-in relayout instrumentation in `@affino/overlay-host`.
- `popover-vue` and `tooltip-vue` publish relayout counters by source key (`popover-vue`, `tooltip-vue`) when diagnostics are enabled.
- Runtime behavior remains unchanged in production unless instrumentation is explicitly enabled.
