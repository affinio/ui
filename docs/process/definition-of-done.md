# Definition of Done

Date: `2026-02-07`

A change is considered done only if all applicable criteria are met.

## Engineering

- Behavior implemented and verified locally.
- No unrelated changes in the same PR.
- Code follows package boundary contracts.

## Quality gates

- Unit/integration tests updated for changed behavior.
- `pnpm run check` passes.
- `pnpm run build` passes.
- E2E/perf checks run when change affects user flows or hot paths.

## Documentation

- README/docs-site updated for API/behavior changes.
- Changelog/release notes updated for releasable packages.
- Migration notes added for breaking/behavioral shifts.

## Release and ops

- Risk level documented in PR.
- Rollback path documented for medium/high risk changes.
