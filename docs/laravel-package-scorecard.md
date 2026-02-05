# Laravel Adapter Scorecard (Post-Phase 4)

Date: 2026-02-05
Checklist basis: `docs/laravel-adapter-checklist.md`

## Scores
| Package | Score |
|---|---:|
| `@affino/dialog-laravel` | 10/10 |
| `@affino/menu-laravel` | 10/10 |
| `@affino/popover-laravel` | 10/10 |
| `@affino/combobox-laravel` | 10/10 |
| `@affino/listbox-laravel` | 10/10 |
| `@affino/tooltip-laravel` | 10/10 |

## Validation Summary
- All adapters use guarded bootstrap and shared observer/livewire contracts.
- Rehydrate is structure-gated with regression coverage for text-only mutations.
- Cleanup/disconnect regressions are covered for all packages.
- Late Livewire load + navigation flows are covered in tests.
- Overlay scroll lock interop is covered by cross-package regression tests.

## Test Status
All six Laravel adapters currently pass package tests:
- `pnpm --filter @affino/dialog-laravel test`
- `pnpm --filter @affino/menu-laravel test`
- `pnpm --filter @affino/popover-laravel test`
- `pnpm --filter @affino/combobox-laravel test`
- `pnpm --filter @affino/listbox-laravel test`
- `pnpm --filter @affino/tooltip-laravel test`
