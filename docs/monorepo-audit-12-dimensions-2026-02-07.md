# Monorepo Audit (12 Dimensions)

Date: `2026-02-07`  
Repository: `affinio`  
Scope: static repository audit (architecture, tooling, CI/CD, security, DX, process).  
Method: evidence-based review of configs/scripts/workflows/docs/package manifests.

## Snapshot

- Workspace size: `39` packages under `packages/*`.
- Unit/integration tests discovered: `75` files in packages.
- E2E tests discovered: `12` Playwright specs.
- CI jobs: `verify`, `perf-assert`, `docs`, `e2e`, `changeset`.

## Scores (Worst -> Best)

| Dimension | Score (/10) | Status |
| --- | --- | --- |
| Processes and ownership | **4.5** | High risk |
| Security and supply chain | **4.9** | High risk |
| Reliability and operations | **5.1** | High risk |
| Build/orchestration in monorepo | **6.4** | Medium risk |
| Code quality and standards | **6.6** | Medium risk |
| DX (developer experience) | **6.8** | Medium risk |
| CI/CD and release process | **7.0** | Medium risk |
| Dependency management | **7.2** | Medium risk |
| Documentation and transparency | **8.0** | Good |
| Test strategy | **8.3** | Good |
| Performance | **8.6** | Good |
| Architecture and package boundaries | **8.8** | Good |

---

## Detailed Findings

### 1) Architecture and package boundaries — **8.8**

Strengths:
- Clear layered package model (`*-core`, `*-vue`, `*-laravel`, adapters).
- Public API discipline is strong: almost all packages define `exports`, `main`, `module`, `types`.
- No local dependency cycles found in workspace graph (`tsort` on internal `@affino/*` edges produced no cycle errors).
- Core packages do not depend on adapter packages (clean directionality).

Gaps:
- `sideEffects` is mostly unset in package manifests (tree-shaking intent is implicit, not explicit).
- Manual large alias map in `tsconfig.base.json` creates maintenance overhead and drift risk.

Evidence:
- `packages/*/package.json`
- `tsconfig.base.json`

### 2) Dependency management — **7.2**

Strengths:
- Consistent use of `workspace:*` for internal deps.
- Frozen lockfile in CI (`pnpm install --frozen-lockfile`).

Gaps:
- Version range drift for key frontend deps between workspaces (`vue`, `vite`, `tailwindcss`, `@tailwindcss/vite` in demo/docs/workspace manifests).
- Root `packageManager` field is missing, reducing determinism across developer environments.
- No automated dependency update workflow (Dependabot/Renovate absent).

Evidence:
- `package.json`
- `demo-vue/package.json`
- `demo-laravel/package.json`
- `docs-site/package.json`
- `.github/workflows/ci.yml`

### 3) Build and monorepo orchestration — **6.4**

Strengths:
- Unified workspace orchestration with pnpm.
- Build/test scripts are available in most packages.

Gaps:
- No Nx/Turbo/Bazel or affected-only execution; root scripts run recursive all-packages flows.
- No remote build cache strategy and no cache-hit observability.
- Workspace definition mismatch risk: root `workspaces` differs from `pnpm-workspace.yaml` (root omits `demo-laravel`).

Evidence:
- `package.json` (`build`, `test`, `lint`, `type-check` are recursive)
- `pnpm-workspace.yaml`

### 4) CI/CD and release process — **7.0**

Strengths:
- CI includes lint/type-check/test/build, perf budgets, docs build, and e2e.
- Lockfile install and pinned Node major (`20`) in CI.
- Changesets configured (`.changeset/config.json`) and per-package changelogs present.

Gaps:
- Changeset gate is present but commented out in CI (`changeset status` step disabled).
- No automated release workflow from changesets (publish/release orchestration not visible here).
- No preview environments per PR.
- No explicit semver policy enforcement checks in CI.

Evidence:
- `.github/workflows/ci.yml`
- `.changeset/config.json`
- `packages/*/CHANGELOG.md`

### 5) Test strategy — **8.3**

Strengths:
- Good breadth: unit/integration at package level + cross-surface e2e in `tests/e2e`.
- Integration/interop tests exist for adapters and kernels.
- Perf assertions are codified and run in CI.

Gaps:
- `4` packages have no tests (`@affino/aria-utils`, `@affino/focus-utils`, `@affino/overlay-host`, `@affino/visual-workbench`).
- No visible global coverage thresholds enforcement in CI.
- `surface-core` uses standalone vitest config with `passWithNoTests: true` (weakens guardrail posture).

Evidence:
- `packages/**/__tests__/*`
- `tests/e2e/*.spec.ts`
- `packages/*/vitest.config.ts`
- `config/vitest.base.ts`

### 6) Code quality and standards — **6.6**

Strengths:
- TypeScript `strict: true` in shared tsconfig layers.
- Strong API/type modeling in core packages.

