export type KnownOverlayKind = "dialog" | "popover" | "tooltip" | "combobox" | "menu" | "context-menu" | "listbox" | "surface";
export type OverlayKind = KnownOverlayKind | (string & {});
export type OverlayPhase = "idle" | "opening" | "open" | "closing" | "closed";
export type OverlayOpenReason = "programmatic" | "user" | "owner-open" | (string & {});
export type OverlayCloseReason = "programmatic" | "pointer-outside" | "escape-key" | "owner-close" | "focus-loss" | (string & {});
export interface OverlayEntryInit {
    id: string;
    kind: OverlayKind;
    root?: HTMLElement | null;
    ownerId?: string | null;
    modal?: boolean;
    trapsFocus?: boolean;
    blocksPointerOutside?: boolean;
    inertSiblings?: boolean;
    returnFocus?: boolean;
    priority?: number;
    state?: OverlayPhase;
    data?: Record<string, unknown>;
}
export interface OverlayEntry {
    id: string;
    kind: OverlayKind;
    root: HTMLElement | null;
    ownerId: string | null;
    modal: boolean;
    trapsFocus: boolean;
    blocksPointerOutside: boolean;
    inertSiblings: boolean;
    returnFocus: boolean;
    priority: number;
    state: OverlayPhase;
    data?: Record<string, unknown>;
    createdAt: number;
}
export type OverlayEntryPatch = Partial<Omit<OverlayEntry, "id" | "kind" | "createdAt">>;
export type OverlayKernelEvent = {
    type: "stack-changed";
    stack: readonly OverlayEntry[];
} | {
    type: "close-requested";
    entry: OverlayEntry | null;
    reason: OverlayCloseReason;
} | {
    type: "open-requested";
    entry: OverlayEntry | null;
    reason: OverlayOpenReason;
};
export type OverlayKernelEventType = OverlayKernelEvent["type"];
export type OverlayKernelListener<Event extends OverlayKernelEvent = OverlayKernelEvent> = (event: Event) => void;
export interface OverlayRegistrationHandle {
    getEntry(): OverlayEntry;
    update(patch: OverlayEntryPatch): void;
    unregister(): void;
}
export interface StickyDependentsOptions {
    reopenReason?: OverlayOpenReason;
    filter?(entry: OverlayEntry): boolean;
}
export interface StickyDependentsController {
    snapshot(): void;
    restore(): void;
    clear(): void;
    getSnapshot(): readonly string[];
}
export interface OverlayManagerOptions {
    document?: Document | null;
    clock?: () => number;
}
export interface OverlayManager {
    readonly document: Document | null;
    register(init: OverlayEntryInit): OverlayRegistrationHandle;
    unregister(id: string): void;
    update(id: string, patch: OverlayEntryPatch): void;
    requestClose(id: string, reason: OverlayCloseReason): void;
    requestOpen(id: string, reason: OverlayOpenReason): void;
    isTopMost(id: string): boolean;
    getEntry(id: string): OverlayEntry | null;
    getStack(): readonly OverlayEntry[];
    on<Event extends OverlayKernelEvent>(type: Event["type"], listener: OverlayKernelListener<Event>): () => void;
    onStackChanged(listener: OverlayKernelListener<{
        type: "stack-changed";
        stack: readonly OverlayEntry[];
    }>): () => void;
    onCloseRequested(listener: OverlayKernelListener<{
        type: "close-requested";
        entry: OverlayEntry | null;
        reason: OverlayCloseReason;
    }>): () => void;
    onOpenRequested(listener: OverlayKernelListener<{
        type: "open-requested";
        entry: OverlayEntry | null;
        reason: OverlayOpenReason;
    }>): () => void;
}
export declare class DefaultOverlayManager implements OverlayManager {
    readonly document: Document | null;
    private readonly clock;
    private readonly entries;
    private readonly stack;
    private readonly listeners;
    constructor(options?: OverlayManagerOptions);
    register(init: OverlayEntryInit): OverlayRegistrationHandle;
    unregister(id: string): void;
    update(id: string, patch: OverlayEntryPatch): void;
    requestClose(id: string, reason: OverlayCloseReason): void;
    requestOpen(id: string, reason: OverlayOpenReason): void;
    isTopMost(id: string): boolean;
    getEntry(id: string): OverlayEntry | null;
    getStack(): readonly OverlayEntry[];
    on<Event extends OverlayKernelEvent>(type: Event["type"], listener: OverlayKernelListener<Event>): () => void;
    onStackChanged(listener: OverlayKernelListener<{
        type: "stack-changed";
        stack: readonly OverlayEntry[];
    }>): () => void;
    onCloseRequested(listener: OverlayKernelListener<{
        type: "close-requested";
        entry: OverlayEntry | null;
        reason: OverlayCloseReason;
    }>): () => void;
    onOpenRequested(listener: OverlayKernelListener<{
        type: "open-requested";
        entry: OverlayEntry | null;
        reason: OverlayOpenReason;
    }>): () => void;
    private createEntry;
    private activateEntry;
    private deactivateEntry;
    private canActivate;
    private canClose;
    private canOpen;
    private isActiveEntry;
    private resolveTopMost;
    private resortStack;
    private compareEntries;
    private isAncestor;
    private getDescendants;
    private activateDependents;
    private emitStackChanged;
    private emit;
    private cloneEntry;
    private requireEntry;
}
export declare function createOverlayManager(options?: OverlayManagerOptions): OverlayManager;
export declare function getDocumentOverlayManager(doc?: Document | null): OverlayManager;
export declare function createStickyDependentsController(manager: OverlayManager, ownerId: string, options?: StickyDependentsOptions): StickyDependentsController;
//# sourceMappingURL=index.d.ts.map