# Monorepo Scripts Runbook

This file is the operational index for root `package.json` scripts in the Affino monorepo.

Goals:

- show what scripts do
- show which scripts are used in CI
- show what to run locally before PR / release
- reduce tribal knowledge and manual script hunting

Sources of truth:

- root scripts: `/Users/anton/Projects/affinio/package.json`
- CI usage: `/Users/anton/Projects/affinio/.github/workflows/ci.yml`

## Conventions

- `test:*` = tests and test bundles
- `quality:*` = deterministic gates / policy checks
- `bench:*` = benchmarks (some are gating, some are exploratory)
- `fix:*` = safe policy auto-fixers
- `changeset*` = release metadata workflow

## CI Map (Current)

### `verify` job

- `pnpm install --frozen-lockfile`
- `pnpm run lint`
- package type-checks (custom filtered recursive command in CI job)
- package builds (custom filtered recursive command in CI job)

Notes:

- CI intentionally excludes `@affino/datagrid-core` and `@affino/datagrid-vue` from generic recursive type-check/build in this job because they are covered by stricter datagrid-specific jobs/gates.

### `test-matrix` job

`unit` suite:

- package tests via custom filtered recursive `test:unit`

`integration` suite:

- package integration tests via custom filtered recursive `test:integration`

`interaction` suite:

- `pnpm run test:matrix:interaction`
  - runs full Playwright suite (`test:e2e`)
  - runs flake checker (`scripts/check-playwright-flakes.mjs`)

`visual` suite:

- `pnpm run test:matrix:visual`

### `quality-gates` job (datagrid parity lock)

- `pnpm run quality:lock:datagrid:parity`

This is the heavy datagrid gate and includes:

- architecture acceptance
- docs framework-track checks
- perf contract checks
- strict contracts
- critical e2e
- tree gates
- benchmark regression harness
- datagrid parity e2e

### `docs` job

- `pnpm run docs:build`
- `pnpm --filter @affino/visual-workbench build`

### `changeset` job

- `pnpm run changeset:status`

## Root Script Catalog (What To Run)

## 1. Base Workspace Ops

- `pnpm run bootstrap`
  - Repository bootstrap helper (`scripts/bootstrap.mjs`)
- `pnpm run build`
  - Recursive build for all workspaces with `build` script
- `pnpm run type-check`
  - Recursive type-check for all workspaces with `type-check`
- `pnpm run lint`
  - Recursive lint for all workspaces with `lint`
- `pnpm run format`
  - Recursive formatting for all workspaces with `format`
- `pnpm run test`
  - Recursive tests for all workspaces with `test`
- `pnpm run check`
  - Local “basic confidence” chain: `lint + type-check + test`

## 2. Test Bundles (Root)

- `pnpm run test:unit`
  - Recursive package-level unit tests
- `pnpm run test:vue-matrix`
  - Selected Vue adapter package tests
- `pnpm run test:e2e`
  - Full Playwright suite
- `pnpm run test:e2e:critical`
  - Critical Playwright subset used in datagrid quality gates
- `pnpm run test:matrix:interaction`
  - Full e2e + flake gate wrapper (used in CI interaction suite)
- `pnpm run test:matrix:visual`
  - Visual regression suite (storybook runner)

## 3. Datagrid-Specific Tests

- `pnpm run test:datagrid:unit`
- `pnpm run test:datagrid:integration`
- `pnpm run test:datagrid:contracts`
- `pnpm run test:datagrid:sugar:contracts`
- `pnpm run test:datagrid:strict-contracts`
- `pnpm run test:datagrid:coverage`
- `pnpm run test:datagrid:regressions`
- `pnpm run test:datagrid:tree:contracts`
- `pnpm run test:e2e:datagrid:parity`
- `pnpm run test:e2e:datagrid:sugar`
- `pnpm run test:e2e:datagrid:tree`

Use these when changing datagrid core/adapters/runtime contracts.

## 4. Datagrid Quality Gates (Deterministic)

- `pnpm run quality:architecture:datagrid`
  - Architecture acceptance + docs framework-track policy checks
- `pnpm run quality:perf:datagrid`
  - Datagrid perf contracts checker
- `pnpm run quality:gates:datagrid`
  - Coverage + critical e2e + flake check
- `pnpm run quality:gates:datagrid:tree`
  - Tree contracts + tree e2e + tree perf gates
- `pnpm run quality:gates:datagrid:sugar`
  - Sugar contracts + sugar e2e
- `pnpm run quality:lock:datagrid`
  - Main datagrid quality lock (architecture + perf + contracts + gates)
- `pnpm run quality:lock:datagrid:parity`
  - Full parity lock (`quality:lock:datagrid` + bench regression + parity e2e)

