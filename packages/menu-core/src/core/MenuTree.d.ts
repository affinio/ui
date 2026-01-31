export interface MenuTreeState {
    openPath: string[];
    activePath: string[];
}
type TreeListener = (state: MenuTreeState) => void;
/**
 * Lightweight representation of the hierarchical menu structure. Nodes register themselves and
 * the tree keeps two pieces of derived state: the currently open chain of menus and the path of
 * highlighted submenu triggers. Consumers may subscribe to changes to coordinate complex closing
 * behaviour without ad-hoc parent subscriptions.
 */
export declare class MenuTree {
    private readonly nodes;
    private readonly listeners;
    private readonly itemToMenu;
    private openPath;
    private activePath;
    constructor(rootId: string);
    register(menuId: string, parentId: string | null, parentItemId: string | null): void;
    unregister(menuId: string): void;
    subscribe(menuId: string, listener: TreeListener): () => void;
    updateOpenState(menuId: string, open: boolean): void;
    updateHighlight(menuId: string, highlightedItemId: string | null): void;
    get snapshot(): MenuTreeState;
    private emit;
    private buildPath;
    private isDescendantOf;
}
export {};
//# sourceMappingURL=MenuTree.d.ts.map