import type { MenuCallbacks } from "../types";
export declare class MenuEvents {
    private readonly menuId;
    private readonly callbacks;
    constructor(menuId: string, callbacks?: MenuCallbacks);
    emitSelect(itemId: string): void;
    emitHighlight(itemId: string | null): void;
}
//# sourceMappingURL=Events.d.ts.map