Gaps:
- Package-level `lint` scripts are absent across all `packages/*`.
- Package-level `type-check` scripts are absent across all `packages/*`; type safety is mostly piggybacked on build commands.
- No repository-level ESLint/Prettier config for packages (only demo-vue has eslint/prettier config).

Evidence:
- `tsconfig.core.json`
- `tsconfig.adapter.json`
- `packages/*/package.json`
- `demo-vue/eslint.config.ts`

### 7) Security and supply chain — **4.9**

Strengths:
- `SECURITY.md` exists with responsible disclosure process.
- Frozen lockfile install in CI.

Gaps:
- No SAST/CodeQL in workflows.
- No dependency vulnerability scan job (`pnpm audit` or equivalent).
- No secrets scanning workflow.
- No SBOM generation/attestation pipeline.
- No dependency bot automation.

Evidence:
- `SECURITY.md`
- `.github/workflows/ci.yml`
- `.github/` (single workflow)

### 8) Performance — **8.6**

Strengths:
- Dedicated benchmark scripts with explicit budget assertions.
- Perf gates included in CI (`perf-assert` job).
- Runtime design across core packages favors deterministic, headless, low-overhead primitives.

Gaps:
- No automated bundle size budgets/check in CI.
- No historical trend storage for benchmark deltas.

Evidence:
- `scripts/bench-livewire-morph.mjs`
- `scripts/bench-vue-adapters.mjs`
- `.github/workflows/ci.yml`

### 9) Reliability and operations — **5.1**

Strengths:
- Some runtime diagnostics hooks exist in specific packages.
- Deterministic APIs improve correctness.

Gaps:
- No formal SLO/SLA docs.
- No incident runbooks.
- No rollback playbook / operational readiness docs.
- No central observability/telemetry policy for production operations.

Evidence:
- `docs/` (no SLO/runbook/incident docs discovered)
- package docs mention diagnostics, but no system-wide operational contract

### 10) DX (developer experience) — **6.8**

Strengths:
- Clear package naming and structure.
- Rich script surface (`quality:max`, perf asserts, e2e).
- Good docs-site coverage for core APIs.

Gaps:
- `CONTRIBUTING.md` says `pnpm dev`, but root `package.json` has no `dev` script.
- Node/pnpm environment is not strongly pinned at root (`engines` and `packageManager` missing).
- Recursive all-workspace commands can produce slower feedback loops as repo grows.

Evidence:
- `CONTRIBUTING.md`
- `package.json`

### 11) Documentation and transparency — **8.0**

Strengths:
- Good docs-site organization and architecture docs.
- Most packages include README + CHANGELOG.

Gaps:
- Missing package README for `@affino/overlay-kernel` and `@affino/visual-workbench`.
- No explicit ADR index/process (architecture decisions mostly narrative, not ADR-formalized).

Evidence:
- `docs-site/`
- `docs/reference/architecture.md`
- `packages/overlay-kernel` (no `README.md`)
- `packages/visual-workbench` (no `README.md`, no changelog)

### 12) Processes and ownership — **4.5**

Strengths:
- Basic issue templates are present.
- Contribution and security policy docs exist.

Gaps:
- No `CODEOWNERS`.
- No PR template / formal review policy enforcement.
- No documented branch strategy beyond CI trigger on `main`.
- No explicit Definition of Done policy for packages.

Evidence:
- `.github/ISSUE_TEMPLATE/*`
- absence of `.github/CODEOWNERS` and PR template
- `CONTRIBUTING.md`

---

## Priority Remediation Backlog

### P0 (Start immediately)

1. Add `CODEOWNERS` + required review rules (critical path packages first: `*-core`, adapters, CI/workflows).
2. Add security pipeline job(s): dependency audit + secret scanning + CodeQL/SAST.
3. Reinstate and enforce Changeset gate in CI (uncomment and fail PR without valid release intent).
4. Add root environment pinning: `packageManager` + `engines` in root `package.json`.

### P1 (Next hardening wave)

5. Introduce package-level lint/type-check contracts (or enforce centrally with explicit include matrix).
6. Add coverage thresholds and enforce in CI for critical packages.
7. Add README for `overlay-kernel` and `visual-workbench`; add changelog for `visual-workbench`.
8. Fix docs/runtime DX drift (`CONTRIBUTING.md` vs available root scripts).

### P2 (Scale and optimization)

9. Introduce affected-only orchestration (Nx/Turbo or equivalent) + build cache telemetry.
10. Add bundle-size budget checks in CI for publishable packages.
11. Establish ADR workflow + operational runbooks (incident response, rollback, release rollback).
12. Add dependency update automation (Dependabot/Renovate) with controlled cadence.

---

## Audit Confidence

Confidence: **High** for static repository/process findings; **Medium** for runtime/operational maturity because this audit did not execute full CI in this environment.
