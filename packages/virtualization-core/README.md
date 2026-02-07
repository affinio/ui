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

## Adapter recipe (recommended)

Use one deterministic scroll pipeline in adapters:

1. Read raw scroll offset and compute direction (`-1 | 0 | 1`) from delta.
2. Update overscan controller for current frame.
3. Clamp scroll offset using scroll-limit helpers.
4. Call `virtualizer.update(...)` with normalized values.
5. Render only `[startIndex, endIndex)`.

```ts
const overscanController = createVerticalOverscanController({ minOverscan: 4 })
const virtualizer = createAxisVirtualizer("vertical", strategy, null)

function onScroll({
  offset,
  delta,
  timestamp,
  viewportSize,
  itemSize,
  totalCount,
}: {
  offset: number
  delta: number
  timestamp: number
  viewportSize: number
  itemSize: number
  totalCount: number
}) {
  const direction = delta === 0 ? 0 : delta > 0 ? 1 : -1
  const overscan = overscanController.update({
    timestamp,
    delta,
    viewportSize,
    itemSize,
    virtualizationEnabled: true,
  }).overscan

  const limit = computeVerticalScrollLimit({
    estimatedItemSize: itemSize,
    totalCount,
    viewportSize,
    overscanTrailing: Math.ceil(overscan / 2),
    visibleCount: Math.max(1, Math.floor(viewportSize / Math.max(1, itemSize))),
  })

  const clampedOffset = clampScrollOffset({ offset, limit })

  return virtualizer.update({
    axis: "vertical",
    viewportSize,
    scrollOffset: clampedOffset,
    virtualizationEnabled: true,
    estimatedItemSize: itemSize,
    totalCount,
    overscan,
    meta: { scrollDirection: direction },
  })
}
```

## Guardrails for adapter implementers

- `update()` mutates and returns the same state object reference for performance. If your framework requires immutable updates, copy primitive fields into adapter state.
- Keep `strategy.computeVisibleCount`, `strategy.clampScroll`, and `strategy.computeRange` pure. Do not read DOM inside these functions.
- Always pass normalized counts for the currently virtualized dataset (`totalCount` must match rendered source).
- Respect the index contract: `startIndex` inclusive, `endIndex` exclusive.
- Disable virtualization (`virtualizationEnabled: false`) during tiny datasets to get full range and avoid needless pool math.

Framework adapters provide the `strategy` and translate DOM scroll events into
pure math inputs so this package can stay deterministic and testable.

See `/demo-vue` → `https://www.affino.dev` for a live example that streams scroll offsets into the
virtualizer and visualizes overscan, pool size, and render budgets in real time.
