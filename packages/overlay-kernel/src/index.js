const ACTIVE_PHASES = new Set(["opening", "open", "closing"]);
const DEFAULT_KIND_PRIORITIES = {
    dialog: 100,
    combobox: 80,
    menu: 70,
    "context-menu": 70,
    listbox: 60,
    popover: 40,
    tooltip: 10,
    surface: 5,
};
const DEFAULT_PRIORITY = 1;
export class DefaultOverlayManager {
    constructor(options = {}) {
        var _a, _b;
        Object.defineProperty(this, "document", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clock", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "entries", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "stack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "listeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        this.document = (_a = options.document) !== null && _a !== void 0 ? _a : null;
        this.clock = (_b = options.clock) !== null && _b !== void 0 ? _b : Date.now;
    }
    register(init) {
        if (this.entries.has(init.id)) {
            throw new Error(`[OverlayManager] Duplicate overlay id: ${init.id}`);
        }
        const entry = this.createEntry(init);
        this.entries.set(entry.id, entry);
        const stackChanged = this.isActiveEntry(entry) ? this.activateEntry(entry) : false;
        if (stackChanged) {
            this.emitStackChanged();
        }
        return {
            getEntry: () => this.requireEntry(entry.id),
            update: (patch) => this.update(entry.id, patch),
            unregister: () => this.unregister(entry.id),
        };
    }
    unregister(id) {
        const entry = this.entries.get(id);
        if (!entry) {
            return;
        }
        const descendants = this.getDescendants(entry);
        this.entries.delete(entry.id);
        descendants.forEach((descendant) => this.entries.delete(descendant.id));
        let stackChanged = this.deactivateEntry(entry);
        descendants.forEach((descendant) => {
            stackChanged = this.deactivateEntry(descendant) || stackChanged;
        });
        if (stackChanged) {
            this.emitStackChanged();
        }
    }
    update(id, patch) {
        const entry = this.entries.get(id);
        if (!entry) {
            return;
        }
        const previousState = entry.state;
        const previousPriority = entry.priority;
        const previousOwner = entry.ownerId;
        const nextPriority = patch.priority !== undefined ? resolvePriority(entry.kind, patch.priority) : entry.priority;
        Object.assign(entry, patch);
        entry.priority = nextPriority;
        let stackChanged = false;
        if (patch.ownerId !== undefined && entry.ownerId !== previousOwner) {
            if (!this.canActivate(entry)) {
                stackChanged = this.deactivateEntry(entry) || stackChanged;
            }
            else if (this.isActiveEntry(entry)) {
                stackChanged = this.activateEntry(entry) || stackChanged;
            }
        }
        if (patch.state !== undefined && patch.state !== previousState) {
            if (this.isActiveEntry(entry)) {
                stackChanged = this.activateEntry(entry) || stackChanged;
            }
            else {
                stackChanged = this.deactivateEntry(entry) || stackChanged;
            }
        }
        else if (patch.priority !== undefined && patch.priority !== previousPriority && this.stack.includes(entry)) {
            this.resortStack();
            stackChanged = true;
        }
        if (stackChanged) {
            this.emitStackChanged();
        }
    }
    requestClose(id, reason) {
        const entry = this.entries.get(id);
        if (!entry) {
            this.emit({ type: "close-requested", entry: null, reason });
            return;
        }
        if (!this.canClose(entry, reason)) {
            return;
        }
        const descendants = this.getDescendants(entry);
        if (descendants.length) {
            const subtreeIds = new Set([entry.id, ...descendants.map((descendant) => descendant.id)]);
            for (let index = this.stack.length - 1; index >= 0; index -= 1) {
                const candidate = this.stack[index];
                if (!candidate || candidate.id === entry.id) {
                    continue;
                }
                if (subtreeIds.has(candidate.id)) {
                    this.emit({ type: "close-requested", entry: candidate, reason: "owner-close" });
                }
            }
        }
        this.emit({ type: "close-requested", entry, reason });
    }
    requestOpen(id, reason) {
        const entry = this.entries.get(id);
        if (!entry) {
            this.emit({ type: "open-requested", entry: null, reason });
            return;
        }
        if (!this.canOpen(entry, reason)) {
            return;
        }
        this.emit({ type: "open-requested", entry, reason });
    }
    isTopMost(id) {
        const top = this.resolveTopMost();
        return (top === null || top === void 0 ? void 0 : top.id) === id;
    }
    getEntry(id) {
        var _a;
        return (_a = this.entries.get(id)) !== null && _a !== void 0 ? _a : null;
    }
    getStack() {
        return [...this.stack];
    }
    on(type, listener) {
        var _a;
        const bucket = (_a = this.listeners.get(type)) !== null && _a !== void 0 ? _a : new Set();
        bucket.add(listener);
        this.listeners.set(type, bucket);
        return () => {
            bucket.delete(listener);
            if (!bucket.size) {
                this.listeners.delete(type);
            }
        };
    }
    onStackChanged(listener) {
        return this.on("stack-changed", listener);
    }
    onCloseRequested(listener) {
        return this.on("close-requested", listener);
    }
    onOpenRequested(listener) {
        return this.on("open-requested", listener);
    }
    createEntry(init) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return {
            id: init.id,
            kind: init.kind,
            root: (_a = init.root) !== null && _a !== void 0 ? _a : null,
            ownerId: (_b = init.ownerId) !== null && _b !== void 0 ? _b : null,
            modal: (_c = init.modal) !== null && _c !== void 0 ? _c : false,
            trapsFocus: (_d = init.trapsFocus) !== null && _d !== void 0 ? _d : false,
            blocksPointerOutside: (_e = init.blocksPointerOutside) !== null && _e !== void 0 ? _e : Boolean(init.modal),
            inertSiblings: (_f = init.inertSiblings) !== null && _f !== void 0 ? _f : false,
            returnFocus: (_g = init.returnFocus) !== null && _g !== void 0 ? _g : true,
            priority: resolvePriority(init.kind, init.priority),
            state: (_h = init.state) !== null && _h !== void 0 ? _h : "idle",
            data: init.data,
            createdAt: this.clock(),
        };
    }
    activateEntry(entry) {
        if (this.stack.includes(entry)) {
            return false;
        }
        if (!this.canActivate(entry)) {
            return false;
        }
        this.stack.push(entry);
        this.resortStack();
        this.activateDependents(entry);
        return true;
    }
    deactivateEntry(entry) {
        let changed = false;
        for (let index = this.stack.length - 1; index >= 0; index -= 1) {
            const candidate = this.stack[index];
            if (!candidate) {
                continue;
            }
            if (candidate === entry || this.isAncestor(entry, candidate)) {
                this.stack.splice(index, 1);
                changed = true;
            }
        }
        return changed;
    }
    canActivate(entry) {
        if (!entry.ownerId) {
            return true;
        }
        const owner = this.entries.get(entry.ownerId);
        return Boolean(owner && this.isActiveEntry(owner));
    }
    canClose(entry, _reason) {
        return this.isActiveEntry(entry);
    }
    canOpen(entry, _reason) {
        return this.canActivate(entry);
    }
    isActiveEntry(entry) {
        return isActivePhase(entry.state);
    }
    resolveTopMost() {
        for (let index = this.stack.length - 1; index >= 0; index -= 1) {
            const entry = this.stack[index];
            if (!entry) {
                continue;
            }
            if (!this.isActiveEntry(entry)) {
                continue;
            }
            if (!this.canActivate(entry)) {
                continue;
            }
            return entry;
        }
        return null;
    }
    resortStack() {
        this.stack.sort((a, b) => this.compareEntries(a, b));
    }
    compareEntries(a, b) {
        if (a.id === b.id) {
            return 0;
        }
        if (this.isAncestor(a, b)) {
            return -1;
        }
        if (this.isAncestor(b, a)) {
            return 1;
        }
        if (a.priority === b.priority) {
            return a.createdAt - b.createdAt;
        }
        return a.priority - b.priority;
    }
    isAncestor(potentialAncestor, candidate) {
        var _a, _b;
        if (potentialAncestor.id === candidate.id) {
            return false;
        }
        let cursor = candidate.ownerId ? (_a = this.entries.get(candidate.ownerId)) !== null && _a !== void 0 ? _a : null : null;
        while (cursor) {
            if (cursor.id === potentialAncestor.id) {
                return true;
            }
            cursor = cursor.ownerId ? (_b = this.entries.get(cursor.ownerId)) !== null && _b !== void 0 ? _b : null : null;
        }
        return false;
    }
    getDescendants(entry) {
        const result = [];
        this.entries.forEach((candidate) => {
            if (candidate.id !== entry.id && this.isAncestor(entry, candidate)) {
                result.push(candidate);
            }
        });
        return result;
    }
    activateDependents(entry) {
        this.entries.forEach((candidate) => {
            if (candidate.ownerId === entry.id && this.isActiveEntry(candidate)) {
                this.activateEntry(candidate);
            }
        });
    }
    emitStackChanged() {
        const clonedStack = this.getStack().map((entry) => this.cloneEntry(entry));
        this.emit({ type: "stack-changed", stack: clonedStack });
    }
    emit(event) {
        const listeners = this.listeners.get(event.type);
        if (!(listeners === null || listeners === void 0 ? void 0 : listeners.size)) {
            return;
        }
        listeners.forEach((listener) => {
            listener(event);
        });
    }
    cloneEntry(entry) {
        return { ...entry };
    }
    requireEntry(id) {
        const entry = this.entries.get(id);
        if (!entry) {
            throw new Error(`[OverlayManager] Overlay not registered: ${id}`);
        }
        return entry;
    }
}
const documentManagers = typeof WeakMap !== "undefined" ? new WeakMap() : null;
export function createOverlayManager(options) {
    return new DefaultOverlayManager(options);
}
export function getDocumentOverlayManager(doc) {
    if (!doc || !documentManagers) {
        return createOverlayManager();
    }
    const cached = documentManagers.get(doc);
    if (cached) {
        return cached;
    }
    const manager = new DefaultOverlayManager({ document: doc });
    documentManagers.set(doc, manager);
    return manager;
}
export function createStickyDependentsController(manager, ownerId, options = {}) {
    var _a;
    const reopenReason = (_a = options.reopenReason) !== null && _a !== void 0 ? _a : "owner-open";
    let snapshot = [];
    function collectSnapshot() {
        return collectActiveDependents(manager, ownerId, options.filter).map((entry) => entry.id);
    }
    return {
        snapshot() {
            snapshot = collectSnapshot();
        },
        restore() {
            snapshot.forEach((dependentId) => {
                manager.requestOpen(dependentId, reopenReason);
            });
        },
        clear() {
            snapshot = [];
        },
        getSnapshot() {
            return [...snapshot];
        },
    };
}
function resolvePriority(kind, requested) {
    if (typeof requested === "number" && Number.isFinite(requested)) {
        return requested;
    }
    const preset = DEFAULT_KIND_PRIORITIES[kind];
    return typeof preset === "number" ? preset : DEFAULT_PRIORITY;
}
function isActivePhase(phase) {
    return ACTIVE_PHASES.has(phase);
}
function collectActiveDependents(manager, ownerId, filter) {
    const stack = manager.getStack();
    return stack.filter((entry) => {
        if (entry.id === ownerId) {
            return false;
        }
        if (!isActivePhase(entry.state)) {
            return false;
        }
        if (!isDescendantOf(manager, ownerId, entry)) {
            return false;
        }
        return filter ? Boolean(filter(entry)) : true;
    });
}
function isDescendantOf(manager, ownerId, candidate) {
    let cursor = candidate;
    while (cursor === null || cursor === void 0 ? void 0 : cursor.ownerId) {
        if (cursor.ownerId === ownerId) {
            return true;
        }
        cursor = manager.getEntry(cursor.ownerId);
    }
    return false;
}
