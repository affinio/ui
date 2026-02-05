import type { ListboxState } from "@affino/listbox-core"
import type { OverlayKind } from "@affino/overlay-kernel"

export type ComboboxMode = "single" | "multiple"

export type CloseComboboxOptions = {
  restoreInput?: boolean
  silentFilterReset?: boolean
}

export type Cleanup = () => void

export type ComboboxSnapshot = {
  open: boolean
  filter: string
  state: ListboxState
  values: string[]
}

export type ComboboxHandle = {
  open(): void
  close(): void
  toggle(): void
  selectIndex(index: number, options?: { extend?: boolean; toggle?: boolean }): void
  selectValue(value: string): void
  clear(): void
  getSnapshot(): ComboboxSnapshot
}

export type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoComboboxRoot?: string
    affinoComboboxMode?: string
    affinoComboboxLoop?: string
    affinoComboboxDisabled?: string
    affinoComboboxPlaceholder?: string
    affinoComboboxModel?: string
    affinoComboboxState?: string
    affinoComboboxPinned?: string
    affinoComboboxOpenPointer?: string
    affinoComboboxOverlayKind?: OverlayKind
  }
  affinoCombobox?: ComboboxHandle
}

export type InputEl = HTMLInputElement & {
  dataset: DOMStringMap & {
    affinoComboboxInput?: string
    affinoComboboxFilter?: string
  }
}

export type SurfaceEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoComboboxSurface?: string
  }
}

export type OptionEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoListboxValue?: string
    affinoListboxLabel?: string
    affinoListboxOptionSelected?: string
    affinoListboxDisabled?: string
    affinoComboboxHidden?: string
    affinoComboboxOptionId?: string
    affinoComboboxIndex?: string
  }
}

export type OptionSnapshot = {
  index: number
  value: string
  label: string
}
