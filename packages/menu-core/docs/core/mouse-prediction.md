# Mouse Prediction Deep Dive

The mouse prediction system prevents accidental submenu closures when users move their cursor diagonally toward a submenu. This behavioral guardrail keeps multi-level menus stable without making them feel sticky or slow.

## The Problem

When a user hovers over a menu item with a submenu:

```
┌─────────────┐
│ File        │
│ Edit        │──────┐
│ View     ◀──┼──────┤ Submenu appears here
│ Help        │      │
└─────────────┘      └─────────
```

If the user moves their mouse diagonally from "Edit" toward the submenu, they'll briefly pass over "View" or other items. Without prediction, this would:
1. Close the "Edit" submenu
2. Open the "View" menu
3. Frustrate the user

## The Solution

The implementation uses a **forward-motion + intent surface** model rather than a single score. It samples recent pointer positions, confirms forward motion toward the submenu, and then checks whether the pointer is inside either a tolerance-expanded target, an intent triangle, or a corridor-and-gates heuristic. The system intentionally prefers false negatives over false positives so that unsure motion falls back to normal hover behavior.

## Decision Rule

The boolean expression below is the exact decision rule:

```
forwardMotion && (withinExpandedTarget || withinIntentTriangle || heuristicFallback)
```

The sub-conditions have specific responsibilities:

- **forwardMotion** – Ensures pointer movement continues toward the submenu (based on the submenu direction). If motion reverses, prediction stops.
- **withinExpandedTarget** – Checks whether the latest pointer position is inside the submenu rectangle expanded by `verticalTolerance` in all directions.
- **withinIntentTriangle** – Builds a triangle from the last sample to the submenu edge (with tolerance) and checks if the pointer is inside it.
- **heuristicFallback** – A secondary gate: `withinCorridor && (headingSatisfied || progressSatisfied || driftBiasSatisfied)`.

There is **no combined score** and there are **no weights** between the gates. Each signal either passes or fails, and the final intent is a straight boolean evaluation.

## Configuration Parameters

All knobs map directly to one of the gates above. Defaults reflect the production implementation and should only be changed after testing with real pointer data.

### `history: number` (default: `8`)

Maximum number of pointer samples kept in the circular buffer. A longer history provides more stable vectors for the corridor and heading checks, while a shorter history reacts faster to direction changes. Memory and CPU cost stay constant regardless of the size because the buffer is fixed.

### `verticalTolerance: number` (default: `48`)

Shared tolerance, in pixels, used by multiple gates: it expands the target rectangle, sets corridor thickness, and offsets the intent triangle edges. Larger tolerances keep menus open when users move across bumpy terrain (e.g., laptop trackpads). Smaller tolerances tighten the intent area so only very direct motion is preserved.

### `samplingOffset: number` (default: `2`)

Number of samples the predictor jumps back when it builds the movement vector. Instead of comparing the most recent two samples, it compares `points[last]` and `points[last - offset]`. Higher offsets suppress jitter and generate smoother heading vectors; lower offsets make the heading gate respond faster to new intent. The offset must always be less than `history`.

### `headingThreshold: number` (default: `0.2`)

Minimum dot-product value required for `headingSatisfied`. The dot product operates on normalized vectors and therefore produces values in the `[-1, 1]` range. A higher threshold requires the pointer to move more directly toward the submenu. Lower thresholds allow broader diagonals to pass. This check looks only at direction; it does not consider distance or progress.

### `horizontalThreshold: number` (default: `6`)

Allowance, in pixels, for backward motion along the axis. The `progressSatisfied` gate passes when the forward progress value is greater than or equal to `-horizontalThreshold`. That means users can drift slightly toward the parent item without losing the submenu. Increasing this value makes the system more forgiving; decreasing it demands steady forward movement.

### `driftBias: number` (default: `0.4`)

Axis-dominance ratio used by the fallback gate. For a horizontal submenu, `driftBiasSatisfied` checks whether `|dx| > |dy| * driftBias`. In vertical layouts the axes are swapped. This gate does **not** blend into the heading score—it simply ensures that strong axis-dominant motion can keep the submenu alive even if the dot product is inconclusive. Higher values make it harder for this gate to pass, because the dominant axis must strongly outweigh the perpendicular component.

### `maxAge: number` (default: `320`)

Maximum time, in milliseconds, allowed between the latest pointer sample and the sample used for the movement vector. If the gap is larger than `maxAge`, prediction returns false to avoid stale movement decisions.

## Algorithm Flow

