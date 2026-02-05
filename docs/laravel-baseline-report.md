# Laravel Packages Baseline Report (Synthetic)

Date: 2026-02-05
Source script: `scripts/bench-livewire-morph.mjs`
Command: `pnpm run bench:laravel-morph`

## Benchmark Parameters
- `ROOTS_PER_KIND=150`
- `ITERATIONS=800`
- `STRUCTURE_MUTATION_RATE=0.15`

## Metrics Captured
- Rehydrate trend under repeated DOM updates:
  - `scans`, `hydrated`, `skipped`, `hydrateRate`, `scanMs`, `hydrateMs`
- Average bootstrap proxy cost per package:
  - `bootstrapMs`
- Open/close latency proxy per package:
  - `openCloseMs`

## Results
| package | scans | hydrated | skipped | hydrateRate | scanMs | hydrateMs | bootstrapMs | openCloseMs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dialog | 126 | 25 | 101 | 19.8% | 2.52 | 5.52 | 8.93 | 1.30 |
| menu | 132 | 14 | 118 | 10.6% | 2.82 | 3.28 | 4.25 | 0.81 |
| popover | 146 | 17 | 129 | 11.6% | 3.05 | 2.65 | 3.36 | 0.80 |
| combobox | 138 | 17 | 121 | 12.3% | 3.04 | 2.35 | 3.08 | 0.87 |
| listbox | 123 | 19 | 104 | 15.4% | 2.61 | 2.22 | 2.78 | 0.74 |
| tooltip | 135 | 15 | 120 | 11.1% | 3.40 | 1.82 | 2.33 | 0.71 |

Total elapsed: `1551.92ms`

## Notes
- This is a temporary synthetic benchmark for mutation pressure and rehydrate gating trends.
- `bootstrapMs` and `openCloseMs` are proxy measurements in jsdom, useful for relative comparison during refactors.
- Re-run this script after each major phase to track directional improvements.
