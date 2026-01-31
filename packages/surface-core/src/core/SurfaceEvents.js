export class SurfaceEvents {
    constructor(surfaceId, callbacks = {}) {
        Object.defineProperty(this, "surfaceId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: surfaceId
        });
        Object.defineProperty(this, "callbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: callbacks
        });
    }
    emitOpen() {
        var _a, _b;
        (_b = (_a = this.callbacks).onOpen) === null || _b === void 0 ? void 0 : _b.call(_a, this.surfaceId);
    }
    emitClose() {
        var _a, _b;
        (_b = (_a = this.callbacks).onClose) === null || _b === void 0 ? void 0 : _b.call(_a, this.surfaceId);
    }
    emitPosition(position) {
        var _a, _b;
        (_b = (_a = this.callbacks).onPositionChange) === null || _b === void 0 ? void 0 : _b.call(_a, this.surfaceId, position);
    }
}
