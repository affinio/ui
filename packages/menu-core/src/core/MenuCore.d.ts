import { SurfaceCore } from "@affino/surface-core";
import type { PointerEventLike, SurfaceReason, SurfaceState } from "@affino/surface-core";
import type { EventHandler, ItemProps, MenuCallbacks, MenuOptions, MenuState, PanelProps, TriggerProps, MousePredictionConfig } from "../types";
import type { HighlightChange } from "./StateMachine";
import { ItemRegistry } from "./ItemRegistry";
import { MenuStateMachine } from "./StateMachine";
import { MenuTree } from "./MenuTree";
interface NormalizedMenuOptions {
    closeOnSelect: boolean;
    loopFocus: boolean;
    mousePrediction: MousePredictionConfig;
}
interface ParentLink {
    parentId: string;
    parentItemId: string | null;
}
export declare class MenuCore extends SurfaceCore<MenuState, MenuCallbacks> {
    protected readonly registry: ItemRegistry;
    protected readonly selectionMachine: MenuStateMachine;
    protected readonly tree: MenuTree;
    protected readonly menuOptions: NormalizedMenuOptions;
    private readonly menuEvents;
    protected autoHighlightOnOpen: boolean;
    private pointerHighlightLock;
    constructor(options?: MenuOptions, callbacks?: MenuCallbacks, tree?: MenuTree, parentLink?: ParentLink);
    destroy(): void;
    protected composeState(surface: SurfaceState): MenuState;
    protected onOpened(_reason: SurfaceReason): void;
    protected onClosed(_reason: SurfaceReason): void;
    registerItem(id: string, options?: {
        disabled?: boolean;
    }): () => void;
    highlight(id: string | null): void;
    moveFocus(delta: 1 | -1): void;
    select(id: string): void;
    getTriggerProps(): TriggerProps;
    getPanelProps(): PanelProps;
    getItemProps(id: string): ItemProps;
    /** Shared tree instance for nested menus. */
    getTree(): MenuTree;
    isCloseOnSelectEnabled(): boolean;
    protected ensureInitialHighlight(): void;
    holdPointerHighlight(itemId: string, duration?: number): void;
    releasePointerHighlightHold(itemId?: string): void;
    protected shouldBlockPointerHighlight(targetId: string): boolean;
    protected handlePointerEnter(event?: PointerEventLike): void;
    protected shouldIgnorePointerLeave(event?: PointerEventLike): boolean;
    protected handleHighlightChange(change: HighlightChange): boolean;
    protected handleTriggerKeydown: EventHandler<KeyboardEvent>;
    protected handlePanelKeydown: EventHandler<KeyboardEvent>;
    protected handleItemKeydown(event: KeyboardEvent, id: string, disabled: boolean): void;
}
export {};
//# sourceMappingURL=MenuCore.d.ts.map