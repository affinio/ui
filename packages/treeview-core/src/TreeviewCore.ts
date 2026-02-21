import { createProjectionStageEngine } from "@affino/projection-engine"
import type {
  TreeviewActionFailureReason,
  TreeviewActionResult,
  TreeviewNode,
  TreeviewOptions,
  TreeviewRegisterOptions,
  TreeviewSnapshot,
  TreeviewState,
  TreeviewSubscriber,
} from "./types"

type InternalNode<Value> = {
  value: Value
  parent: Value | null
  disabled: boolean
  children: Value[]
}

type TreeviewProjectionStage = "visible"

export class TreeviewCore<Value = string> {
  private nodes = new Map<Value, InternalNode<Value>>()
  private state: TreeviewState<Value>
  private snapshot: TreeviewSnapshot<Value>
  private subscribers = new Set<TreeviewSubscriber<Value>>()
  private visibleCache: Value[] | null = null
  private readonly visibleProjection = createProjectionStageEngine<TreeviewProjectionStage>({
    nodes: {
      visible: {},
    },
    refreshEntryStage: "visible",
  })
  private readonly loop: boolean

  constructor(options: TreeviewOptions<Value> = {}) {
    this.loop = options.loop ?? false
    this.state = {
      active: options.defaultActive ?? null,
      selected: options.defaultSelected ?? null,
      expanded: toUniqueList(options.defaultExpanded ?? []),
    }
    this.snapshot = this.createSnapshot(this.state)
    this.registerNodes(options.nodes ?? [], { emit: false })
    this.state = this.normalizeState(this.state)
    this.snapshot = this.createSnapshot(this.state)
  }

  registerNodes(
    nodes: ReadonlyArray<TreeviewNode<Value>>,
    options: TreeviewRegisterOptions = {},
  ): void {
    if (options.mode === "patch") {
      this.patchNodeMap(nodes)
    } else {
      this.nodes = this.buildNodeMap(nodes)
    }
    this.visibleCache = null
    this.visibleProjection.requestRefreshPass()
    const next = this.normalizeState(this.state)
    this.patch(next, options.emit ?? true)
  }

  select(value: Value): void {
    this.requestSelect(value)
  }