## 5. Benchmarks

### Non-gating / exploratory

- `pnpm run bench:laravel-morph`
- `pnpm run bench:vue-adapters`
- `pnpm run bench:datagrid:interactions`
- `pnpm run bench:datagrid:rowmodels`
- `pnpm run bench:datagrid:datasource-churn`
- `pnpm run bench:datagrid:derived-cache`
- `pnpm run bench:datagrid:dependency-graph`
- `pnpm run bench:datagrid:tree`
- `pnpm run bench:datagrid:tree:ci-light`
- `pnpm run bench:datagrid:tree:stress`
- `pnpm run bench:datagrid:tree:matrix`
- `pnpm run bench:datagrid:harness`
- `pnpm run bench:datagrid:harness:ci`

### Gating variants (`:assert`)

- `pnpm run bench:laravel-morph:assert`
- `pnpm run bench:vue-adapters:assert`
- `pnpm run bench:datagrid:interactions:assert`
- `pnpm run bench:datagrid:rowmodels:assert`
- `pnpm run bench:datagrid:datasource-churn:assert`
- `pnpm run bench:datagrid:derived-cache:assert`
- `pnpm run bench:datagrid:dependency-graph:assert`
- `pnpm run bench:datagrid:tree:assert`
- `pnpm run bench:datagrid:tree:matrix:assert:ci`
- `pnpm run bench:datagrid:tree:matrix:assert:nightly`
- `pnpm run bench:datagrid:tree:matrix:assert`
- `pnpm run bench:datagrid:harness:ci:gate`
- `pnpm run bench:regression`

Rule of thumb:

- use non-assert variants while tuning
- use assert variants before merging/perf lock updates

## 6. Policy / Metadata / Repo Hygiene

- `pnpm run quality:deps:workspace-internal`
  - Verifies internal `@affino/*` deps use `workspace:` protocol in `dependencies`/`devDependencies`/`optionalDependencies`
- `pnpm run fix:deps:workspace-internal`
  - Auto-fixes those internal dependency specifiers to `workspace:^`
- `pnpm run quality:metadata:packages`
  - Verifies package npm metadata policy for `packages/*/package.json` (`description`, `repository`, `homepage`, `bugs`)
- `pnpm run fix:metadata:packages`
  - Auto-fixes package metadata links (`repository/homepage/bugs`)
- `pnpm run quality:docs:datagrid:framework-track`
  - Prevents datagrid Vue/Laravel docs from importing internal core/orchestration directly
- `pnpm run quality:facade:datagrid`
  - Datagrid facade coverage check (exports / demo usage / forbidden imports)
- `pnpm run quality:facade:datagrid:report`
  - Same as above, report mode

## 7. Release / Scaffolding / Migration Utilities

- `pnpm run changeset`
  - Create changeset entry for release notes/versioning
- `pnpm run changeset:status`
  - CI/PR check for changeset state
- `pnpm run scaffold:adapter-triad`
  - Scaffolds a core + framework adapter package triad
- `pnpm run codemod:datagrid:public-protocol`
  - Datagrid codemod utility for protocol migration
- `pnpm run quality:max`
  - Extended quality pipeline (heavy)

## Recommended Local Pipelines

## Before opening a PR (general changes)

1. `pnpm run quality:deps:workspace-internal`
2. `pnpm run quality:metadata:packages`
3. `pnpm run check`

If you changed docs-site / docs packaging:

4. `pnpm run docs:build`

## Before merging datagrid changes

1. `pnpm run quality:architecture:datagrid`
2. `pnpm run test:datagrid:strict-contracts`
3. `pnpm run quality:gates:datagrid`
4. `pnpm run quality:gates:datagrid:tree`
5. `pnpm run bench:regression` (or at least targeted `bench:*:assert`)

## Before publishing packages

1. `pnpm run quality:deps:workspace-internal`
2. `pnpm run quality:metadata:packages`
3. `pnpm install` (ensure lockfile is synced if dependency graph changed)
4. `pnpm run test:unit` (or package-targeted tests)
5. `pnpm --filter <package> build`
6. `pnpm --filter <package> pack` (verify published files, especially `dist/*.d.ts`)

## Before docs / visual deploy validation

1. `pnpm run docs:build`
2. `pnpm --filter @affino/visual-workbench build`
3. `pnpm run test:matrix:visual` (if visual diffs matter for the change)

## Maintenance Notes

- Prefer adding new policy checks under `quality:*` and auto-fixers under `fix:*`.
- If a script becomes part of CI, update this file in the same PR.
- If a root script is renamed, update:
  - `/Users/anton/Projects/affinio/package.json`
  - `/Users/anton/Projects/affinio/.github/workflows/ci.yml`
  - this file

