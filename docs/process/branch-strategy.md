# Branch Strategy

Date: `2026-02-07`

## Model

Trunk-based development with protected `main`.

## Rules

- All changes land through pull requests.
- Direct pushes to `main` are reserved for emergency recovery only.
- Branch naming:
  - `feat/<scope>-<short-description>`
  - `fix/<scope>-<short-description>`
  - `chore/<scope>-<short-description>`
  - `docs/<scope>-<short-description>`

## Merge policy

- Prefer squash merge for linear history.
- PR title should be release-note friendly.
- Merge is blocked if required checks fail.

## Hotfix

- `hotfix/*` branch from latest `main`.
- Minimal diff, high-priority review, immediate release.
- Post-incident follow-up issue is mandatory.
