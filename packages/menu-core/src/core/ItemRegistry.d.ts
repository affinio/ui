interface ItemEntry {
    id: string;
    disabled: boolean;
    order: number;
}
export interface RegistrationResult {
    created: boolean;
    disabled: boolean;
}
/**
 * Maintains the list of registered menu items with deterministic ordering. The registry is
 * intentionally opinionated: duplicate IDs are rejected unless the caller explicitly marks an
 * operation as an update, ensuring bugs surface early during development.
 */
export declare class ItemRegistry {
    private readonly items;
    private orderCursor;
    register(id: string, disabled: boolean, allowUpdate?: boolean): RegistrationResult;
    unregister(id: string): boolean;
    has(id: string): boolean;
    updateDisabled(id: string, disabled: boolean): void;
    getOrderedItems(): ItemEntry[];
    getEnabledItemIds(): string[];
    isDisabled(id: string): boolean;
}
export {};
//# sourceMappingURL=ItemRegistry.d.ts.map