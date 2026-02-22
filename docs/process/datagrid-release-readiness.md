# DataGrid Release Readiness

Date: `2026-02-07`
Scope: `@affino/datagrid-core`, `@affino/datagrid-vue`

## 1) Semver Strategy

Release contract (strict, including `0.x` line):

- `PATCH`: bug fix, perf fix, docs-only API clarifications, no public API break.
- `MINOR`: backward-compatible feature additions or new optional adapter behavior.
- `MAJOR`: any public API breaking change, behavioral break, contract change, or removal.

Coupling rules:

- Core breaking change requires coordinated Vue adapter release with explicit migration notes.
- Vue adapter peer dependency range changes are always at least `MINOR`, and `MAJOR` if integration breaks.
- No silent runtime contract changes without changeset and migration section.

## 2) Changeset and Release Notes Format

Changeset files are mandatory for releasable package changes.

Use template:
- `/Users/anton/Projects/affinio/.changeset/datagrid-template.md`

Required sections in each changeset body:

- `## Summary`
- `## User impact`
- `## Migration`
- `## Validation`

Release notes format per package:

1. What changed
2. Why it changed
3. Migration required (yes/no + exact steps)
4. Validation evidence (tests/gates/bench)

## 3) Compatibility Matrix

| Area | `@affino/datagrid-core` | `@affino/datagrid-vue` |
| --- | --- | --- |
| Node.js | `^20.19.0 || >=22.12.0` | `^20.19.0 || >=22.12.0` |
| Package manager | `pnpm@10.x` | `pnpm@10.x` |
| TypeScript | `^5.9.x` (repo baseline) | `^5.9.x` (repo baseline) |
| Vue | n/a | `^3.3.0` (peer) |
| Pinia | n/a | `^2.1.0 || ^3.0.0` (peer) |
| Browser validation | logic-level contracts | Chromium e2e in CI (`playwright`) |

Notes:

- Browser support policy is evergreen. No legacy browser target is declared.
- CI currently validates browser interaction on Chromium; additional engines can be added when product scope requires.

## 4) Stable Tag and Freeze Criteria

Stable tag policy (`datagrid stable candidate`):

Entry criteria:

- Checklist complete through item `12` in:
  `/Users/anton/Projects/affinio/docs/archive/datagrid/checklists/datagrid-engine-9.5-pipeline-checklist.md`
- Quality gates green on `main`:
  - `pnpm run quality:gates:datagrid`
  - `pnpm run test:matrix:unit`
  - `pnpm run test:matrix:integration`
- Performance gates green:
  - `pnpm run bench:datagrid:harness:ci`
- No open `P0/P1` incidents on overlay/pinned/virtualization paths.
- Migration and troubleshooting docs updated for release.

Freeze window:

- Minimum `72h` stabilization window on `main`.
- Only blocker fixes allowed during freeze.
- Any freeze fix requires changeset and explicit risk note.

Exit criteria (stable tag allowed):

- All entry criteria remain green through freeze.
- Release notes complete for both packages.
- Install smoke test passes on consumer demos.

## 5) Release Execution Checklist

1. Confirm entry criteria and freeze status.
2. Generate/apply changesets in release PR.
3. Verify CI quality/perf gates on release commit.
4. Publish packages.
5. Post-release smoke test and rollback readiness check.

## 6) Scroll Lifecycle Guardrails

For releases touching scroll pipeline primitives (`managed wheel`, `linked sync`, `idle gate`, `perf telemetry`, `ownership policy`):

1. Keep telemetry diagnostic-only by default:
  - no automatic runtime strategy switching based solely on telemetry snapshots.
2. Any adaptive behavior (overscan, buffer, throttling, virtualization strategy) requires:
  - explicit RFC,
  - benchmark evidence,
  - rollback plan,
  - dedicated contract coverage.
3. Preserve deterministic ownership semantics:
  - propagation policy must remain explicit and documented,
  - callback overrides must be tested against mode defaults.
4. Do not couple perf telemetry with core deterministic contracts:
  - orchestration/adapters may consume telemetry,
  - core runtime contracts remain telemetry-agnostic.
