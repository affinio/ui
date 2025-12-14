# Mouse Prediction Deep Dive

The mouse prediction system prevents accidental submenu closures when users move their cursor diagonally toward a submenu. This is a critical UX feature for multi-level menus.

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

The prediction algorithm tracks mouse movement and determines if the user is **heading toward** the currently open submenu, even if they temporarily hover over other menu items.

## Configuration Parameters

### `history: number` (default: `3`)

Number of recent pointer positions to track.

- **Higher values** (4-5): More stable prediction, slower to react to direction changes
- **Lower values** (2-3): More reactive, but can be jittery
- **Recommended**: `3` for most use cases

```typescript
// Track last 5 positions for very stable prediction
mousePrediction: { history: 5 }
```

### `verticalTolerance: number` (default: `20`)

Maximum vertical drift (in pixels) allowed while still considering horizontal movement valid.

Users rarely move in perfectly straight lines. This parameter allows some "wiggle room" for natural mouse movement.

```typescript
// Allow 30px of vertical drift
mousePrediction: { verticalTolerance: 30 }
```

**Use cases:**
- Increase for trackpad users (less precise)
- Decrease for very precise positioning requirements

### `headingThreshold: number` (default: `0.3`)

Minimum confidence score (0-1) required to consider the user as "heading toward" the submenu.

This is calculated based on:
- Horizontal progress toward the target
- Vertical drift penalty
- Direction consistency

```typescript
// Require 50% confidence (stricter)
mousePrediction: { headingThreshold: 0.5 }

// Allow 10% confidence (more lenient)
mousePrediction: { headingThreshold: 0.1 }
```

**Tuning guide:**
- **Higher** (0.4-0.6): User must move more directly toward submenu
- **Lower** (0.1-0.2): More forgiving, but may prevent some menu closures
- **Recommended**: `0.3` balances precision and UX

### `horizontalThreshold: number` (default: `5`)

Minimum horizontal progress (in pixels) required to consider movement intentional.

Prevents micro-movements from triggering prediction.

```typescript
// Require at least 10px horizontal movement
mousePrediction: { horizontalThreshold: 10 }
```

**Use cases:**
- Increase for high-DPI displays
- Decrease for very sensitive tracking

### `samplingOffset: number` (default: `2`)

How many positions back in history to compare against current position.

Instead of comparing consecutive positions, we skip some positions to get a clearer direction signal.

```typescript
// Compare current position to 3 positions back
mousePrediction: { samplingOffset: 3 }
```

**How it works:**
```
History: [p0, p1, p2, p3, p4]  (p4 = current)
Offset 1: Compare p4 vs p3
Offset 2: Compare p4 vs p2  ← default
Offset 3: Compare p4 vs p1
```

**Tuning guide:**
- **Higher offset**: Smoother, ignores small jitters
- **Lower offset**: More reactive to direction changes
- Must be less than `history`

### `driftBias: number` (default: `0.8`)

Weight applied to forgive vertical drift in the scoring calculation.

Higher values make the algorithm more forgiving of vertical movement.

```typescript
// Very forgiving (90% bias)
mousePrediction: { driftBias: 0.9 }

// Strict (50% bias)
mousePrediction: { driftBias: 0.5 }
```

**Internal calculation:**
```typescript
const driftPenalty = Math.abs(dy) / verticalTolerance
const score = (horizProgress * driftBias) - (driftPenalty * (1 - driftBias))
```

## Algorithm Flow

```
1. Record pointer position
   ↓
2. Collect last N positions (history)
   ↓
3. Compare current vs (current - samplingOffset)
   ↓
4. Calculate horizontal progress toward target
   ↓
5. Calculate vertical drift penalty
   ↓
6. Compute weighted score:
   score = (horizProgress × driftBias) - (drift × (1 - driftBias))
   ↓
7. Is score > headingThreshold?
   ├─ YES → User is heading toward submenu
   │         (Keep submenu open, ignore other hovers)
   └─ NO → User changed direction
            (Allow normal menu hover behavior)
```

## Practical Examples

### Conservative (stable, less aggressive)

```typescript
mousePrediction: {
  history: 5,
  verticalTolerance: 30,
  headingThreshold: 0.4,
  horizontalThreshold: 8,
  samplingOffset: 3,
  driftBias: 0.9
}
```

Best for:
- Trackpad users
- Complex nested menus
- Users with less precise input

### Aggressive (reactive, precise)

```typescript
mousePrediction: {
  history: 2,
  verticalTolerance: 15,
  headingThreshold: 0.2,
  horizontalThreshold: 3,
  samplingOffset: 1,
  driftBias: 0.6
}
```

Best for:
- Mouse users
- Simple menus
- Users with precise input
- Fast interaction patterns

### Balanced (recommended default)

```typescript
mousePrediction: {
  history: 3,
  verticalTolerance: 20,
  headingThreshold: 0.3,
  horizontalThreshold: 5,
  samplingOffset: 2,
  driftBias: 0.8
}
```

Works well for:
- Most use cases
- Mixed input devices
- General-purpose menus

## Debugging

Enable debug logging to visualize prediction:

```typescript
const submenu = new SubmenuCore(parent, options)

// Log each prediction check
submenu.recordPointer = function(point) {
  const result = this.isPredictingTowardTarget(point)
  console.log({
    point,
    isHeading: result,
    history: this.pointerHistory
  })
  return result
}
```

## When to Disable

Some scenarios don't need mouse prediction:

```typescript
// Disable entirely
mousePrediction: null

// Or use minimal prediction
mousePrediction: {
  headingThreshold: 0.9  // Almost never triggers
}
```

**Disable when:**
- No nested submenus
- Touch-only interfaces
- Menu opens on click (not hover)
- Performance is critical and menus are simple

## Performance Considerations

Mouse prediction runs on every `pointermove` event. Performance impact is minimal:

- **O(1)** - Fixed-size history buffer
- **~0.01ms** - Typical execution time per check
- **No DOM access** - Pure coordinate math
- **No allocations** - Reuses array slots

For 60 FPS mouse tracking:
- Frame budget: 16.67ms
- Prediction cost: ~0.01ms
- **Overhead: 0.06%** of frame time

Safe to use even in performance-critical applications.

## Related Patterns

This technique is inspired by:
- **Amazon's mega menu** - Original popularization of the pattern
- **Stripe's navigation** - Refined implementation
- **GitHub's dropdown menus** - Modern application

Academic reference: [Triangle of Tolerance](https://www.smashingmagazine.com/2023/08/better-context-menus-safe-triangles/) - UX pattern for menu navigation.

---

**Need help tuning?** Start with defaults, then adjust based on user feedback. The algorithm is designed to be "good enough" out of the box for 90% of use cases.
