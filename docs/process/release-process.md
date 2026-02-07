# Release Process

Date: `2026-02-07`

## Versioning model

- Semver per package.
- Changesets are the source of release intent and version bump logic.

## Standard release flow

1. Merge PR with valid changeset (for public package changes).
2. Ensure CI is green on `main`.
3. Generate release PR/version updates via changesets tooling.
4. Publish packages from release commit.
5. Verify package install and smoke tests on demos.

## Rules

- No publish from non-`main` branches.
- No manual version edits without changeset rationale.
- Changelog entries must reflect user-facing change, not internal noise.
- DataGrid packages follow the stricter readiness profile:
  `/Users/anton/Projects/affinio/docs/process/datagrid-release-readiness.md`
- DataGrid changesets should use template:
  `/Users/anton/Projects/affinio/.changeset/datagrid-template.md`

## Emergency hotfix release

1. Cut `hotfix/*` from `main`.
2. Minimal fix + focused validation.
3. Publish patch release.
4. Document incident and remediation in runbook.
