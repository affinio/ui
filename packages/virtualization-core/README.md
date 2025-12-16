# @affino/virtualization-core

Headless virtualization math for scroll-heavy surfaces and composite grids.

> Shared overscan heuristics and scroll-bound math extracted from production-grade grid engines.

## Features

- Axis-agnostic virtualizer with deterministic overscan buckets
- Dynamic overscan controllers that react to velocity and viewport math
- Scroll limit helpers that cooperate with browser-native constraints
- Zero DOM requirements so adapters stay framework-specific

## Non-goals

- Rendering or DOM measurement
- Event binding
- Framework integrations
- Styling or layout helpers

## Mental model

This package models virtualization as a pure axis problem.

- An axis virtualizer maps a scroll offset to a visible index window.
- Overscan expands that window based on velocity and viewport heuristics.
- Strategies define how ranges are computed for a specific surface (list, columns, grid).

The core does not know about pixels, DOM nodes, or rendering.
It only operates on numbers and deterministic math.

## Invariants

The virtualizer guarantees the following:

- `startIndex` is inclusive, `endIndex` is exclusive
- `0 <= startIndex <= endIndex <= totalCount`
- When `virtualizationEnabled = false`, the full range is returned
- Overscan never exceeds the available pool size
- `update()` is deterministic for the same inputs

## Usage

### Example: vertical list

```ts
const virtualizer = createAxisVirtualizer("vertical", strategy, null)

const state = virtualizer.update({
  axis: "vertical",
  viewportSize: 600,
  scrollOffset,
  virtualizationEnabled: true,
  estimatedItemSize: 32,
  totalCount: items.length,
  overscan: 10,
  meta: { scrollDirection },
})

const visibleItems = items.slice(state.startIndex, state.endIndex)
```

Framework adapters provide the `strategy` and translate DOM scroll events into
pure math inputs so this package can stay deterministic and testable.

See `/demo-vue` → `/one-grid` for a live example that streams scroll offsets into the
virtualizer and visualizes overscan, pool size, and render budgets in real time.
