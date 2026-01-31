export class SurfaceStateMachine {
    constructor(initialOpen = false) {
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.state = { open: initialOpen };
    }
    get snapshot() {
        return { ...this.state };
    }
    open() {
        if (this.state.open) {
            return { changed: false, state: this.snapshot };
        }
        this.state = { open: true };
        return { changed: true, state: this.snapshot };
    }
    close() {
        if (!this.state.open) {
            return { changed: false, state: this.snapshot };
        }
        this.state = { open: false };
        return { changed: true, state: this.snapshot };
    }
    toggle() {
        return this.state.open ? this.close() : this.open();
    }
}
