# Release Process

Date: `2026-02-07`

## Versioning model

- Semver per package.
- Release intent is captured in PR release notes/risk sections and package changelog updates.

## Standard release flow

1. Merge PR with complete release notes/changelog context (for public package changes).
2. Ensure CI is green on `main`.
3. Prepare release PR/version updates and changelog notes.
4. Publish packages from release commit.
5. Verify package install and smoke tests on demos.

Before publishing, verify the runtime explicitly:

```sh
node --version # must satisfy the repository engine contract
pnpm --version # must match the repository packageManager field
```

The repository currently targets Node 24 and declares its pnpm toolchain in the root
`package.json`. Follow those declarations when publishing; update them deliberately when
the supported runtime moves forward.

## Rules

- No publish from non-`main` branches.
- No manual version edits without release rationale in PR/release notes.
- Changelog entries must reflect user-facing change, not internal noise.

## Emergency hotfix release

1. Cut `hotfix/*` from `main`.
2. Minimal fix + focused validation.
3. Publish patch release.
4. Document incident and remediation in runbook.
