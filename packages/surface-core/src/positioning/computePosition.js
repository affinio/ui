import { ALIGNMENTS, clamp, crossAxis, sideAxis, SIDES } from "./geometry";
const DEFAULT_VIEWPORT = 10000;
export function computePosition(anchor, surface, options = {}) {
    var _a, _b, _c, _d, _e, _f;
    const config = {
        gutter: (_a = options.gutter) !== null && _a !== void 0 ? _a : 6,
        viewportPadding: (_b = options.viewportPadding) !== null && _b !== void 0 ? _b : 8,
        placement: (_c = options.placement) !== null && _c !== void 0 ? _c : "auto",
        align: (_d = options.align) !== null && _d !== void 0 ? _d : "auto",
        viewportWidth: (_e = options.viewportWidth) !== null && _e !== void 0 ? _e : DEFAULT_VIEWPORT,
        viewportHeight: (_f = options.viewportHeight) !== null && _f !== void 0 ? _f : DEFAULT_VIEWPORT,
    };
    const candidateSides = config.placement === "auto" ? [...SIDES] : [config.placement];
    let best = null;
    for (const side of candidateSides) {
        const alignments = config.align === "auto" ? [...ALIGNMENTS] : [config.align];
        for (const alignment of alignments) {
            const { left, top } = resolvePosition(anchor, surface, side, alignment, config.gutter);
            const overflow = measureOverflow(left, top, surface, config);
            if (!best || overflow < best.overflow) {
                best = { overflow, left, top, placement: side, align: alignment };
            }
            if (overflow === 0 && config.placement !== "auto" && config.align !== "auto") {
                break;
            }
        }
        if (best && best.overflow === 0 && config.placement !== "auto") {
            break;
        }
    }
    if (!best) {
        best = { left: anchor.x, top: anchor.y, placement: "right", align: "start", overflow: Number.POSITIVE_INFINITY };
    }
    return {
        left: clamp(best.left, config.viewportPadding, config.viewportWidth - config.viewportPadding - surface.width),
        top: clamp(best.top, config.viewportPadding, config.viewportHeight - config.viewportPadding - surface.height),
        placement: best.placement,
        align: best.align,
    };
}
function resolvePosition(anchor, surface, side, alignment, gutter) {
    const axis = sideAxis(side);
    const cross = crossAxis(side);
    const main = axis === "x" ? "left" : "top";
    const crossProp = cross === "x" ? "left" : "top";
    const coords = { left: 0, top: 0 };
    if (axis === "x") {
        coords.left = side === "right" ? anchor.x + anchor.width + gutter : anchor.x - surface.width - gutter;
    }
    else {
        coords.top = side === "bottom" ? anchor.y + anchor.height + gutter : anchor.y - surface.height - gutter;
    }
    const anchorSize = cross === "x" ? anchor.width : anchor.height;
    const surfaceSize = cross === "x" ? surface.width : surface.height;
    let offset;
    switch (alignment) {
        case "center":
            offset = anchorSize / 2 - surfaceSize / 2;
            break;
        case "end":
            offset = anchorSize - surfaceSize;
            break;
        default:
            offset = 0;
    }
    coords[crossProp] = (cross === "x" ? anchor.x : anchor.y) + offset;
    return coords;
}
function measureOverflow(left, top, surface, config) {
    const { viewportPadding, viewportWidth, viewportHeight } = config;
    const overflowLeft = Math.max(0, viewportPadding - left);
    const overflowTop = Math.max(0, viewportPadding - top);
    const overflowRight = Math.max(0, left + surface.width + viewportPadding - viewportWidth);
    const overflowBottom = Math.max(0, top + surface.height + viewportPadding - viewportHeight);
    return overflowLeft + overflowTop + overflowRight + overflowBottom;
}
