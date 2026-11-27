# Diagram hierarchy deprecation inventory

Status: active compatibility policy for `@affino/diagram-core`.

## Deprecated capability

| Capability | Affected code | Reason | Replacement | Deprecated in | Removal target |
|---|---|---|---|---|---|
| Baked group representation (`DiagramGroup` with both `x` and `y` omitted) | `packages/diagram-core/src/types.ts`; compatibility branches in `DiagramEngine.ts` and `geometry.ts` | Group transforms were represented by rewriting child geometry, so groups did not own a composable transform and nested transforms could drift. | Retained `DiagramGroup.x/y/rotation/flipX/flipY/transformOrigin`; child membership in `childIds`; `reparentEntity` preserves world geometry using parent-local placement compensation. | Unreleased after 0.34.0; no package version was changed for this work. | Next major release (1.0.0 if the current 0.x line advances directly). |
| Vue drag-only interaction preview names (`DiagramDragPreviewMode`, `dragPreviewMode`, `dragPreview`) | `packages/diagram-vue/src/types.ts`; `useDiagramVisibleEntities()` | The API named only object movement although Core already exposes candidate geometry for other edits. | `DiagramInteractionPreviewMode`, `interactionPreviewMode`, and `interactionPreview` for all supported Core edit candidates. | Unreleased; no package version was changed for this work. | Next major release (1.0.0 if the current 0.x line advances directly). |

## Markers and isolation

- `DiagramGroup` documents missing `x/y` as legacy-only input.
- `normalizeLegacyGroups()` is the loading adapter. Safe baked groups become retained identity groups while child coordinates, IDs, metadata, origins, and port identities remain unchanged.
- Groups with descendant connectors whose endpoints resolve in document space are not normalized. Applying retained parent transforms to both the edge geometry and its resolved endpoints can transform endpoints twice. Such groups remain on compatibility code paths until a route-local coordinate contract is available.
- Legacy compatibility branches in `geometry.ts` and `DiagramEngine.ts` carry `TODO(next-major)` removal markers. `rotateGroupChild()` is marked `@deprecated`.
- New group creation, hierarchy operations, and rendering use retained transforms. No new feature should add a consumer of baked child transforms.

## Migration and obligations

The migration runs when Core validates a scene, including deserialization. It does not rewrite child geometry. Safe legacy groups are assigned identity retained state (`x: 0`, `y: 0`, zero rotation, no reflection), retaining the old world-coordinate child geometry. Relative and absolute transform origins are retained. Unsafe attached-route hierarchies remain readable and serializable without reinterpretation.

Keep legacy loading coverage until the supported-document migration window is closed. Before the next major release:

- Review this inventory and confirm all supported legacy documents have a migration path.
- Remove runtime baked-group move, rotate, reflect, resize, port, geometry, and ungroup branches.
- Remove obsolete tests and examples that assert baked runtime behavior.
- Keep only a versioned import adapter if legacy documents remain supported; migration must output the canonical retained hierarchy.
- Run the complete diagram Core/Vue regression suite and hierarchy browser scenarios after removal.
- Record any retained exception here with an explicit reason and owner.

## Current limitations

- Unsafe legacy groups with attached descendant connectors are not normalized; this is the remaining compatibility obligation.
- `DiagramGroup.x` and `DiagramGroup.y` are optional in the public stored-group type because legacy groups with attached descendant routes remain unnormalized: their endpoints still use document-space coordinates, and applying a retained parent matrix can transform those endpoints twice. Safe legacy groups are normalized at scene validation; retained groups created by current group commands carry finite `x/y` values. The previously released `DiagramGroup` had no `x/y` properties, so adding optional coordinates is additive relative to that contract. Applications using the new coordinates must still narrow or default them when they can consume unsafe legacy groups.
- Retained affine scaling is deferred because object scale, stroke width, text metrics, and table tracks do not share one lossless scaling contract.
- Empty groups are valid retained scene records but have no geometry. New group creation still requires two or more members.
