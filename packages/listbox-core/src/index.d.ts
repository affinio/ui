import { type LinearSelectionState } from "@affino/selection-core";
export interface ListboxContext {
    optionCount: number;
    isDisabled?(index: number): boolean;
}
export interface ListboxState {
    selection: LinearSelectionState;
    activeIndex: number;
}
export declare function createListboxState(initial?: Partial<ListboxState>): ListboxState;
export interface MoveListboxFocusInput {
    state: ListboxState;
    context: ListboxContext;
    delta: number;
    extend?: boolean;
    loop?: boolean;
}
export declare function moveListboxFocus(input: MoveListboxFocusInput): ListboxState;
export interface ActivateListboxIndexInput {
    state: ListboxState;
    context: ListboxContext;
    index: number;
    extend?: boolean;
    toggle?: boolean;
}
export declare function activateListboxIndex(input: ActivateListboxIndexInput): ListboxState;
export interface ToggleActiveOptionInput {
    state: ListboxState;
}
export declare function toggleActiveListboxOption(input: ToggleActiveOptionInput): ListboxState;
export interface ClearListboxSelectionInput {
    preserveActiveIndex?: boolean;
    state?: ListboxState;
}
export declare function clearListboxSelection(input?: ClearListboxSelectionInput): ListboxState;
export interface SelectAllListboxOptionsInput {
    context: ListboxContext;
}
export declare function selectAllListboxOptions(input: SelectAllListboxOptionsInput): ListboxState;
//# sourceMappingURL=index.d.ts.map