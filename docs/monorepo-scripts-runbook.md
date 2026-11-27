# Workspace Quality and Release Runbook

This document describes the scripts that exist in the current workspace. `package.json`, package manifests, and `.github/workflows/ci.yml` are the executable sources of truth.

## CI jobs

### `verify`

CI validates root script references and shared package policies, then runs lint, recursive type checks and builds, ESM artifact checks, and component benchmark evidence.

### `test-matrix`

- `unit`: recursive package tests (`pnpm run test:unit`).
- `visual`: Storybook visual tests and the Treeview browser smoke.
- `interaction`: component, Treeview, and Diagram browser acceptance (`pnpm run test:matrix:interaction`).

The interaction suite uses real Chromium interactions from `scripts/smoke-components-demo.mjs`, `scripts/smoke-treeview-demo.mjs`, `scripts/smoke-diagram-connectors.mjs`, and `scripts/accept-diagram-table.mjs`. The `quality:workspace:references` check ensures declared root scripts do not point at missing local files, tests, root scripts, or workspace packages.

There is no DataGrid workspace package or DataGrid release workflow in this repository. DataGrid-only scripts were intentionally removed in commit `d425a0e` when that tooling left this UI workspace. Root references that survived that removal were stale and have been removed; they are not replaced by no-op checks.

## Root commands

- `pnpm run lint`, `type-check`, `build`, `test`: recursive workspace operations.
- `pnpm run check`: lint, type-check, and tests.
- `pnpm run test:matrix:unit`: alias for all package tests.
- `pnpm run test:matrix:visual`: Storybook visual suite.
- `pnpm run test:matrix:interaction`: actual browser smoke and acceptance checks described above.
- `pnpm run test:diagram:browser`: connector/hierarchy and Table browser acceptance.
- `pnpm run quality:workspace:references`: verifies root script references.
- `pnpm run quality:deps:workspace-internal`: checks workspace dependency protocol usage.
- `pnpm run quality:metadata:packages`: checks package metadata.
- `pnpm run quality:components:esm`: checks built component ESM specifiers.
- `pnpm run bench:components:ci`: runs Treeview, Dialog, and Diagram benchmark evidence.
- `pnpm run quality:max`: comprehensive workspace gate: script references, shared policies, lint, type-check, build, tests, ESM validation, visual tests, browser interactions, benchmark evidence, and docs build.

## Script inventory and disposition

| Script family | Intended responsibility | Current implementation and references | Status | Action |
| --- | --- | --- | --- | --- |
| `lint`, `type-check`, `build`, `test` | Workspace checks | Recursive pnpm commands; used by CI and `quality:max` | ACTIVE | Retain |
| `quality:workspace:references` | Prevent stale root commands | `scripts/check-workspace-quality-references.mjs`; used by CI and `quality:max` | ACTIVE | Retain and extend with root-script changes |
| `quality:deps:workspace-internal`, `quality:metadata:packages` | Shared manifest policies | Existing checkers; used by CI, package release gate, and `quality:max` | ACTIVE | Retain |
| `quality:components:esm` | Validate built ESM import specifiers | `scripts/check-components-esm-specifiers.mjs`; used by CI and `quality:max` | ACTIVE | Retain |
| `test:matrix:visual` | Storybook browser/component checks | `@affino/visual-workbench`; used by CI and `quality:max` | ACTIVE | Retain |
| `test:matrix:interaction` | Production UI interaction acceptance | Existing browser smoke scripts; used by CI and `quality:max` | ACTIVE | Retain; do not route through empty root Playwright test discovery |
| `bench:components:ci` | Component performance evidence | Existing Treeview, Dialog, and Diagram benchmarks; used by CI and `quality:max` | ACTIVE | Retain |
| `quality:max` | Comprehensive workspace validation | `scripts/quality-max-pipeline.mjs`; local/release readiness command | ACTIVE | Now runs current workspace gates and reports all failures |
| `test:e2e`, `test:e2e:critical`, `test:e2e:datagrid:*`, `test:matrix:interaction`'s former Playwright/flakiness chain | Root Playwright test suite | Referenced `tests/e2e/*.spec.*`, but no root `tests/e2e` directory/configuration existed | OBSOLETE / MISCONFIGURED | Removed stale entry points; the old flake checker had no remaining consumer and was removed |
| `test:datagrid:*`, `quality:*:datagrid`, `release:commercial:*`, `bench:datagrid:*`, `codemod:datagrid:*` | DataGrid architecture, performance, browser, and commercial release gates | Their implementations were deliberately deleted in `d425a0e`; referenced packages are absent from `pnpm-workspace.yaml` resolution | OBSOLETE | Removed root aliases and documentation references; no placeholders restored |
| `quality:lock:datagrid*`, `bench:regression` | Aggregate DataGrid release locks | Depended on deleted gate scripts and benchmark harness | OBSOLETE | Removed; not used by current CI |
| `release:check:package` | Validate one independently publishable package | `scripts/check-package-release.mjs`; package tests/build, export targets, tarball contents, shared policies, optional required UI browser check | ACTIVE | Use for package-targeted publication readiness |

### Status meanings

- **ACTIVE**: implementation exists and has a current CI, workspace, or release consumer.
- **BROKEN**: an active consumer references missing or failing implementation.
- **OBSOLETE**: the owning package/system is no longer part of this workspace and there is no compatibility obligation.
- **DUPLICATED**: overlapping checks without a distinct contract.
- **MISCONFIGURED**: intended check exists but discovery or wiring is wrong.
- **MISSING IMPLEMENTATION**: active requirement has no implementation.

## Package release validation

Packages have independent manifests and can be packed or published individually. There is no automated publish workflow in this repository; publication is a maintainer action. Before publishing a public package, run its focused release gate:

```sh
pnpm run release:check:package -- @affino/diagram-core
pnpm run release:check:package -- @affino/diagram-vue --browser-script test:diagram:browser
```

The gate runs shared dependency and metadata policies, the selected package's declared tests and build, verifies exported files and declarations exist and are included in `npm pack --dry-run`, and runs the supplied focused browser gate for UI packages. UI packages require an explicit browser script so a package release does not implicitly run unrelated acceptance suites. A headless package does not require browser acceptance.

This package-targeted gate is separate from workspace health. `quality:max` intentionally runs broad workspace coverage; a package release should use the package gate plus any additional relevant integration acceptance explicitly called out by that package.

## Local and release workflows

Before a PR:

```sh
pnpm run quality:workspace:references
pnpm run quality:deps:workspace-internal
pnpm run quality:metadata:packages
pnpm run check
```

Before a package publication:

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm run release:check:package -- <workspace-package>`; supply `--browser-script <root-script>` for UI packages.
3. Review the package changelog, version, dependencies, and dry-run tarball.
4. Publish only through the maintainer-approved release process.

Documentation is maintained in `docs/` and package READMEs; this checkout has no generated `docs-site` workspace. Before a visual change, run `pnpm --filter @affino/visual-workbench build` and `pnpm run test:matrix:visual` as applicable.
