import { createProjectionStageEngine } from "@affino/projection-engine"
import type {
  TreeviewActionFailureReason,
  TreeviewActionResult,
  TreeviewNode,
  TreeviewNodeMeta,
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

type VisibleProjection<Value> = {
  visible: Value[]
  visibleIndexByValue: Map<Value, number>
  enabledVisibleValues: Value[]
  enabledVisibleIndexes: number[]
  previousEnabledValueByVisibleIndex: Array<Value | null>
  nextEnabledValueByVisibleIndex: Array<Value | null>
}

export class TreeviewCore<Value = string> {
  private nodes = new Map<Value, InternalNode<Value>>()
  private state: TreeviewState<Value>
  private snapshot: TreeviewSnapshot<Value>
  private snapshotExpandedSource: Value[] | null = null
  private snapshotExpandedValues: ReadonlyArray<Value> = Object.freeze([])
  private subscribers = new Set<TreeviewSubscriber<Value>>()
  private rootValues: Value[] = []
  private preorderValues: Value[] = []
  private preorderIndexByValue = new Map<Value, number>()
  private depthByValue = new Map<Value, number>()
  private subtreeEndIndexByValue = new Map<Value, number>()
  private expandedSet = new Set<Value>()
  private visibleCache: Value[] | null = null
  private visibleIndexByValue = new Map<Value, number>()
  private enabledVisibleValues: Value[] = []
  private enabledVisibleIndexes: number[] = []
  private nextEnabledValueByVisibleIndex: Array<Value | null> = []
  private previousEnabledValueByVisibleIndex: Array<Value | null> = []
  private visibleProjectionVersion = 0
  private visibleProjectionRecomputeCount = 0
  private visibleNavigationLookupCount = 0
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
    this.expandedSet = new Set(this.state.expanded)
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
    const expanded = this.getExpandedWithAncestorPath(value)
    this.patch({
      active: value,
      selected: value,
      expanded,
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
    const expanded = this.getExpandedWithAncestorPath(value)
    this.patch({
      ...this.state,
      active: value,
      expanded,
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
    this.getVisibleValuesCached()
    const currentIndex = this.state.active === null ? undefined : this.visibleIndexByValue.get(this.state.active)
    if (currentIndex === undefined) {
      return this.requestFocusFirst()
    }
    const target = this.findAdjacentEnabledVisible(currentIndex, 1)
    if (target === null) {
      if (!this.enabledVisibleValues.length) {
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
    this.getVisibleValuesCached()
    const currentIndex = this.state.active === null ? undefined : this.visibleIndexByValue.get(this.state.active)
    if (currentIndex === undefined) {
      return this.requestFocusLast()
    }
    const target = this.findAdjacentEnabledVisible(currentIndex, -1)
    if (target === null) {
      if (!this.enabledVisibleValues.length) {
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
    const nextExpanded = this.getExpandedWithAncestorPath(value)
    this.patch({
      ...this.state,
      expanded: nextExpanded,
    })
  }

  getVisibleValues(): Value[] {
    return [...this.getVisibleValuesCached()]
  }

  getVisibleCount(): number {
    return this.getVisibleValuesCached().length
  }

  getVisibleAt(index: number): Value | null {
    if (!Number.isInteger(index) || index < 0) {
      return null
    }
    return this.getVisibleValuesCached()[index] ?? null
  }

  getVisibleIndex(value: Value): number {
    this.getVisibleValuesCached()
    return this.visibleIndexByValue.get(value) ?? -1
  }

  getVisibleWindow(start: number, end: number): Value[] {
    const visible = this.getVisibleValuesCached()
    const safeStart = clampVisibleWindowIndex(start, visible.length)
    const safeEnd = clampVisibleWindowIndex(end, visible.length)
    if (safeEnd <= safeStart) {
      return []
    }
    return visible.slice(safeStart, safeEnd)
  }

  getNodeMeta(value: Value): TreeviewNodeMeta<Value> | null {
    const node = this.nodes.get(value)
    if (!node) {
      return null
    }
    return Object.freeze({
      value,
      parent: node.parent,
      depth: this.depthByValue.get(value) ?? 0,
      childCount: node.children.length,
      disabled: node.disabled,
      expanded: this.isExpanded(value),
      selected: this.isSelected(value),
      active: this.isActive(value),
    })
  }

  getChildren(value: Value): Value[] {
    const node = this.nodes.get(value)
    return node ? [...node.children] : []
  }

  getParent(value: Value): Value | null {
    return this.nodes.get(value)?.parent ?? null
  }

  isExpanded(value: Value): boolean {
    return this.expandedSet.has(value)
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
      if (node.parent !== null && (node.parent === node.value || !map.has(node.parent))) {
        node.parent = null
      }
    })
    this.getParentCycleValues(map).forEach((value) => {
      const node = map.get(value)
      if (node) {
        node.parent = null
      }
    })

    const roots: Value[] = []
    map.forEach((node) => {
      if (node.parent === null) {
        roots.push(node.value)
        return
      }
      map.get(node.parent)?.children.push(node.value)
    })
    this.rootValues = roots
    this.rebuildSourceIndexes(map)
  }

  private rebuildSourceIndexes(map: Map<Value, InternalNode<Value>>): void {
    const preorderValues: Value[] = []
    const preorderIndexByValue = new Map<Value, number>()
    const depthByValue = new Map<Value, number>()
    const subtreeEndIndexByValue = new Map<Value, number>()
    const visited = new Set<Value>()

    const visit = (start: Value, startDepth: number) => {
      const stack: Array<{ value: Value; depth: number }> = [{ value: start, depth: startDepth }]
      while (stack.length) {
        const entry = stack.pop()
        if (!entry || visited.has(entry.value)) {
          continue
        }
        const node = map.get(entry.value)
        if (!node) {
          continue
        }
        visited.add(entry.value)
        preorderIndexByValue.set(entry.value, preorderValues.length)
        depthByValue.set(entry.value, entry.depth)
        preorderValues.push(entry.value)
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
          const child = node.children[index]
          if (child !== undefined && !visited.has(child)) {
            stack.push({ value: child, depth: entry.depth + 1 })
          }
        }
      }
    }

    this.rootValues.forEach((root) => visit(root, 0))
    map.forEach((_node, value) => {
      if (!visited.has(value)) {
        visit(value, 0)
      }
    })

    const openAncestors: Array<{ value: Value; depth: number }> = []
    preorderValues.forEach((value, index) => {
      const depth = depthByValue.get(value) ?? 0
      while (openAncestors.length) {
        const current = openAncestors[openAncestors.length - 1]
        if (!current || current.depth < depth) {
          break
        }
        const closed = openAncestors.pop()
        if (closed) {
          subtreeEndIndexByValue.set(closed.value, index)
        }
      }
      openAncestors.push({ value, depth })
    })
    while (openAncestors.length) {
      const closed = openAncestors.pop()
      if (closed) {
        subtreeEndIndexByValue.set(closed.value, preorderValues.length)
      }
    }

    this.preorderValues = preorderValues
    this.preorderIndexByValue = preorderIndexByValue
    this.depthByValue = depthByValue
    this.subtreeEndIndexByValue = subtreeEndIndexByValue
  }

  private getParentCycleValues(map: Map<Value, InternalNode<Value>>): Set<Value> {
    const cycleValues = new Set<Value>()
    const resolvedValues = new Set<Value>()
    map.forEach((_node, start) => {
      if (resolvedValues.has(start)) {
        return
      }
      const path: Value[] = []
      const pathIndexByValue = new Map<Value, number>()
      let current: Value | null = start
      while (current !== null) {
        if (resolvedValues.has(current)) {
          break
        }
        const cycleStart = pathIndexByValue.get(current)
        if (cycleStart !== undefined) {
          for (let index = cycleStart; index < path.length; index += 1) {
            const value = path[index]
            if (value !== undefined) {
              cycleValues.add(value)
            }
          }
          break
        }
        pathIndexByValue.set(current, path.length)
        path.push(current)
        current = map.get(current)?.parent ?? null
      }
      path.forEach((value) => resolvedValues.add(value))
    })
    return cycleValues
  }

  private patch(next: TreeviewState<Value>, emit = true): void {
    const expandedChanged = !expandedValuesEqual(this.state.expanded, next.expanded)
    const normalizedNext: TreeviewState<Value> = {
      active: next.active,
      selected: next.selected,
      expanded: expandedChanged ? this.normalizeExpandedValues(next.expanded) : this.state.expanded,
    }
    if (statesEqual(this.state, normalizedNext)) {
      return
    }
    if (!expandedValuesEqual(this.state.expanded, normalizedNext.expanded)) {
      this.expandedSet = new Set(normalizedNext.expanded)
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
    if (this.snapshotExpandedSource !== state.expanded) {
      this.snapshotExpandedSource = state.expanded
      this.snapshotExpandedValues = Object.freeze([...state.expanded])
    }
    return Object.freeze({
      active: state.active,
      selected: state.selected,
      expanded: this.snapshotExpandedValues,
    })
  }

  private normalizeState(state: TreeviewState<Value>): TreeviewState<Value> {
    const expandedSet = new Set(this.normalizeExpandedValues(state.expanded))

    const selected = this.normalizeSelected(state.selected)
    this.includeAncestorPath(expandedSet, selected)
    const visible = this.computeVisibleProjection(expandedSet).visible
    const visibleIndex = new Set(visible)
    const active = this.normalizeActive(state.active, visible, visibleIndex)
    this.includeAncestorPath(expandedSet, active)
    const nextVisible = this.computeVisibleProjection(expandedSet).visible
    const nextVisibleIndex = new Set(nextVisible)
    const nextActive = this.normalizeActive(active, nextVisible, nextVisibleIndex)

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

  private normalizeActive(candidate: Value | null, visible: Value[], visibleIndex: ReadonlySet<Value>): Value | null {
    if (!visible.length) {
      return null
    }

    if (candidate !== null && this.isNodeFocusable(candidate) && visibleIndex.has(candidate)) {
      return candidate
    }

    if (candidate !== null) {
      let parent = this.nodes.get(candidate)?.parent ?? null
      while (parent !== null) {
        if (this.isNodeFocusable(parent) && visibleIndex.has(parent)) {
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

  private getExpandedWithAncestorPath(value: Value): Value[] {
    const nextExpanded = new Set(this.expandedSet)
    const changed = this.includeAncestorPath(nextExpanded, value)
    if (!changed) {
      return this.state.expanded
    }
    return this.normalizeExpandedValues(nextExpanded)
  }

  private includeAncestorPath(expanded: Set<Value>, value: Value | null): boolean {
    let changed = false
    if (value === null) {
      return changed
    }
    let current = this.nodes.get(value)?.parent ?? null
    while (current !== null) {
      if (this.hasChildren(current) && !expanded.has(current)) {
        expanded.add(current)
        changed = true
      }
      current = this.nodes.get(current)?.parent ?? null
    }
    return changed
  }

  private normalizeExpandedValues(values: Iterable<Value>): Value[] {
    const expanded: Value[] = []
    const seen = new Set<Value>()
    for (const value of values) {
      if (!seen.has(value) && this.hasChildren(value) && this.preorderIndexByValue.has(value)) {
        seen.add(value)
        expanded.push(value)
      }
    }
    if (expanded.length <= 1) {
      return expanded
    }
    return expanded.sort(
      (a, b) => (this.preorderIndexByValue.get(a) ?? 0) - (this.preorderIndexByValue.get(b) ?? 0),
    )
  }

  private getNodeTraversalOrder(): Value[] {
    return this.preorderValues
  }

  private getVisibleValuesCached(): Value[] {
    if (this.visibleCache && !this.visibleProjection.hasDirtyStages()) {
      return this.visibleCache
    }
    this.visibleProjection.recompute((stage, shouldRecompute) => {
      if (stage !== "visible" || !shouldRecompute) {
        return false
      }
      this.visibleCache = this.commitVisibleProjection(this.computeVisibleProjection(this.expandedSet))
      return true
    })
    if (!this.visibleCache) {
      this.visibleCache = this.commitVisibleProjection(this.computeVisibleProjection(this.expandedSet))
    }
    return this.visibleCache
  }

  private computeVisibleProjection(expanded: ReadonlySet<Value>): VisibleProjection<Value> {
    const visible: Value[] = []
    const visibleIndexByValue = new Map<Value, number>()
    const enabledVisibleValues: Value[] = []
    const enabledVisibleIndexes: number[] = []
    const visited = new Set<Value>()

    this.rootValues.forEach((root) => {
      const stack: Value[] = [root]
      while (stack.length) {
        const value = stack.pop()
        if (value === undefined || visited.has(value)) {
          continue
        }
        const node = this.nodes.get(value)
        if (!node) {
          continue
        }
        visited.add(value)
        visibleIndexByValue.set(value, visible.length)
        if (!node.disabled) {
          enabledVisibleValues.push(value)
          enabledVisibleIndexes.push(visible.length)
        }
        visible.push(value)
        if (!expanded.has(value)) {
          continue
        }
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
          const child = node.children[index]
          if (child !== undefined && !visited.has(child)) {
            stack.push(child)
          }
        }
      }
    })

    const previousEnabledValueByVisibleIndex: Array<Value | null> = Array.from({ length: visible.length }, () => null)
    const nextEnabledValueByVisibleIndex: Array<Value | null> = Array.from({ length: visible.length }, () => null)
    let previousEnabled: Value | null = null
    for (let index = 0; index < visible.length; index += 1) {
      previousEnabledValueByVisibleIndex[index] = previousEnabled
      const value = visible[index]
      if (value !== undefined && this.isNodeFocusable(value)) {
        previousEnabled = value
      }
    }
    let nextEnabled: Value | null = null
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      nextEnabledValueByVisibleIndex[index] = nextEnabled
      const value = visible[index]
      if (value !== undefined && this.isNodeFocusable(value)) {
        nextEnabled = value
      }
    }

    return {
      visible,
      visibleIndexByValue,
      enabledVisibleValues,
      enabledVisibleIndexes,
      previousEnabledValueByVisibleIndex,
      nextEnabledValueByVisibleIndex,
    }
  }

  private commitVisibleProjection(projection: VisibleProjection<Value>): Value[] {
    this.visibleIndexByValue = projection.visibleIndexByValue
    this.enabledVisibleValues = projection.enabledVisibleValues
    this.enabledVisibleIndexes = projection.enabledVisibleIndexes
    this.previousEnabledValueByVisibleIndex = projection.previousEnabledValueByVisibleIndex
    this.nextEnabledValueByVisibleIndex = projection.nextEnabledValueByVisibleIndex
    this.visibleProjectionVersion += 1
    this.visibleProjectionRecomputeCount += 1
    return projection.visible
  }

  private findAdjacentEnabledVisible(currentIndex: number, direction: 1 | -1): Value | null {
    this.visibleNavigationLookupCount += 1
    if (!this.enabledVisibleValues.length) {
      return null
    }

    if (direction === 1) {
      return this.nextEnabledValueByVisibleIndex[currentIndex]
        ?? (this.loop ? this.enabledVisibleValues[0] ?? null : null)
    }

    return this.previousEnabledValueByVisibleIndex[currentIndex]
      ?? (this.loop ? this.enabledVisibleValues[this.enabledVisibleValues.length - 1] ?? null : null)
  }

  private getFirstEnabledVisible(): Value | null {
    this.getVisibleValuesCached()
    return this.enabledVisibleValues[0] ?? null
  }

  private getLastEnabledVisible(): Value | null {
    this.getVisibleValuesCached()
    return this.enabledVisibleValues[this.enabledVisibleValues.length - 1] ?? null
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

function clampVisibleWindowIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return index < 0 ? 0 : length
  }
  if (index <= 0) {
    return 0
  }
  if (index >= length) {
    return length
  }
  return Math.trunc(index)
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
  if (a === b) {
    return true
  }
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
