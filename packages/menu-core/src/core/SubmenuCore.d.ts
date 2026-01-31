import { MenuCore } from "./MenuCore";
import type { ItemProps, MenuCallbacks, MenuOptions, PanelProps, Rect, TriggerProps } from "../types";
export interface SubmenuOptions extends MenuOptions {
    parentItemId: string;
}
export declare class SubmenuCore extends MenuCore {
    protected autoHighlightOnOpen: boolean;
    private readonly parent;
    private readonly parentItemId;
    private readonly predictor;
    private triggerRect;
    private panelRect;
    private releaseTree;
    constructor(parent: MenuCore, options: SubmenuOptions, callbacks?: MenuCallbacks);
    destroy(): void;
    close(reason?: "pointer" | "keyboard" | "programmatic"): void;
    setTriggerRect(rect: Rect | null): void;
    setPanelRect(rect: Rect | null): void;
    recordPointer(point: {
        x: number;
        y: number;
    }): void;
    select(id: string): void;
    getTriggerProps(): TriggerProps;
    getPanelProps(): PanelProps;
    getItemProps(id: string): ItemProps;
    private syncWithTree;
    private closeAncestorChain;
    private shouldHoldPointer;
    private keepChainOpen;
    private handleNestedTriggerKeydown;
    private recordPointerFromEvent;
}
//# sourceMappingURL=SubmenuCore.d.ts.map