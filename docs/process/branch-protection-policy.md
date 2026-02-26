# Branch Protection Policy

Date: `2026-02-07`

Target branch: `main`

## Required settings

- Require pull request before merging.
- Require approvals before merging (`>= 1`; `>= 2` for high-risk changes).
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merge.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Restrict direct pushes to `main` (except emergency maintainers).

## Required checks

CI checks:

- `CI / verify`
- `CI / perf-assert`
- `CI / docs`
- `CI / e2e`

Security checks:

- `Security / dependency-audit`
- `Security / secret-scan`
- `Security / codeql`
- `Security / sbom`

## Optional hardening

- Require signed commits for `main`.
- Enable merge queue for large/high-churn periods.
- Enforce linear history.

## Emergency override

- Only maintainers may bypass in `SEV-1` incidents.
- Every bypass requires post-incident follow-up issue and revert/cleanup plan.