```
1. Record pointer point (with timestamp) and keep only the newest `history` entries.
2. If fewer than two samples exist, exit early (no prediction).
3. Determine the menu orientation (horizontal or vertical) and the direction of travel (left/right or up/down).
4. Build the corridor and intent triangle using `verticalTolerance`.
5. Compute the heading vector using `samplingOffset`, normalize it, and evaluate `headingSatisfied` against `headingThreshold`.
6. Measure forward progress along the orientation axis and evaluate `progressSatisfied` using `horizontalThreshold`.
7. Compare axis-aligned movement magnitudes to evaluate `driftBiasSatisfied`.
8. Evaluate `withinExpandedTarget`, `withinIntentTriangle`, and `heuristicFallback`.
9. Return `forwardMotion && (withinExpandedTarget || withinIntentTriangle || heuristicFallback)`.
```

This order mirrors the implementation: forward motion is required, the expanded target and intent triangle provide the primary keep-alive surfaces, and the corridor+gate heuristic is the fallback. When none of the gates pass, the algorithm reports "not heading" and allows the menu system to process the hover normally.

## Practical Examples

Illustrative configurations below show how the gates interact for different UX targets. They do **not** change library defaults.

### Conservative (stable, less aggressive)

```typescript
mousePrediction: {
   history: 10,
   verticalTolerance: 56,
   headingThreshold: 0.35,
   horizontalThreshold: 8,
   samplingOffset: 3,
   driftBias: 0.6,
   maxAge: 320,
}
```

Higher tolerances and thresholds keep the submenu active only when the pointer follows a very deliberate path. This is useful for dense enterprise menus or teams supporting large external trackpads.

### Aggressive (reactive, precise)

```typescript
mousePrediction: {
   history: 5,
   verticalTolerance: 32,
   headingThreshold: 0.15,
   horizontalThreshold: 4,
   samplingOffset: 1,
   driftBias: 0.3,
   maxAge: 240,
}
```

Short history and low offsets let the heading gate adapt quickly. Lower thresholds keep menus alive even when users cut corners, which suits gaming mice or kiosk hardware where movements are confident.

### Balanced (matches shipping defaults)

```typescript
mousePrediction: {
   history: 8,
   verticalTolerance: 48,
   headingThreshold: 0.2,
   horizontalThreshold: 6,
   samplingOffset: 2,
   driftBias: 0.4,
   maxAge: 320,
}
```

These values prioritize reliability over aggressiveness: the corridor gate is moderately generous, the heading gate looks for a clear diagonal, progress allows for small setbacks, and the drift bias only kicks in when the pointer strongly prefers the submenu axis.

## Debugging

Enable debug output to inspect each gate:

```typescript
const prediction = new MousePrediction(config)

   console.table({
      heading: payload.headingScore,
      withinCorridor: payload.withinCorridor,
      withinIntentTriangle: payload.withinIntentTriangle,
      forwardProgress: payload.forwardProgress,
   })
})
```

The callback mirrors the implementation payload, which includes raw points, the target/origin rectangles, and the evaluated metrics. Logging these values during manual testing quickly reveals whether a missed prediction failed the corridor gate or one of the intent gates.

## When to Disable

Mouse prediction is optional. Disable or soften it when:

- Your menus never spawn nested submenus.
- The menu opens strictly on click/tap and you already debounce pointer motion.
- The UI targets touch hardware exclusively.
- The surface is so small that diagonal pointer travel is unlikely.

```typescript
mousePrediction: null

// or make the heading gate extremely strict
mousePrediction: { headingThreshold: 0.95 }
```

## Performance Considerations

Prediction runs on every `pointermove` event. The cost stays low because:

- Buffer maintenance is O(1) thanks to the capped `history` size.
- Math consists of simple vector operations (dot product, subtraction, magnitude) plus a triangle check.
- No DOM calls or allocations occur inside the hot path.
- Typical execution averages well under 0.05 ms, even on integrated GPUs.

That margin leaves ample headroom inside a 16.67 ms frame budget, so the guard can remain enabled even in complex menu systems.

## Related Patterns

The corridor-and-gates approach builds on patterns popularized by mega menus at Amazon, Stripe, and GitHub, as well as UX guidance like the [Triangle of Tolerance](https://www.smashingmagazine.com/2023/08/better-context-menus-safe-triangles/). The implementation here is deliberately conservative, mirroring those production systems’ preference for false negatives.

---

Future maintainers should treat this README as the contract between docs and code. If the implementation changes, update the gate descriptions and parameter notes here before shipping.
  headingThreshold: 0.2,
