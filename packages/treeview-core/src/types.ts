export type TreeviewNode<Value = string> = Readonly<{
  value: Value
  parent: Value | null
  disabled?: boolean
}>

export type TreeviewState<Value = string> = {
  active: Value | null
  selected: Value | null
  expanded: Value[]
}

export type TreeviewSnapshot<Value = string> = Readonly<{
  active: Value | null
  selected: Value | null
  expanded: ReadonlyArray<Value>
}>

export type TreeviewSubscriber<Value = string> = (state: TreeviewSnapshot<Value>) => void

export type TreeviewOptions<Value = string> = {
  nodes?: ReadonlyArray<TreeviewNode<Value>>
  defaultActive?: Value | null
  defaultSelected?: Value | null
  defaultExpanded?: ReadonlyArray<Value>
  loop?: boolean
}

export type TreeviewRegisterMode = "replace" | "patch"

export type TreeviewRegisterOptions = {
  emit?: boolean
  mode?: TreeviewRegisterMode
}

export type TreeviewActionFailureReason =
  | "missing-node"
  | "disabled-node"
  | "leaf-node"
  | "no-focusable-node"
  | "boundary"

export type TreeviewActionResult =
  | { ok: true; changed: boolean }
  | { ok: false; changed: false; reason: TreeviewActionFailureReason }
