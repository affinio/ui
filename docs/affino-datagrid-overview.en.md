# Affino DataGrid Overview

Updated: 2026-02-10

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

Core Capabilities

- Row model with sorting, filtering, grouping, pagination, and viewport range control.
- Column model with canonical definitions, visibility, ordering, sizing, and pinning.
- Headless edit model with deterministic snapshots and revision tracking.
- Selection snapshots plus summary aggregation (count, countDistinct, sum, avg, min, max).
- Data source protocol with pull, push, invalidation, and backpressure diagnostics.
- Viewport controller and virtualization math designed for predictable performance.
- Transaction service with rollback, batching, and undo/redo (advanced API).
- Accessibility state machine for deterministic ARIA and keyboard behavior (advanced API).
- Plugin capability model with fail-fast access control.

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
- docs/datagrid-gridcore-service-registry.md
- docs/datagrid-model-contracts.md
- docs/datagrid-data-source-protocol.md
- docs/datagrid-cross-platform-adapter-protocol.md
- docs/datagrid-plugin-capability-model.md
- docs/datagrid-performance-gates.md
- docs/datagrid-perf-by-design-runtime.md
- docs/datagrid-wave2-enterprise-architecture-pipeline.md
