# Docs Lifecycle Policy

This policy keeps `docs/` usable when the repository accumulates many execution checklists and planning artifacts.

## Document Classes

## Active Reference Docs (stay in `docs/`)

Examples:

- architecture
- contracts
- guides
- runbooks
- current roadmaps
- quality gate policies

These are expected to be read repeatedly and should remain easy to discover from the top-level `docs/` directory.

## Execution Artifacts (archive when completed)

Examples:

- `*checklist*.md`
- `*pipeline*.md`
- temporary migration plans / TODO plans

Rule:

- if the file is **completed** or **superseded**, move it to `docs/archive/...`
- if the file is still active (open checkboxes / active milestone), keep it in `docs/`

## Runbooks (usually stay active)

Runbooks are operational references and should normally remain in `docs/` even if mature/stable.

## Completion / Archive Criteria

A checklist or pipeline is a good archive candidate when at least one is true:

- all checklist items are closed
- the work has been replaced by a newer plan
- the file is used mainly as closure/history evidence, not as active plan

## Naming / Placement Rules

- Keep active names descriptive and current.
- Move completed historical plans under topic folders, e.g.:
  - `docs/archive/datagrid/checklists/`
  - `docs/archive/datagrid/pipelines/`
- Keep `docs/archive/README.md` updated when moving files.

## Link Hygiene

When moving docs:

1. update references in `docs/` and `docs-site/`
2. avoid leaving duplicate copies in root `docs/`
3. preserve historical content verbatim unless fixing links/formatting

## Practical Workflow

1. Create/maintain active plan in `docs/`
2. Execute work and close checklist items
3. Move completed artifact to `docs/archive/...`
4. Update links and archive index

