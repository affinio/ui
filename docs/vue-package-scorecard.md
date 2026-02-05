# Vue Adapter Scorecard (Affino Primitives)

Date: 2026-02-05
Checklist basis: `docs/vue-adapter-checklist.md`

## Scores
| Package | Score | Why not 10/10 yet |
|---|---:|---|
| `@affino/dialog-vue` | 10/10 | No open red flags after SSR/cleanup/export coverage and matrix validation. |
| `@affino/menu-vue` | 10/10 | Interop, pointer-regression, and relayout watcher behavior covered and validated. |
| `@affino/popover-vue` | 10/10 | Shared floating utilities, source-aware scroll lock, and edge-case tests are in place. |
| `@affino/tooltip-vue` | 10/10 | Shared floating pipeline + relayout instrumentation and stress tests are green. |
| `@affino/selection-vue` | 10/10 | SSR/no-scope, parity integration, and subscribe/unsubscribe safety confirmed. |
| `@affino/grid-selection-vue` | 10/10 | Matrix/range/sparse/perf churn scenarios covered and stable. |

## Ecosystem Score
`Vue adapters ecosystem: 10/10`

## Closed Bottlenecks
- Vue facade exists: `@affino/vue-adapter`.
- Shared floating relayout utilities are centralized in `@affino/overlay-host`.
- Dist test pollution is blocked by shared Vitest exclusion (`dist/**`).
- Overlay interop is validated via `@affino/vue-adapter` interop suite.
- Synthetic benchmark + budget assertions are in place for regression tracking.
- Pre/post optimization reporting is documented in `docs/vue-post-optimization-report.md`.

## Validation Snapshot
Current package test status (all green):
- `pnpm run test:vue-matrix`
- `pnpm run bench:vue-adapters:assert`
