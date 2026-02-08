import { clampIndex, clampScalar } from "./utils";
export function normalizeLinearRange(range) {
    const start = sanitizeIndex(range.start);
    const end = sanitizeIndex(range.end);
    if (start <= end) {
        return { start, end };
    }
    return { start: end, end: start };
}
export function mergeLinearRanges(ranges) {
    if (!ranges.length) {
        return [];
    }
    const normalized = [];
    let nonDecreasingStart = true;
    let previousStart = Number.NEGATIVE_INFINITY;
    for (const range of ranges) {
        const next = normalizeLinearRange(range);
        if (next.start < previousStart) {
            nonDecreasingStart = false;
        }
        previousStart = next.start;
        normalized.push(next);
    }
    if (!nonDecreasingStart) {
        normalized.sort((a, b) => a.start - b.start);
    }
    return mergeSortedLinearRanges(normalized);
}
export function addLinearRange(ranges, next) {
    const merged = mergeLinearRanges(ranges);
    return addLinearRangeToMerged(merged, normalizeLinearRange(next));
}
export function removeLinearRange(ranges, target) {
    const merged = mergeLinearRanges(ranges);
    return removeLinearRangeFromMerged(merged, normalizeLinearRange(target));
}
export function toggleLinearRange(ranges, target) {
    const normalizedTarget = normalizeLinearRange(target);
    const merged = mergeLinearRanges(ranges);
    const fullyCovered = merged.some((range) => range.start <= normalizedTarget.start && range.end >= normalizedTarget.end);
    if (fullyCovered) {
        return removeLinearRangeFromMerged(merged, normalizedTarget);
    }
    return addLinearRangeToMerged(merged, normalizedTarget);
}
export function resolveLinearSelectionUpdate(input) {
    const normalizedRanges = mergeLinearRanges(input.ranges);
    if (!normalizedRanges.length) {
        return emptyLinearSelectionState();
    }
    if (input.activeRangeIndex < 0 || input.activeRangeIndex >= normalizedRanges.length) {
        throw new Error(`Linear selection invariant violated: activeRangeIndex ${input.activeRangeIndex} is invalid for ${normalizedRanges.length} range(s)`);
    }
    const activeRangeIndex = clampIndex(input.activeRangeIndex, 0, normalizedRanges.length - 1);
    const activeRange = normalizedRanges[activeRangeIndex];
    const anchor = resolvePoint(input.anchor, activeRange.start, activeRange);
    const focus = resolvePoint(input.focus, activeRange.end, activeRange);
    return {
        ranges: normalizedRanges,
        activeRangeIndex,
        anchor,
        focus,
    };
}
export function selectLinearIndex(input) {
    const target = sanitizeIndex(input.index);
    return resolveLinearSelectionUpdate({
        ranges: [{ start: target, end: target }],
        activeRangeIndex: 0,
        anchor: target,
        focus: target,
    });
}
export function extendLinearSelectionToIndex(input) {
    var _a, _b, _c;
    const { state } = input;
    if (!state.ranges.length) {
        return selectLinearIndex({ index: input.index });
    }
    const activeIndex = clampIndex(state.activeRangeIndex < 0 ? 0 : state.activeRangeIndex, 0, state.ranges.length - 1);
    const anchor = (_c = (_a = state.anchor) !== null && _a !== void 0 ? _a : (_b = state.ranges[activeIndex]) === null || _b === void 0 ? void 0 : _b.start) !== null && _c !== void 0 ? _c : sanitizeIndex(input.index);
    const focus = sanitizeIndex(input.index);
    const nextRange = normalizeLinearRange({ start: anchor, end: focus });
    const ranges = state.ranges.slice();
    ranges[activeIndex] = nextRange;
    return resolveLinearSelectionUpdate({
        ranges,
        activeRangeIndex: activeIndex,
        anchor,
        focus,
    });
}
export function toggleLinearIndex(input) {
    var _a;
    const focus = sanitizeIndex(input.index);
    const nextRanges = toggleLinearRange(input.state.ranges, { start: focus, end: focus });
    if (!nextRanges.length) {
        return emptyLinearSelectionState();
    }
    const maxIndex = nextRanges.length - 1;
    const preferredIndex = input.state.activeRangeIndex >= 0 ? input.state.activeRangeIndex : maxIndex;
    const activeRangeIndex = clampIndex(preferredIndex, 0, maxIndex);
    const anchor = (_a = input.state.anchor) !== null && _a !== void 0 ? _a : focus;
    return resolveLinearSelectionUpdate({
        ranges: nextRanges,
        activeRangeIndex,
        anchor,
        focus,
    });
}
export function clearLinearSelection() {
    return emptyLinearSelectionState();
}
export function emptyLinearSelectionState() {
    return {
        ranges: [],
        activeRangeIndex: -1,
        anchor: null,
        focus: null,
    };
}
function sanitizeIndex(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.trunc(value);
}
function mergeSortedLinearRanges(sortedRanges) {
    const merged = [];
    for (const range of sortedRanges) {
        const last = merged[merged.length - 1];
        if (!last) {
            merged.push({ ...range });
            continue;
        }
        if (range.start <= last.end + 1) {
            last.end = Math.max(last.end, range.end);
            continue;
        }
        merged.push({ ...range });
    }
    return merged;
}
function addLinearRangeToMerged(mergedRanges, next) {
    const result = [];
    let mergedNext = { ...next };
    let inserted = false;
    for (const range of mergedRanges) {
        if (range.end + 1 < mergedNext.start) {
            result.push({ ...range });
            continue;
        }
        if (mergedNext.end + 1 < range.start) {
            if (!inserted) {
                result.push(mergedNext);
                inserted = true;
            }
            result.push({ ...range });
            continue;
        }
        mergedNext = {
            start: Math.min(mergedNext.start, range.start),
            end: Math.max(mergedNext.end, range.end),
        };
    }
    if (!inserted) {
        result.push(mergedNext);
    }
    return result;
}
function removeLinearRangeFromMerged(mergedRanges, normalizedTarget) {
    const result = [];
    for (const range of mergedRanges) {
        const pieces = subtractLinearRange(range, normalizedTarget);
        for (const piece of pieces) {
            result.push(piece);
        }
    }
    return result;
}
function subtractLinearRange(base, removal) {
    if (base.start > removal.end || base.end < removal.start) {
        return [{ ...base }];
    }
    const pieces = [];
    if (removal.start > base.start) {
        pieces.push({ start: base.start, end: Math.min(removal.start - 1, base.end) });
    }
    if (removal.end < base.end) {
        pieces.push({ start: Math.max(removal.end + 1, base.start), end: base.end });
    }
    return pieces.filter(piece => piece.start <= piece.end);
}
function resolvePoint(value, fallback, bounds) {
    if (value === undefined) {
        return fallback;
    }
    if (value === null) {
        return null;
    }
    return Math.trunc(clampScalar(value, bounds.start, bounds.end));
}
