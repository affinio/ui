import type { MenuState } from "../types";
export interface HighlightChange {
    changed: boolean;
    previous: string | null;
    current: string | null;
}
export declare class MenuStateMachine {
    private readonly options;
    private activeItemId;
    private pendingInitialHighlight;
    constructor(options: {
        loopFocus: boolean;
        closeOnSelect: boolean;
    });
    get snapshot(): Pick<MenuState, "activeItemId">;
    reset(): void;
    highlight(id: string | null, enabledItemIds: readonly string[]): HighlightChange;
    moveFocus(delta: 1 | -1, enabledItemIds: readonly string[]): HighlightChange;
    ensureInitialHighlight(enabledItemIds: readonly string[], isOpen: boolean): HighlightChange;
    handleItemsChanged(enabledItemIds: readonly string[], isOpen: boolean): HighlightChange;
    handleSelection(isOpen: boolean): {
        accepted: boolean;
        shouldClose: boolean;
    };
    private applyHighlight;
}
//# sourceMappingURL=StateMachine.d.ts.map