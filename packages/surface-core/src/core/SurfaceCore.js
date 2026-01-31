import { SurfaceEvents } from "./SurfaceEvents";
import { SurfaceTimers } from "./SurfaceTimers";
import { SurfaceStateMachine } from "./SurfaceStateMachine";
import { computePosition } from "../positioning/computePosition";
let idCounter = 0;
const DEFAULT_OPTIONS = {
    id: "",
    openDelay: 80,
    closeDelay: 150,
    defaultOpen: false,
};
export class SurfaceCore {
    constructor(options = {}, callbacks = {}) {
        var _a, _b;
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "callbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "stateMachine", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "subscribers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        const resolvedId = (_a = options.id) !== null && _a !== void 0 ? _a : `surface-${++idCounter}`;
        this.id = resolvedId;
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            id: resolvedId,
            defaultOpen: (_b = options.defaultOpen) !== null && _b !== void 0 ? _b : DEFAULT_OPTIONS.defaultOpen,
        };
        this.callbacks = callbacks;
        this.events = new SurfaceEvents(this.id, callbacks);
        this.timers = new SurfaceTimers({
            openDelay: this.options.openDelay,
            closeDelay: this.options.closeDelay,
        });
        this.stateMachine = new SurfaceStateMachine(this.options.defaultOpen);
    }
    destroy() {
        this.subscribers.clear();
        this.timers.clearAll();
    }
    getSnapshot() {
        return this.composeState(this.stateMachine.snapshot);
    }
    subscribe(listener) {
        this.subscribers.add(listener);
        listener(this.getSnapshot());
        return {
            unsubscribe: () => {
                this.subscribers.delete(listener);
            },
        };
    }
    open(reason = "programmatic") {
        const result = this.stateMachine.open();
        if (!result.changed)
            return;
        this.timers.cancelClose();
        this.events.emitOpen();
        this.onOpened(reason);
        this.emitState();
    }
    close(reason = "programmatic") {
        const result = this.stateMachine.close();
        if (!result.changed)
            return;
        this.timers.cancelOpen();
        this.events.emitClose();
        this.onClosed(reason);
        this.emitState();
    }
    toggle() {
        const result = this.stateMachine.toggle();
        if (!result.changed)
            return;
        if (result.state.open) {
            this.timers.cancelClose();
            this.events.emitOpen();
            this.onOpened("programmatic");
        }
        else {
            this.timers.cancelOpen();
            this.events.emitClose();
            this.onClosed("programmatic");
        }
        this.emitState();
    }
    computePosition(anchor, surface, options = {}) {
        const position = computePosition(anchor, surface, options);
        this.events.emitPosition(position);
        return position;
    }
    cancelPendingClose() {
        this.timers.cancelClose();
    }
    composeState(surface) {
        return surface;
    }
    get surfaceState() {
        return this.stateMachine.snapshot;
    }
    emitState() {
        const next = this.getSnapshot();
        this.subscribers.forEach((listener) => listener(next));
    }
    onOpened(_reason) { }
    onClosed(_reason) { }
    handlePointerEnter(_event) {
        this.timers.cancelClose();
    }
    shouldIgnorePointerLeave(_event) {
        return false;
    }
    handlePointerLeave(event) {
        if (this.shouldIgnorePointerLeave(event)) {
            this.cancelPendingClose();
            return;
        }
        this.timers.scheduleClose(() => this.close("pointer"));
    }
}
