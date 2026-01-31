export class SurfaceTimers {
    constructor(options) {
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
        Object.defineProperty(this, "openTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "closeTimer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
    }
    scheduleOpen(callback) {
        if (this.openTimer) {
            clearTimeout(this.openTimer);
        }
        this.openTimer = setTimeout(() => {
            this.openTimer = null;
            callback();
        }, this.options.openDelay);
    }
    scheduleClose(callback) {
        if (this.closeTimer) {
            clearTimeout(this.closeTimer);
        }
        this.closeTimer = setTimeout(() => {
            this.closeTimer = null;
            callback();
        }, this.options.closeDelay);
    }
    cancelOpen() {
        if (!this.openTimer)
            return;
        clearTimeout(this.openTimer);
        this.openTimer = null;
    }
    cancelClose() {
        if (!this.closeTimer)
            return;
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
    }
    clearAll() {
        this.cancelOpen();
        this.cancelClose();
    }
}
