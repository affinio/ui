# Rollback Runbook

Date: `2026-02-07`

## When to rollback

- Regression cannot be fixed safely within incident response window.
- Customer-facing reliability or accessibility is degraded.
- CI/prod signal indicates release is unsafe.

## Rollback options

### 1) Source rollback (preferred)

- Revert offending commit(s) on `main` via PR.
- Re-run required CI gates.
- Merge revert and publish patch release if needed.

### 2) Package rollback

- Deprecate bad package version(s) if possible.
- Publish patched version with restored behavior.

### 3) Feature-level disable

- Use safe defaults/feature toggles at adapter level where available.
- Document temporary mitigation and removal plan.

## Checklist

- Rollback decision logged with incident id.
- Affected versions and replacement versions documented.
- Post-rollback verification completed (tests + smoke checks).
- Follow-up prevention tasks assigned.
