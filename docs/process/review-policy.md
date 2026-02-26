# Review Policy

Date: `2026-02-07`

## Pull request minimum bar

- At least one owner approval (per `CODEOWNERS`) for touched critical paths.
- CI green: `check`, `build`, docs build, perf-assert, e2e (when applicable).
- Release notes/changelog impact documented for public package changes (or explicit rationale in PR).

## Change classes

### Low risk

- Docs-only and non-functional refactors.
- One approval is sufficient.

### Medium risk

- Behavior changes inside a single package or adapter.
- One owner approval + tests required.

### High risk

- Public API changes, cross-package contracts, CI/release workflow changes.
- Two approvals recommended, one must be an owner of affected domain.

## Review checklist

- API compatibility and migration impact.
- Tests cover changed behavior and edge cases.
- Docs/changelog/release notes are aligned with behavior.
- No hidden coupling to framework/DOM in core packages.
