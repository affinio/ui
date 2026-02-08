import { clearLinearSelection, emptyLinearSelectionState, extendLinearSelectionToIndex, selectLinearIndex, toggleLinearIndex, } from "@affino/selection-core";
export function createListboxState(initial) {
    var _a, _b;
    return {
        selection: (_a = initial === null || initial === void 0 ? void 0 : initial.selection) !== null && _a !== void 0 ? _a : emptyLinearSelectionState(),
        activeIndex: (_b = initial === null || initial === void 0 ? void 0 : initial.activeIndex) !== null && _b !== void 0 ? _b : -1,
    };
}
export function moveListboxFocus(input) {
    var _a;
    const nextIndex = resolveTargetIndex(input.state.activeIndex, input.delta, input.context, (_a = input.loop) !== null && _a !== void 0 ? _a : false);
    if (nextIndex === -1 || nextIndex === input.state.activeIndex) {
        return input.state;
    }
    return activateListboxIndex({
        state: input.state,
        context: input.context,
        index: nextIndex,
        extend: input.extend,
    });
}
export function activateListboxIndex(input) {
    const count = resolveOptionCount(input.context);
    if (count <= 0) {
        return createListboxState();
    }
    const index = clampIndex(input.index, count);
    if (index === -1) {
        return input.state;
    }
    if (isIndexDisabled(input.context, index)) {
        return {
            selection: input.state.selection,
            activeIndex: index,
        };
    }
    let selection;
    if (input.toggle) {
        selection = toggleLinearIndex({ state: input.state.selection, index });
    }
    else if (input.extend) {
        selection = extendLinearSelectionToIndex({ state: input.state.selection, index });
    }
    else {
        selection = selectLinearIndex({ index });
    }
    return {
        selection,
        activeIndex: index,
    };
}
export function toggleActiveListboxOption(input) {
    const index = input.state.activeIndex;
    if (index < 0) {
        return input.state;
    }
    return {
        activeIndex: index,
        selection: toggleLinearIndex({ state: input.state.selection, index }),
    };
}
export function clearListboxSelection(input = {}) {
    const nextState = createListboxState();
    if (input.preserveActiveIndex && input.state) {
        nextState.activeIndex = input.state.activeIndex;
    }
    return nextState;
}
export function selectAllListboxOptions(input) {
    const enabledIndexes = buildEnabledIndexes(input.context);
    if (enabledIndexes.length === 0) {
        return createListboxState();
    }
    const first = enabledIndexes[0];
    const last = enabledIndexes[enabledIndexes.length - 1];
    let selection = selectLinearIndex({ index: first });
    selection = extendLinearSelectionToIndex({ state: selection, index: last });
    return {
        selection,
        activeIndex: last,
    };
}
function isIndexDisabled(context, index) {
    var _a, _b;
    try {
        return (_b = (_a = context.isDisabled) === null || _a === void 0 ? void 0 : _a.call(context, index)) !== null && _b !== void 0 ? _b : false;
    }
    catch {
        return false;
    }
}
function resolveOptionCount(context) {
    const raw = context.optionCount;
    if (!Number.isFinite(raw)) {
        return 0;
    }
    if (raw <= 0) {
        return 0;
    }
    return Math.trunc(raw);
}
function clampIndex(index, count) {
    if (count <= 0)
        return -1;
    if (!Number.isFinite(index)) {
        return index > 0 ? count - 1 : 0;
    }
    const next = Math.trunc(index);
    if (next < 0)
        return 0;
    if (next >= count)
        return count - 1;
    return next;
}
function resolveTargetIndex(currentIndex, delta, context, loop) {
    const count = resolveOptionCount(context);
    if (count <= 0) {
        return -1;
    }
    if (delta === 0 && currentIndex >= 0 && currentIndex < count && !isIndexDisabled(context, currentIndex)) {
        return currentIndex;
    }
    const enabledIndexes = buildEnabledIndexes(context);
    if (enabledIndexes.length === 0) {
        return -1;
    }
    if (!Number.isFinite(delta)) {
        return delta > 0 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
    }
    const direction = delta > 0 ? 1 : -1;
    let steps = Math.abs(Math.trunc(delta));
    let cursor = currentIndex;
    if (cursor < 0 || cursor >= count) {
        cursor = direction > 0 ? -1 : count;
    }
    if (steps === 0) {
        if (cursor === -1) {
            return direction > 0 ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
        }
        return cursor;
    }
    return navigateEnabledIndexes(cursor, direction, steps, enabledIndexes, loop);
}
function buildEnabledIndexes(context) {
    const count = resolveOptionCount(context);
    if (count <= 0)
        return [];
    const enabledIndexes = [];
    for (let index = 0; index < count; index += 1) {
        if (!isIndexDisabled(context, index)) {
            enabledIndexes.push(index);
        }
    }
    return enabledIndexes;
}
function navigateEnabledIndexes(cursor, direction, steps, enabledIndexes, loop) {
    const total = enabledIndexes.length;
    if (total === 0) {
        return cursor;
    }
    if (direction > 0) {
        let start = upperBound(enabledIndexes, cursor);
        if (start >= total) {
            if (!loop) {
                return cursor;
            }
            start = 0;
        }
        if (!loop) {
            const target = start + steps - 1;
            return enabledIndexes[target >= total ? total - 1 : target];
        }
        const target = (start + steps - 1) % total;
        return enabledIndexes[target];
    }
    let start = lowerBound(enabledIndexes, cursor) - 1;
    if (start < 0) {
        if (!loop) {
            return cursor;
        }
        start = total - 1;
    }
    if (!loop) {
        const target = start - (steps - 1);
        return enabledIndexes[target < 0 ? 0 : target];
    }
    const target = modulo(start - (steps - 1), total);
    return enabledIndexes[target];
}
function lowerBound(values, value) {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (values[mid] < value) {
            lo = mid + 1;
        }
        else {
            hi = mid;
        }
    }
    return lo;
}
function upperBound(values, value) {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (values[mid] <= value) {
            lo = mid + 1;
        }
        else {
            hi = mid;
        }
    }
    return lo;
}
function modulo(value, mod) {
    return ((value % mod) + mod) % mod;
}
