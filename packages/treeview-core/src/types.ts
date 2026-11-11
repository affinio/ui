export type TreeviewNode<Value = string> = Readonly<{
  value: Value
  parent: Value | null
  disabled?: boolean
  text?: string
}>

export type TreeviewState<Value = string> = {
  active: Value | null
  selected: Value | null
  selectedValues?: Value[]
  anchorValue?: Value | null
  expanded: Value[]
}

export type TreeviewSnapshot<Value = string> = Readonly<{
  active: Value | null
  focusedValue: Value | null
  selected: Value | null
  selectedValues: ReadonlyArray<Value>
  anchorValue: Value | null
  expanded: ReadonlyArray<Value>
}>

export type TreeviewSubscriber<Value = string> = (state: TreeviewSnapshot<Value>) => void

export type TreeviewNodeMeta<Value = string> = Readonly<{
  value: Value
  parent: Value | null
  depth: number
  childCount: number
  disabled: boolean
  expanded: boolean
  selected: boolean
  active: boolean
  matched: boolean
}>

export type TreeviewOptions<Value = string> = {
  nodes?: ReadonlyArray<TreeviewNode<Value>>
  defaultActive?: Value | null
  defaultSelected?: Value | null
  selectionMode?: "single" | "multiple"
  defaultExpanded?: ReadonlyArray<Value>
  loop?: boolean
  textAccessor?: (node: TreeviewNode<Value>) => string
}

export type TreeviewSelectionModifiers = Readonly<{
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}>

export type TreeviewDropPosition = "before" | "inside" | "after"
export type TreeviewClipboardAction = "copy" | "cut" | "paste"

export type TreeviewDropIntent<Value = string> = Readonly<{
  sourceValues: ReadonlyArray<Value>
  targetValue: Value
  position: TreeviewDropPosition
}>

export type TreeviewInteractionEvent<Value = string> =
  | Readonly<{ type: "drag-start"; sourceValues: ReadonlyArray<Value> }>
  | Readonly<{ type: "drag-over" } & TreeviewDropIntent<Value>>
  | Readonly<{ type: "drop-accepted" | "drop-rejected" } & TreeviewDropIntent<Value>>
  | Readonly<{ type: "drag-cancel"; sourceValues: ReadonlyArray<Value> }>
  | Readonly<{ type: "clipboard"; action: TreeviewClipboardAction; selectedValues: ReadonlyArray<Value>; targetValue: Value | null }>

export type TreeviewInteractionSubscriber<Value = string> = (event: TreeviewInteractionEvent<Value>) => void

export type TreeviewRegisterMode = "replace" | "patch"

export type TreeviewRegisterOptions = {
  emit?: boolean
  mode?: TreeviewRegisterMode
}

export type TreeviewRegisterResult = Readonly<{
  changed: boolean
  topologyChanged: boolean
}>

export type TreeviewActionFailureReason =
  | "missing-node"
  | "disabled-node"
  | "not-visible"
  | "leaf-node"
  | "no-focusable-node"
  | "boundary"

export type TreeviewActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; changed: false; reason: TreeviewActionFailureReason }