  requestSelect(value: Value): TreeviewActionResult {
    const node = this.nodes.get(value)
    if (!node || node.disabled) {
      return node ? actionFailure("disabled-node") : actionFailure("missing-node")
    }
    const previous = this.state
    const expanded = this.withExpandedPath(value)
    this.patch({
      active: value,
      selected: value,
      expanded: toUniqueList(expanded),
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  clearSelection(): void {
    this.patch({
      ...this.state,
      selected: null,
    })
  }

  focus(value: Value): void {
    this.requestFocus(value)
  }

  requestFocus(value: Value): TreeviewActionResult {
    const node = this.nodes.get(value)
    if (!node || node.disabled) {
      return node ? actionFailure("disabled-node") : actionFailure("missing-node")
    }
    const previous = this.state
    const expanded = this.withExpandedPath(value)
    this.patch({
      ...this.state,
      active: value,
      expanded: toUniqueList(expanded),
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  focusFirst(): void {
    this.requestFocusFirst()
  }

  requestFocusFirst(): TreeviewActionResult {
    const first = this.getFirstEnabledVisible()
    if (first === null) {
      return actionFailure("no-focusable-node")
    }
    const previous = this.state
    this.patch({
      ...this.state,
      active: first,
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  focusLast(): void {
    this.requestFocusLast()
  }

  requestFocusLast(): TreeviewActionResult {
    const last = this.getLastEnabledVisible()
    if (last === null) {
      return actionFailure("no-focusable-node")
    }
    const previous = this.state
    this.patch({
      ...this.state,
      active: last,
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  focusNext(): void {
    this.requestFocusNext()
  }

  requestFocusNext(): TreeviewActionResult {
    const visible = this.getVisibleValuesCached()
    if (!visible.length) {
      return actionFailure("no-focusable-node")
    }
    const currentIndex = visible.findIndex((value) => value === this.state.active)
    if (currentIndex === -1) {
      return this.requestFocusFirst()
    }
    const target = this.findAdjacentEnabledVisible(visible, currentIndex, 1)
    if (target === null) {
      if (!this.hasFocusableVisible(visible)) {
        return actionFailure("no-focusable-node")
      }
      return actionFailure("boundary")
    }
    const previous = this.state
    this.patch({
      ...this.state,
      active: target,
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  focusPrevious(): void {
    this.requestFocusPrevious()
  }

  requestFocusPrevious(): TreeviewActionResult {
    const visible = this.getVisibleValuesCached()
    if (!visible.length) {
      return actionFailure("no-focusable-node")
    }
    const currentIndex = visible.findIndex((value) => value === this.state.active)
    if (currentIndex === -1) {
      return this.requestFocusLast()
    }
    const target = this.findAdjacentEnabledVisible(visible, currentIndex, -1)
    if (target === null) {
      if (!this.hasFocusableVisible(visible)) {
        return actionFailure("no-focusable-node")
      }
      return actionFailure("boundary")
    }
    const previous = this.state
    this.patch({
      ...this.state,
      active: target,
    })
    return actionSuccess(!statesEqual(previous, this.state))
  }

  expand(value: Value): void {
    this.requestExpand(value)
  }

  requestExpand(value: Value): TreeviewActionResult {
    const node = this.nodes.get(value)
    if (!node) {
      return actionFailure("missing-node")
    }
    if (node.children.length === 0) {
      return actionFailure("leaf-node")
    }
    const previous = this.state
    if (!this.isExpanded(value)) {
      this.patch({
        ...this.state,
        expanded: [...this.state.expanded, value],
      })
    }
    return actionSuccess(!statesEqual(previous, this.state))
  }

  collapse(value: Value): void {
    this.requestCollapse(value)
  }

  requestCollapse(value: Value): TreeviewActionResult {
    const node = this.nodes.get(value)
    if (!node) {
      return actionFailure("missing-node")
    }
    if (node.children.length === 0) {
      return actionFailure("leaf-node")
    }
    const previous = this.state
    if (this.isExpanded(value)) {
      const expanded = this.state.expanded.filter((entry) => entry !== value)
      const nextActive = this.isDescendantOf(this.state.active, value) ? value : this.state.active
      this.patch({
        ...this.state,
        active: nextActive,
        expanded,
      })
    }
    return actionSuccess(!statesEqual(previous, this.state))
  }

  toggle(value: Value): void {
    this.requestToggle(value)
  }

  requestToggle(value: Value): TreeviewActionResult {
    const node = this.nodes.get(value)
    if (!node) {
      return actionFailure("missing-node")
    }
    if (node.children.length === 0) {
      return actionFailure("leaf-node")
    }
    if (this.isExpanded(value)) {
      return this.requestCollapse(value)
    }
    return this.requestExpand(value)
  }

  expandPath(value: Value): void {
    const nextExpanded = toUniqueList(this.withExpandedPath(value))
    this.patch({
      ...this.state,
      expanded: nextExpanded,
    })
  }

  getVisibleValues(): Value[] {
    return [...this.getVisibleValuesCached()]
  }

  getChildren(value: Value): Value[] {
    const node = this.nodes.get(value)
    return node ? [...node.children] : []
  }

  getParent(value: Value): Value | null {
    return this.nodes.get(value)?.parent ?? null
  }

  isExpanded(value: Value): boolean {
    return this.state.expanded.includes(value)
  }

  isSelected(value: Value): boolean {
    return this.state.selected === value
  }

  isActive(value: Value): boolean {
    return this.state.active === value
  }

  getSnapshot(): TreeviewSnapshot<Value> {
    return this.snapshot
  }

  subscribe(subscriber: TreeviewSubscriber<Value>): { unsubscribe: () => void } {
    this.subscribers.add(subscriber)
    subscriber(this.snapshot)
    return {
      unsubscribe: () => {
        this.subscribers.delete(subscriber)
      },
    }
  }

  destroy(): void {
    this.subscribers.clear()
    this.visibleCache = null
  }

  private buildNodeMap(nodes: ReadonlyArray<TreeviewNode<Value>>): Map<Value, InternalNode<Value>> {
    const map = new Map<Value, InternalNode<Value>>()
    nodes.forEach((node) => {
      map.set(node.value, {
        value: node.value,
        parent: node.parent ?? null,
        disabled: node.disabled ?? false,
        children: [],
      })
    })
    this.finalizeNodeMap(map)
    return map
  }

  private patchNodeMap(nodes: ReadonlyArray<TreeviewNode<Value>>): void {
    nodes.forEach((node) => {
      const existing = this.nodes.get(node.value)
      if (existing) {
        existing.parent = node.parent ?? null
        existing.disabled = node.disabled ?? false
        return
      }
      this.nodes.set(node.value, {
        value: node.value,
        parent: node.parent ?? null,
        disabled: node.disabled ?? false,
        children: [],
      })
    })
    this.finalizeNodeMap(this.nodes)
  }

  private finalizeNodeMap(map: Map<Value, InternalNode<Value>>): void {
    map.forEach((node) => {
      node.children = []
    })
    map.forEach((node) => {
      if (node.parent === null) {
        return
      }
      if (node.parent === node.value || !map.has(node.parent)) {
        node.parent = null
        return
      }
      map.get(node.parent)?.children.push(node.value)
    })
  }

  private patch(next: TreeviewState<Value>, emit = true): void {
    const normalizedNext: TreeviewState<Value> = {
      active: next.active,
      selected: next.selected,
      expanded: this.normalizeExpandedValues(next.expanded),
    }
    if (statesEqual(this.state, normalizedNext)) {
      return
    }
    if (!expandedValuesEqual(this.state.expanded, normalizedNext.expanded)) {
      this.visibleCache = null
      this.visibleProjection.requestRefreshPass()
    }
    this.state = normalizedNext
    this.snapshot = this.createSnapshot(normalizedNext)
    if (emit) {
      this.subscribers.forEach((subscriber) => subscriber(this.snapshot))
    }
  }

  private createSnapshot(state: TreeviewState<Value>): TreeviewSnapshot<Value> {
    return Object.freeze({
      active: state.active,
      selected: state.selected,
      expanded: Object.freeze([...state.expanded]),
    })
  }

  private normalizeState(state: TreeviewState<Value>): TreeviewState<Value> {
    const expandedSet = new Set(this.normalizeExpandedValues(state.expanded))

    const selected = this.normalizeSelected(state.selected)
    this.includeAncestorPath(expandedSet, selected)
    const visible = this.getVisibleValuesFor(expandedSet)
    const active = this.normalizeActive(state.active, visible)
    this.includeAncestorPath(expandedSet, active)
    const nextVisible = this.getVisibleValuesFor(expandedSet)
    const nextActive = this.normalizeActive(active, nextVisible)

    return {
      active: nextActive,
      selected,
      expanded: this.normalizeExpandedValues(expandedSet),
    }
  }

  private normalizeSelected(candidate: Value | null): Value | null {
    if (candidate === null) {
      return null
    }
    const node = this.nodes.get(candidate)
    if (!node || node.disabled) {
      return null
    }
    return candidate
  }

  private normalizeActive(candidate: Value | null, visible: Value[]): Value | null {
    if (!visible.length) {
      return null
    }

    if (candidate !== null && this.isNodeFocusable(candidate) && visible.includes(candidate)) {
      return candidate
    }

    if (candidate !== null) {
      let parent = this.nodes.get(candidate)?.parent ?? null
      while (parent !== null) {
        if (this.isNodeFocusable(parent) && visible.includes(parent)) {
          return parent
        }
        parent = this.nodes.get(parent)?.parent ?? null
      }
    }

    return visible.find((value) => this.isNodeFocusable(value)) ?? null
  }

  private isNodeFocusable(value: Value): boolean {
    const node = this.nodes.get(value)
    return Boolean(node && !node.disabled)
  }

  private withExpandedPath(value: Value): Value[] {
    const nextExpanded = new Set(this.state.expanded)
    this.includeAncestorPath(nextExpanded, value)
    return this.normalizeExpandedValues(nextExpanded)
  }

  private includeAncestorPath(expanded: Set<Value>, value: Value | null): void {
    if (value === null) {
      return
    }
    let current = this.nodes.get(value)?.parent ?? null
    while (current !== null) {
      if (this.hasChildren(current)) {
        expanded.add(current)
      }
      current = this.nodes.get(current)?.parent ?? null
    }
  }

  private normalizeExpandedValues(values: Iterable<Value>): Value[] {
    const expandedSet = new Set<Value>()
    for (const value of values) {
      if (this.hasChildren(value)) {
        expandedSet.add(value)
      }
    }
    if (!expandedSet.size) {
      return []
    }
    return this.getNodeTraversalOrder().filter((value) => expandedSet.has(value))
  }

  private getNodeTraversalOrder(): Value[] {
    const order: Value[] = []
    const visited = new Set<Value>()

    const visit = (value: Value, path: Set<Value>) => {
      if (visited.has(value) || path.has(value)) {
        return
      }
      const node = this.nodes.get(value)
      if (!node) {
        return
      }
      path.add(value)
      visited.add(value)
      order.push(value)
      node.children.forEach((child) => visit(child, path))
      path.delete(value)
    }

    const roots = Array.from(this.nodes.values()).filter((node) => node.parent === null)
    roots.forEach((root) => visit(root.value, new Set<Value>()))
    this.nodes.forEach((_node, value) => {
      if (!visited.has(value)) {
        visit(value, new Set<Value>())
      }
    })
    return order
  }

  private getVisibleValuesCached(): Value[] {
    if (this.visibleCache && !this.visibleProjection.hasDirtyStages()) {
      return this.visibleCache
    }
    this.visibleProjection.recompute((stage, shouldRecompute) => {
      if (stage !== "visible" || !shouldRecompute) {
        return false
      }
      this.visibleCache = this.getVisibleValuesFor(new Set(this.state.expanded))
      return true
    })
    if (!this.visibleCache) {
      this.visibleCache = this.getVisibleValuesFor(new Set(this.state.expanded))
    }
    return this.visibleCache
  }

  private hasFocusableVisible(visible: Value[]): boolean {
    return visible.some((value) => this.isNodeFocusable(value))
  }

  private getVisibleValuesFor(expanded: ReadonlySet<Value>): Value[] {
    const roots = Array.from(this.nodes.values()).filter((node) => node.parent === null)
    const visible: Value[] = []

    const visit = (value: Value, path: Set<Value>) => {
      const node = this.nodes.get(value)
      if (!node) {
        return
      }
      if (path.has(value)) {
        return
      }
      path.add(value)
      visible.push(value)
      if (expanded.has(value)) {
        node.children.forEach((child) => visit(child, path))
      }
      path.delete(value)
    }

    roots.forEach((root) => visit(root.value, new Set()))
    return visible
  }

  private findAdjacentEnabledVisible(
    visible: Value[],
    currentIndex: number,
    direction: 1 | -1,
  ): Value | null {
    if (!visible.length) {
      return null
    }

    let index = currentIndex
    for (let steps = 0; steps < visible.length; steps += 1) {
      index += direction
      if (index < 0 || index >= visible.length) {
        if (!this.loop) {
          return null
        }
        index = direction === 1 ? 0 : visible.length - 1
      }
      const candidate = visible[index]
      if (candidate === undefined) {
        continue
      }
      if (this.isNodeFocusable(candidate)) {
        return candidate
      }
    }
    return null
  }

  private getFirstEnabledVisible(): Value | null {
    return this.getVisibleValuesCached().find((value) => this.isNodeFocusable(value)) ?? null
  }

  private getLastEnabledVisible(): Value | null {
    const visible = this.getVisibleValuesCached()
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      const value = visible[index]
      if (value !== undefined && this.isNodeFocusable(value)) {
        return value
      }
    }
    return null
  }

  private hasChildren(value: Value): boolean {
    const node = this.nodes.get(value)
    return Boolean(node && node.children.length > 0)
  }

  private isDescendantOf(candidate: Value | null, ancestor: Value): boolean {
    if (candidate === null) {
      return false
    }
    let parent = this.nodes.get(candidate)?.parent ?? null
    while (parent !== null) {
      if (parent === ancestor) {
        return true
      }
      parent = this.nodes.get(parent)?.parent ?? null
    }
    return false
  }
}

function statesEqual<Value>(a: TreeviewState<Value>, b: TreeviewState<Value>): boolean {
  if (a === b) {
    return true
  }
  if (a.active !== b.active || a.selected !== b.selected) {
    return false
  }
  return expandedValuesEqual(a.expanded, b.expanded)
}

function expandedValuesEqual<Value>(a: Value[], b: Value[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== a.length || setB.size !== b.length) {
    return false
  }
  if (setA.size !== setB.size) {
    return false
  }
  for (const value of setA) {
    if (!setB.has(value)) {
      return false
    }
  }
  return true
}

function toUniqueList<Value>(values: ReadonlyArray<Value>): Value[] {
  return Array.from(new Set(values))
}

function actionSuccess(changed: boolean): TreeviewActionResult {
  return { ok: true, changed }
}

function actionFailure(reason: TreeviewActionFailureReason): TreeviewActionResult {
  return { ok: false, changed: false, reason }
}
