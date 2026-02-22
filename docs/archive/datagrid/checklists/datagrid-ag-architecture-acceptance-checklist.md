# DataGrid AG-Style Architecture Acceptance Checklist

Date: `2026-02-08`  
Scope: `@affino/datagrid-core` + `@affino/datagrid-vue`

Этот чеклист фиксирует минимальные архитектурные критерии для уровня `>= 9.5` и используется в fail-fast gate:

- Command: `pnpm run quality:architecture:datagrid`
- Script: `/Users/anton/Projects/affinio/scripts/check-datagrid-architecture-acceptance.mjs`
- Report artifact: `artifacts/quality/datagrid-architecture-acceptance-report.json`

## Required Components

- [x] Canonical `DataGridRowModel` contract + client/server implementations.
- [x] Canonical `DataGridColumnModel` contract as single owner for column state.
- [x] `GridCore` service registry with deterministic lifecycle.
- [x] Unified `GridApi` facade on top of service registry.
- [x] Typed runtime events (`host/plugin/internal`) exported from advanced public API.
- [x] Headless A11y state machine contract exported from advanced public API.
- [x] Versioned public protocol exported from core (`protocol version + deprecation windows`).
- [x] Tiered core entrypoints are defined:
  - stable: `@affino/datagrid-core`
  - advanced: `@affino/datagrid-core/advanced`
  - internal: `@affino/datagrid-core/internal`

## Required Boundaries

- [x] Viewport consumes model boundaries instead of legacy `VisibleRow[]` path.
- [x] Viewport decomposition services exist:
  - model bridge
  - render sync
  - scroll/layout orchestration
- [x] Legacy viewport API paths removed from controller hot path (`serverIntegration`, legacy setters).

## Contract Lock Requirements

- [x] Grid lifecycle contract tests.
- [x] Grid API contract tests.
- [x] Typed runtime event contract tests.
- [x] Config decomposition contract tests.
- [x] RowModel/ColumnModel viewport boundary contract tests.
- [x] Viewport bridge/render-sync contract tests.
- [x] Strict contract matrix (`contract|lifecycle|property|stress|determinism`) is gated by root script.
- [x] Headless A11y contract tests (core state machine + adapter DOM mapping).
- [x] Versioned public protocol and codemod contract tests.
- [x] Entrypoint tier contract tests (stable surface has no advanced/internal leaks).

## Documentation Requirements

- [x] Model contracts doc.
- [x] GridCore service registry doc.
- [x] Grid API doc.
- [x] Typed runtime events doc.
- [x] Config decomposition doc.
- [x] Viewport decomposition doc.
- [x] Strict contract testing matrix doc.
- [x] Headless A11y contract doc.
- [x] Versioned public protocol doc.

## Acceptance Rule

- Final score must be `>= 9.5` and all mandatory checks must pass.
- CI gate is blocking for merge when acceptance fails.
