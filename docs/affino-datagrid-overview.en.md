# Affino DataGrid Overview

Updated: 2026-03-03

Canonical capability inventory:

- docs/datagrid-feature-catalog.md
- docs/datagrid-commercial-packaging-plan.md

Affino DataGrid is a headless, deterministic data grid engine designed for enterprise-scale performance and predictable behavior under heavy scrolling, selection, and editing workloads. It keeps core logic framework-agnostic and exposes thin adapters for Vue (and other targets), backed by contract tests and performance gates.

Purpose

- Provide a stable, semver-safe core API for grid state, models, and runtime services.
- Keep UI adapters thin by pushing behavior into core and shared orchestration.
- Guarantee determinism via strict contracts and runtime invariants.
- Enforce performance budgets for critical interactions and long sessions.

Architecture at a Glance

- @affino/datagrid-core owns models, runtime services, viewport control, selection geometry, and deterministic math.
- @affino/datagrid-vue is a thin Vue adapter that maps host events and renders output without re-owning core logic.
- @affino/datagrid-orchestration is a framework-agnostic layer of orchestration helpers reused by Vue, Laravel, and React adapters.

Execution Mode Guide

- main-thread: best for small-to-medium grids with low mutation pressure and minimal runtime complexity.
- worker-owned: best for interaction-heavy workloads (frequent patch/edit + sort/group/filter) where UI-thread responsiveness is the bottleneck.
- server-side row model: best for very large/remote datasets where backend should own filtering/grouping/pivoting/query shape.

Practical policy:

- Start with main-thread.
- Promote to worker-owned when synchronous interaction pressure causes UI stalls.
- Move to server-side when backend query/data-shaping dominates the workload.

Core Capabilities

- Stable namespace-based `DataGridApi` facade (`lifecycle/rows/data/columns/view/pivot/selection/transaction/state/events/meta/policy/compute/diagnostics/plugins`).
- Unified state contract (`api.state.get/set`) with partial/strict restore controls.
- Public backpressure control surface (`api.data.pause/resume/flush`) for supported server/data-source models.
- Typed public event surface (`api.events.on`) with deterministic in-process ordering.
- Row model with sorting, filtering, grouping, pagination, and viewport range control.
- Column model with canonical definitions, visibility, ordering, sizing, and pinning.
- Headless edit model with deterministic snapshots and revision tracking.
- Selection snapshots plus summary aggregation (count, countDistinct, sum, avg, min, max).
- Data source protocol with pull, push, invalidation, and backpressure diagnostics.
- Viewport controller and virtualization math designed for predictable performance.
- Transaction service with rollback, batching, and undo/redo (advanced API).
- Accessibility state machine for deterministic ARIA and keyboard behavior (advanced API).
- Plugin capability model with fail-fast access control.

Functional Surface (what users can build)

- Spreadsheet-like interactions: range selection, fill handle, range move, clipboard copy/paste/cut.
- Editing flows: patch rows, freeze/reapply view behavior, deterministic revision snapshots.
- Pivot workflows: dynamic pivot columns, subtotals/grand totals, pivot layout export/import, drilldown.
- Group/tree workflows: deterministic group projection, expansion/collapse control, aggregate pipelines.
- Viewport/virtualization: deterministic visible-range syncing and performance-oriented rendering contracts.
- Runtime diagnostics: compute/transport diagnostics, quality gates, benchmark baselines.
- Compute and policy controls: compute mode switching and projection policy (`mutable/immutable/excel-like`).
- Extensibility surface: stable plugin registration (`api.plugins`) plus advanced runtime hooks.

Performance Snapshot (plain-language)

From recent worker pressure matrix (scaled patch profile):

- 20k rows: worker-owned was about 5.4x faster end-to-end than main-thread.
- 100k rows: worker-owned was about 1.6x faster.
- 200k rows (heavier patch size): worker-owned was about 1.34x faster.

Interpretation:

- Worker-owned is typically a responsiveness optimization.
- Main-thread remains valid for simpler/smaller tables.
- Server-side mode is the next step when data scale/query ownership belongs to backend.

Public API Tiers

Stable entrypoint: @affino/datagrid-core

- createDataGridCore, createDataGridApi
- createClientRowModel, createServerBackedRowModel
- createDataGridColumnModel, createDataGridEditModel
- selection summary helpers and canonical types
- semver protocol helpers and public protocol metadata

Advanced entrypoint: @affino/datagrid-core/advanced

- createDataGridRuntime
- createDataGridAdapterRuntime
- createDataGridTransactionService
- createDataGridViewportController
- createDataSourceBackedRowModel
- createDataGridA11yStateMachine

Internal entrypoint: @affino/datagrid-core/internal

- unsafe helpers without semver guarantees

Vue Public Surface

Stable entrypoint: @affino/datagrid-vue

- useAffinoDataGrid, useAffinoDataGridUi
- useDataGridRuntime, useDataGridContextMenu, useDataGridOverlayScrollState
- createDataGridVueRuntime
- DataGrid, AffinoDataGridSimple
- A11y attribute mapping helpers and selectors

Orchestration Layer

The orchestration package contains pure TypeScript logic that adapters reuse for consistent behavior across frameworks. It centralizes copy, paste, cut, fill, move, pointer and selection lifecycles, and other interaction policies so that adapters remain thin.

Performance and Quality Gates

- Contract tests enforce determinism and invariants across models, runtime, and orchestration.
- CI gates enforce latency, FPS, memory, and variance budgets for key benchmarks.
- Baseline drift locks keep regression detection strict and repeatable.

Key References (repo docs)

- docs/datagrid-architecture.md
- docs/datagrid-grid-api.md
- docs/datagrid-core-factories-reference.md
- docs/datagrid-core-advanced-reference.md
- docs/datagrid-state-events-compute-diagnostics.md
- docs/datagrid-gridcore-service-registry.md
- docs/datagrid-model-contracts.md
- docs/datagrid-tree-data.md
- docs/datagrid-data-source-protocol.md
- docs/datagrid-cross-platform-adapter-protocol.md
- docs/datagrid-plugin-capability-model.md
- docs/datagrid-performance-gates.md
- docs/datagrid-perf-by-design-runtime.md
- docs/archive/datagrid/pipelines/datagrid-wave2-enterprise-architecture-pipeline.md

Commercial Packaging (SKU layer)

- `@affino/datagrid`: community commercial facade with default community gating.
- `@affino/datagrid-pro`: pro activation package (`enableProFeatures`) that unlocks pro-gated runtime features.
- `Enterprise`: support/SLA/integration tier layered operationally on top of Pro package.
