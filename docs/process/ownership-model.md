# Ownership Model

Date: `2026-02-07`

## Source of truth

Ownership is enforced by `/.github/CODEOWNERS`.

## Ownership units

- Core packages: `packages/*-core`, `overlay-kernel`, `overlay-host`, utility packages.
- Adapter packages: `packages/*-vue`, `packages/*-laravel`, `menu-react`, adapter facades.
- Platform/process: `.github`, `scripts`, release and CI workflows.
- Docs and demos: `docs`, `docs-site`, `demo-vue`, `demo-laravel`.

## Owner responsibilities

- Review and approve changes in owned paths.
- Maintain API stability and changelog quality.
- Ensure tests and docs are updated with behavior changes.
- Participate in incident response for owned surfaces.

## Escalation

- If an owner is unavailable for `>2` business days, fallback owner handles review.
- Security fixes can bypass normal path ownership with post-merge owner notification.
