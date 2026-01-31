export const SIDES = ["bottom", "top", "right", "left"];
export const ALIGNMENTS = ["start", "center", "end"];
export function clamp(value, min, max) {
    if (min > max)
        return value;
    return Math.min(Math.max(value, min), max);
}
export function sideAxis(side) {
    return side === "left" || side === "right" ? "x" : "y";
}
export function crossAxis(side) {
    return sideAxis(side) === "x" ? "y" : "x";
}
