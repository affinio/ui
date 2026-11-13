<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch, type ComponentPublicInstance } from "vue"
import { useVirtualTreeviewController, type TreeviewInteractionEvent, type TreeviewNode, type TreeviewDropPosition } from "@affino/treeview-vue"

type NodeValue = string

type DemoNodeMeta = {
  title: string
  detail: string
  disabled: boolean
}

const targetNodeCount = 2400
const maxChildren = 10
const virtualRowHeight = 32
const virtualViewportHeight = 520

const nodes: TreeviewNode<NodeValue>[] = []
const nodeMeta: Record<NodeValue, DemoNodeMeta> = {}
const defaultExpanded: NodeValue[] = []

const addNode = (value: NodeValue, parent: NodeValue | null, title: string, detail: string, disabled = false): void => {
  nodes.push({ value, parent, text: `${title} ${detail}`, ...(disabled ? { disabled: true } : {}) })
  nodeMeta[value] = { title, detail, disabled }
}

addNode("workspace", null, "Workspace", "Synthetic perf root with thousands of nested branches")
defaultExpanded.push("workspace")

const queue: Array<{ value: NodeValue; depth: number; ordinal: number }> = [{ value: "workspace", depth: 1, ordinal: 0 }]
let cursor = 0
let nextId = 1
while (cursor < queue.length && nodes.length < targetNodeCount) {
  const parent = queue[cursor++]!
  if (parent.depth >= 6) {
    continue
  }
  const childCount = Math.min(maxChildren, 4 + ((parent.ordinal * 3 + parent.depth) % 7))
  for (let index = 0; index < childCount && nodes.length < targetNodeCount; index += 1) {
    const id = nextId++
    const value = `node-${id}`
    const depth = parent.depth + 1
    const title = `Node ${id}`
    const detail = `Depth ${depth}, child ${index + 1} of ${parent.value}`
    addNode(value, parent.value, title, detail, id % 127 === 0)
    queue.push({ value, depth, ordinal: id })
    if (depth <= 5) {
      defaultExpanded.push(value)
    }
  }
}

const childrenByParent = new Map<NodeValue | null, NodeValue[]>()
nodes.forEach((node) => {
  const siblings = childrenByParent.get(node.parent) ?? []
  siblings.push(node.value)
  childrenByParent.set(node.parent, siblings)
})

const levelByValue = new Map<NodeValue, number>()
const parentByValue = new Map<NodeValue, NodeValue | null>()
nodes.forEach((node) => {
  parentByValue.set(node.value, node.parent)
})

const resolveLevel = (value: NodeValue): number => {
  const cached = levelByValue.get(value)
  if (cached) {
    return cached
  }
  let level = 1
  let cursor = parentByValue.get(value) ?? null
  const visited = new Set<NodeValue>()
  while (cursor) {
    if (visited.has(cursor)) {
      break
    }
    visited.add(cursor)
    level += 1
    cursor = parentByValue.get(cursor) ?? null
  }
  levelByValue.set(value, level)
  return level
}

const treeview = useVirtualTreeviewController<NodeValue>({
  nodes,
  selectionMode: "multiple",
  defaultExpanded,
  defaultSelected: "node-42",
  defaultActive: "node-42",
  loop: true,
  rowHeight: virtualRowHeight,
  viewportHeight: virtualViewportHeight,
  overscan: 10,
})

const rowsViewport = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref("")
const lastInteraction = ref<TreeviewInteractionEvent<NodeValue> | null>(null)
const hoverEventCount = ref(0)
const dragStartCount = ref(0)
const acceptedDropCount = ref(0)
const rejectedDropCount = ref(0)
const clipboardEventCount = ref(0)
const hoveredTarget = ref<{ value: NodeValue; position: TreeviewDropPosition } | null>(null)
let rawHoverEventCount = 0
let hoverCountFrame: number | null = null
let draggedValues: NodeValue[] = []
let dragPointer: { x: number; y: number } | null = null
let dragScrollFrame: number | null = null
const interactionSubscription = treeview.subscribeInteractions((event) => {
  if (event.type === "drag-over") {
    rawHoverEventCount += 1
    if (hoverCountFrame === null) {
      hoverCountFrame = window.requestAnimationFrame(() => {
        hoverCountFrame = null
        hoverEventCount.value = rawHoverEventCount
      })
    }
    return
  }
  lastInteraction.value = event
  if (event.type === "drag-start") dragStartCount.value += 1
  if (event.type === "drop-accepted") acceptedDropCount.value += 1
  if (event.type === "drop-rejected") rejectedDropCount.value += 1
  if (event.type === "clipboard") clipboardEventCount.value += 1
})
onScopeDispose(() => {
  interactionSubscription.unsubscribe()
  if (hoverCountFrame !== null) window.cancelAnimationFrame(hoverCountFrame)
  if (dragScrollFrame !== null) window.cancelAnimationFrame(dragScrollFrame)
})

const snapshot = computed(() => treeview.state.value)
const activeValue = computed(() => snapshot.value.active)
const selectedValue = computed(() => snapshot.value.selected)
const selectedValues = computed(() => snapshot.value.selectedValues)
const anchorValue = computed(() => snapshot.value.anchorValue)
const expandedSet = computed(() => new Set(snapshot.value.expanded))
const visibleRows = computed(() => treeview.visibleRows.value)
const totalHeight = computed(() => treeview.totalHeight.value)
const totalNodeCount = nodes.length
const disabledNodeCount = nodes.filter((node) => node.disabled).length
const visibleNodeCount = computed(() => {
  void snapshot.value
  return treeview.getVisibleCount()
})
const stressRangeSize = computed(() => {
  const anchor = anchorValue.value
  const anchorIndex = anchor === null ? 0 : treeview.getVisibleIndex(anchor)
  return Math.max(0, visibleNodeCount.value - Math.max(anchorIndex, 0))
})
const visibleRangeLabel = computed(() => {
  const rows = visibleRows.value
  const first = rows[0]?.index
  const last = rows[rows.length - 1]?.index
  if (first === undefined || last === undefined) {
    return "0 rendered"
  }
  return `${first + 1}-${last + 1} rendered`
})

const searchMatchCount = computed(() => {
  void snapshot.value
  return treeview.getSearchMatchCount()
})
const showEmptySearch = computed(() => searchQuery.value.trim().length > 0 && visibleNodeCount.value === 0)

const syncViewportScroll = (): void => {
  const viewport = rowsViewport.value
  if (!viewport) {
    return
  }
  const scrollTop = treeview.scrollTop.value
  if (Math.abs(viewport.scrollTop - scrollTop) > 0.5) {
    viewport.scrollTop = scrollTop
  }
}

const refreshAndSyncScroll = (): void => {
  treeview.refreshWindow()
  syncViewportScroll()
}

const applySearchQuery = (query: string): void => {
  searchQuery.value = query
  treeview.setSearchQuery(query)
  syncViewportScroll()
}

const clearSearchQuery = (): void => {
  searchQuery.value = ""
  treeview.clearSearchQuery()
  syncViewportScroll()
  searchInput.value?.focus()
}

const isMatched = (value: NodeValue): boolean => treeview.getNodeMeta(value)?.matched ?? false

const getSiblings = (value: NodeValue): NodeValue[] => {
  const parent = parentByValue.get(value) ?? null
  return childrenByParent.get(parent) ?? []
}

const getSiblingCount = (value: NodeValue): number => {
  const siblings = getSiblings(value)
  return siblings.length || 1
}

const getPosInSet = (value: NodeValue): number => {
  const siblings = getSiblings(value)
  const index = siblings.indexOf(value)
  return index === -1 ? 1 : index + 1
}

const hasNextSibling = (value: NodeValue): boolean => {
  const siblings = getSiblings(value)
  const index = siblings.indexOf(value)
  return index !== -1 && index < siblings.length - 1
}

const isLastSibling = (value: NodeValue): boolean => {
  const siblings = getSiblings(value)
  return siblings[siblings.length - 1] === value
}

const getAncestorGuides = (value: NodeValue): boolean[] => {
  const guides: boolean[] = []
  let cursor = parentByValue.get(value) ?? null
  while (cursor) {
    guides.unshift(hasNextSibling(cursor))
    cursor = parentByValue.get(cursor) ?? null
  }
  return guides
}

const selectedMeta = computed(() => {
  const selected = selectedValue.value
  if (!selected) {
    return null
  }
  return nodeMeta[selected]
})
const lastInteractionLabel = computed(() => {
  const event = lastInteraction.value
  if (!event) return "No completed interaction yet"
  if (event.type === "clipboard") return `${event.action} intent · ${event.selectedValues.length} selected · target ${event.targetValue ?? "none"}`
  if (event.type === "drag-start" || event.type === "drag-cancel") return `${event.type} · ${event.sourceValues.length} source nodes`
  return `${event.type} · ${event.sourceValues.length} source nodes · ${event.position} ${event.targetValue}`
})

const selectStressRange = (): void => {
  const visible = treeview.getVisibleValues()
  const first = visible[0]
  const last = visible[visible.length - 1]
  if (!first || !last) return
  if (treeview.state.value.anchorValue === null) treeview.requestSelect(first)
  treeview.requestRangeSelection(last)
}

const getDropPosition = (event: DragEvent): TreeviewDropPosition => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return "inside"
  const rect = target.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  if (ratio < 0.25) return "before"
  if (ratio > 0.75) return "after"
  return "inside"
}

const isDescendantOrSelf = (candidate: NodeValue, ancestor: NodeValue): boolean => {
  let current: NodeValue | null = candidate
  const visited = new Set<NodeValue>()
  while (current !== null && !visited.has(current)) {
    if (current === ancestor) return true
    visited.add(current)
    current = parentByValue.get(current) ?? null
  }
  return false
}

const onNodeDragStart = (event: DragEvent, value: NodeValue): void => {
  const selection = snapshot.value.selectedValues
  draggedValues = selection.includes(value) ? [...selection] : [value]
  if (!treeview.requestBeginDrag(draggedValues)) {
    event.preventDefault()
    draggedValues = []
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", value)
  }
}

const stopDragAutoScroll = (): void => {
  dragPointer = null
  if (dragScrollFrame !== null) {
    window.cancelAnimationFrame(dragScrollFrame)
    dragScrollFrame = null
  }
}

const runDragAutoScroll = (): void => {
  dragScrollFrame = null
  const viewport = rowsViewport.value
  const pointer = dragPointer
  if (!viewport || !pointer || draggedValues.length === 0) return

  const rect = viewport.getBoundingClientRect()
  if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) return
  const edgeSize = 48
  let velocity = 0
  if (pointer.y < rect.top + edgeSize) {
    velocity = -Math.max(2, Math.ceil(((rect.top + edgeSize - pointer.y) / edgeSize) * 24))
  } else if (pointer.y > rect.bottom - edgeSize) {
    velocity = Math.max(2, Math.ceil(((pointer.y - (rect.bottom - edgeSize)) / edgeSize) * 24))
  }
  if (velocity === 0) return

  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, viewport.scrollTop + velocity))
  if (nextScrollTop === viewport.scrollTop) return
  viewport.scrollTop = nextScrollTop
  treeview.setScrollTop(nextScrollTop)
  dragScrollFrame = window.requestAnimationFrame(runDragAutoScroll)
}

const scheduleDragAutoScroll = (event: DragEvent): void => {
  dragPointer = { x: event.clientX, y: event.clientY }
  if (dragScrollFrame === null) dragScrollFrame = window.requestAnimationFrame(runDragAutoScroll)
}

const onViewportDragOver = (event: DragEvent): void => {
  if (!draggedValues.length) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  scheduleDragAutoScroll(event)
}

const onNodeDragOver = (event: DragEvent, value: NodeValue): void => {
  if (!draggedValues.length) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  const position = getDropPosition(event)
  treeview.requestHoverDrop(value, position)
  if (hoveredTarget.value?.value !== value || hoveredTarget.value.position !== position) {
    hoveredTarget.value = { value, position }
  }
}

const onNodeDrop = (event: DragEvent, value: NodeValue): void => {
  if (!draggedValues.length) return
  event.preventDefault()
  stopDragAutoScroll()
  const position = getDropPosition(event)
  treeview.requestHoverDrop(value, position)
  const cycle = draggedValues.some((source) => isDescendantOrSelf(value, source))
  treeview.requestResolveDrop(!cycle)
  hoveredTarget.value = null
  draggedValues = []
}

const onNodeDragEnd = (): void => {
  stopDragAutoScroll()
  treeview.requestCancelDrag()
  hoveredTarget.value = null
  draggedValues = []
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

const onNodeDragLeave = (event: DragEvent, value: NodeValue): void => {
  const current = event.currentTarget
  if (current instanceof HTMLElement && event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return
  if (hoveredTarget.value?.value === value) hoveredTarget.value = null
}

const selectedPreview = computed(() => selectedValues.value.slice(0, 6).map(getTitle).join(", "))

const getTitle = (value: NodeValue): string => nodeMeta[value]?.title ?? String(value)
const getDetail = (value: NodeValue): string => nodeMeta[value]?.detail ?? ""
const hasChildren = (value: NodeValue) => (childrenByParent.get(value) ?? []).length > 0

const itemElements = new Map<NodeValue, HTMLButtonElement>()
const bindItemElement = (value: NodeValue) => (element: Element | ComponentPublicInstance | null): void => {
  const resolved = element instanceof Element
    ? element
    : (element?.$el instanceof Element ? element.$el : null)
  if (resolved instanceof HTMLButtonElement) {
    itemElements.set(value, resolved)
    return
  }
  itemElements.delete(value)
}

watch(
  () => activeValue.value,
  async (active) => {
    if (!active) {
      return
    }
    const viewport = rowsViewport.value
    if (!viewport || document.activeElement === searchInput.value) return
    let target = itemElements.get(active)
    if (!target) {
      const index = treeview.getVisibleIndex(active)
      if (index < 0) return
      treeview.scrollToIndex(index)
      treeview.refreshWindow()
      syncViewportScroll()
      await nextTick()
      if (activeValue.value !== active) return
      target = itemElements.get(active)
    }
    if (!target || target.hidden || target === document.activeElement) return

    const viewportRect = viewport.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    let nextScrollTop = viewport.scrollTop
    if (targetRect.top < viewportRect.top) nextScrollTop -= viewportRect.top - targetRect.top
    else if (targetRect.bottom > viewportRect.bottom) nextScrollTop += targetRect.bottom - viewportRect.bottom
    if (nextScrollTop !== viewport.scrollTop) {
      treeview.setScrollTop(nextScrollTop)
      viewport.scrollTop = nextScrollTop
      await nextTick()
      if (activeValue.value !== active) return
      target = itemElements.get(active) ?? target
    }
    if (!target || target.hidden || target === document.activeElement) {
      return
    }
    try {
      target.focus({ preventScroll: true })
    } catch {
      target.focus()
    }
  },
)

const onRowsScroll = (event: Event): void => {
  const target = event.currentTarget
  if (target instanceof HTMLElement) {
    treeview.setScrollTop(target.scrollTop)
  }
}

const onNodeKeydown = (event: KeyboardEvent, value: NodeValue): void => {
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && ["c", "x", "v"].includes(key) && !isEditableTarget(event.target)) {
    event.preventDefault()
    const action = key === "c" ? "copy" : key === "x" ? "cut" : "paste"
    treeview.requestClipboardIntent(action, action === "paste" ? value : null)
    return
  }
  switch (event.key) {
    case "Escape": {
      if (snapshot.value.selectedValues.length <= 1) return
      event.preventDefault()
      const anchor = snapshot.value.anchorValue ?? value
      treeview.clearSelection()
      treeview.requestFocus(anchor)
      break
    }
    case "ArrowDown":
      event.preventDefault()
      treeview.requestFocusNext({ extendSelection: event.shiftKey })
      break
    case "ArrowUp":
      event.preventDefault()
      treeview.requestFocusPrevious({ extendSelection: event.shiftKey })
      break
    case "Home":
      event.preventDefault()
      treeview.focusFirst()
      break
    case "End":
      event.preventDefault()
      treeview.focusLast()
      break
    case "Enter":
    case " ":
      event.preventDefault()
      treeview.requestSelect(value, {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      })
      break
    case "ArrowRight": {
      event.preventDefault()
      const result = treeview.requestArrowRight()
      if (result.ok && result.changed) refreshAndSyncScroll()
      break
    }
    case "ArrowLeft": {
      event.preventDefault()
      const result = treeview.requestArrowLeft()
      if (result.ok && result.changed) refreshAndSyncScroll()
      break
    }
  }
}

const onNodeClick = (event: MouseEvent, value: NodeValue): void => {
  treeview.requestSelect(value, {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  })
  treeview.focus(value)
  refreshAndSyncScroll()
}

const onToggleClick = (value: NodeValue): void => {
  treeview.toggle(value)
  treeview.focus(value)
  refreshAndSyncScroll()
}
</script>

<template>
  <section class="treeview-shell ui-demo-shell">
    <div class="treeview-search" role="search">
      <input
        ref="searchInput"
        class="treeview-search__input"
        type="search"
        :value="searchQuery"
        placeholder="Search project map"
        aria-label="Search project map"
        @input="applySearchQuery(($event.target as HTMLInputElement).value)"
      >
      <button
        class="treeview-search__clear"
        type="button"
        :disabled="searchQuery.length === 0"
        aria-label="Clear treeview search"
        @click="clearSearchQuery"
      >
        Clear
      </button>
      <span class="treeview-search__count" aria-live="polite">
        {{ searchMatchCount }} matches
      </span>
    </div>

    <div class="treeview-selection-tools" aria-label="Tree selection stress controls">
      <button type="button" @click="selectStressRange">Select range to last visible node ({{ stressRangeSize }} rows)</button>
      <button type="button" :disabled="selectedValues.length === 0" @click="treeview.clearSelection()">Clear selection</button>
      <span>Ctrl/⌘ click toggles · Shift click/↑/↓ extends · Escape clears group to anchor · drag rows to probe drops</span>
    </div>

    <div class="treeview-summary" aria-live="polite">
      <span>{{ visibleNodeCount }} visible / {{ totalNodeCount }} total</span>
      <span>{{ visibleRangeLabel }}</span>
      <span>{{ visibleRows.length }} DOM rows</span>
      <span>{{ disabledNodeCount }} disabled nodes</span>
      <span>{{ selectedValues.length }} selected</span>
      <span>Focus: {{ activeValue ?? "none" }}</span>
      <span>Anchor: {{ anchorValue ?? "none" }}</span>
    </div>

    <div
      ref="rowsViewport"
      class="treeview-rows"
      role="tree"
      aria-label="Project map treeview"
      aria-multiselectable="true"
      :style="{ height: `${virtualViewportHeight}px` }"
      @scroll.passive="onRowsScroll"
      @dragover="onViewportDragOver"
    >
      <div class="treeview-rows__spacer" :style="{ height: `${totalHeight}px` }">
        <button
          v-for="row in visibleRows"
          :key="row.value"
          :ref="bindItemElement(row.value)"
          type="button"
          class="treeview-node"
          :disabled="row.disabled"
          :draggable="!row.disabled"
          :class="{
            'is-selected': row.selected,
            'is-active': activeValue === row.value,
            'is-matched': isMatched(row.value),
            'is-drop-before': hoveredTarget?.value === row.value && hoveredTarget.position === 'before',
            'is-drop-inside': hoveredTarget?.value === row.value && hoveredTarget.position === 'inside',
            'is-drop-after': hoveredTarget?.value === row.value && hoveredTarget.position === 'after',
          }"
          :style="{ '--tree-level': String(resolveLevel(row.value)), transform: `translateY(${row.top}px)` }"
          :data-value="row.value"
          :data-tree-last="isLastSibling(row.value) ? 'true' : 'false'"
          :data-state="row.selected ? 'selected' : 'idle'"
          :data-active="activeValue === row.value ? 'true' : 'false'"
          :data-matched="isMatched(row.value) ? 'true' : 'false'"
          role="treeitem"
          :aria-level="String(resolveLevel(row.value))"
          :aria-setsize="String(getSiblingCount(row.value))"
          :aria-posinset="String(getPosInSet(row.value))"
          :aria-selected="row.selected ? 'true' : 'false'"
          :aria-disabled="row.disabled ? 'true' : undefined"
          :aria-expanded="hasChildren(row.value) ? (expandedSet.has(row.value) ? 'true' : 'false') : undefined"
          :tabindex="activeValue === row.value ? 0 : -1"
          @click="onNodeClick($event, row.value)"
          @keydown="onNodeKeydown($event, row.value)"
          @dragstart="onNodeDragStart($event, row.value)"
          @dragover="onNodeDragOver($event, row.value)"
          @dragleave="onNodeDragLeave($event, row.value)"
          @drop="onNodeDrop($event, row.value)"
          @dragend="onNodeDragEnd"
        >
          <span class="treeview-node__rail" aria-hidden="true">
            <span class="treeview-node__guides">
              <span
                v-for="(draw, index) in getAncestorGuides(row.value)"
                :key="`${row.value}-guide-${index}`"
                class="treeview-node__guide"
                :data-draw="draw ? 'true' : 'false'"
                :style="{ '--guide-index': String(index) }"
              />
            </span>
            <span class="treeview-node__stem" />
            <span
              v-if="hasChildren(row.value)"
              class="treeview-node__toggle"
              :data-state="expandedSet.has(row.value) ? 'expanded' : 'collapsed'"
              @click.stop.prevent="onToggleClick(row.value)"
            />
            <span v-else class="treeview-node__toggle treeview-node__toggle--dot" />
          </span>
          <span class="treeview-node__content">
            <span class="treeview-node__label">{{ getTitle(row.value) }}</span>
            <span class="treeview-node__detail">{{ getDetail(row.value) }}</span>
          </span>
        </button>
        <div
          v-if="showEmptySearch"
          class="treeview-empty"
          role="status"
          aria-live="polite"
        >
          No matching nodes
        </div>
      </div>
    </div>

    <footer class="treeview-footer">
      <p class="ui-eyebrow">Selection · {{ selectedValues.length }} nodes</p>
      <p v-if="selectedMeta">{{ selectedMeta.title }} | {{ selectedMeta.detail }}</p>
      <p v-else>No node selected</p>
      <p v-if="selectedPreview" class="treeview-footer__preview">{{ selectedPreview }}{{ selectedValues.length > 6 ? `, +${selectedValues.length - 6} more` : "" }}</p>
      <section class="treeview-intents" aria-label="Interaction intent diagnostics">
        <p class="ui-eyebrow">Interaction stress</p>
        <p>Drag starts {{ dragStartCount }} · hover events {{ hoverEventCount }} · accepted {{ acceptedDropCount }} · rejected {{ rejectedDropCount }} · clipboard intents {{ clipboardEventCount }}</p>
        <p class="treeview-intents__last" aria-live="polite">{{ lastInteractionLabel }}</p>
        <p class="treeview-intents__hint">Demo validation rejects drops onto a dragged node or its descendant. Accepted intents are reported but do not mutate this performance fixture.</p>
        <p class="treeview-intents__hint">Focus a row and press Ctrl/⌘+C, Ctrl/⌘+X, or Ctrl/⌘+V to emit clipboard intents.</p>
      </section>
    </footer>
  </section>
</template>

<style scoped>
.treeview-shell {
  --tree-indent: 1.15rem;
  --tree-bg: rgba(255, 251, 245, 0.96);
  --tree-fg: #35261c;
  --tree-border: rgba(139, 92, 46, 0.18);
  --tree-line: rgba(139, 92, 46, 0.28);
  --tree-line-dot: 1px;
  --tree-line-gap: 3px;
  --tree-toggle-bg: rgba(255, 255, 255, 0.92);
  --tree-toggle-border: rgba(139, 92, 46, 0.3);
  --tree-toggle-symbol: #6b4f3a;
  --tree-select-bg: rgba(251, 191, 36, 0.2);
  --tree-select-fg: #241912;
  --tree-active-bg: rgba(20, 184, 166, 0.14);
  --tree-active-border: rgba(15, 118, 110, 0.46);
  --tree-focus: rgba(234, 88, 12, 0.55);
  background: var(--tree-bg);
  color: var(--tree-fg);
  padding: 0.55rem 0.55rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--font-body);
  font-size: 0.95rem;
  line-height: 1.25;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
}

.treeview-search {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0 0.6rem;
}

.treeview-search__input {
  min-width: 0;
  min-height: 2rem;
  border: 1px solid var(--tree-border);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.76);
  color: var(--tree-fg);
  padding: 0.35rem 0.5rem;
  font: inherit;
}

.treeview-search__input:focus-visible,
.treeview-search__clear:focus-visible {
  outline: 1px dotted var(--tree-focus);
  outline-offset: 2px;
}

.treeview-search__clear {
  min-height: 2rem;
  border: 1px solid var(--tree-border);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.68);
  color: var(--tree-fg);
  padding: 0.35rem 0.65rem;
  font: inherit;
  cursor: pointer;
}

.treeview-search__clear:disabled {
  cursor: default;
  opacity: 0.45;
}

.treeview-search__count {
  color: var(--text-muted);
  font-size: 0.82rem;
  white-space: nowrap;
}

.treeview-selection-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
  padding: 0 0 0.45rem;
  color: var(--text-muted);
  font-size: 0.76rem;
}

.treeview-selection-tools button {
  min-height: 1.8rem;
  border: 1px solid var(--tree-border);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.72);
  color: var(--tree-fg);
  padding: 0.25rem 0.45rem;
  font: inherit;
  cursor: pointer;
}

.treeview-selection-tools button:disabled {
  cursor: default;
  opacity: 0.45;
}

.treeview-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  align-items: center;
  border-top: 1px dashed var(--tree-line);
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 0.45rem 0 0.55rem;
}

.treeview-rows {
  position: relative;
  overflow: auto;
  border: 1px solid var(--tree-border);
  background: rgba(255, 255, 255, 0.32);
  contain: strict;
}

.treeview-rows__spacer {
  position: relative;
  min-height: 100%;
  min-width: 100%;
}

.treeview-empty {
  align-items: center;
  color: var(--text-muted);
  display: flex;
  font-size: 0.92rem;
  inset: 0;
  justify-content: center;
  padding: 1rem;
  position: absolute;
  text-align: center;
}

.treeview-node {
  --tree-level-value: var(--tree-level, 1);
  --tree-offset: calc((var(--tree-level-value) - 1) * var(--tree-indent));
  --tree-toggle-size: 0.86rem;
  --tree-toggle-center: calc(var(--tree-offset) + (var(--tree-toggle-size) / 2));
  --tree-content-gap: 0.38rem;
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  border: 0;
  border-radius: 0;
  background-color: transparent;
  color: inherit;
  text-align: left;
  display: grid;
  grid-template-columns: calc(var(--tree-offset) + var(--tree-toggle-size) + var(--tree-content-gap)) minmax(0, 1fr);
  align-items: center;
  min-height: 2rem;
  height: 2rem;
  margin: 0;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
  will-change: transform;
}

.treeview-node__rail {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(var(--tree-offset) + var(--tree-toggle-size));
  pointer-events: none;
}

.treeview-node__guides {
  position: absolute;
  inset: 0;
}

.treeview-node__guide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(((var(--guide-index) + 1) * var(--tree-indent)) - (var(--tree-indent) / 2));
  width: 1px;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--tree-line) 0,
    var(--tree-line) var(--tree-line-dot),
    transparent var(--tree-line-dot),
    transparent calc(var(--tree-line-dot) + var(--tree-line-gap))
  );
  display: none;
}

.treeview-node__guide[data-draw="true"] {
  display: block;
}

.treeview-node__stem {
  position: absolute;
  left: var(--tree-toggle-center);
  top: 0;
  bottom: 0;
  width: 1px;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--tree-line) 0,
    var(--tree-line) var(--tree-line-dot),
    transparent var(--tree-line-dot),
    transparent calc(var(--tree-line-dot) + var(--tree-line-gap))
  );
}

.treeview-node__stem::after {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: calc((var(--tree-toggle-size) / 2) + var(--tree-content-gap));
  height: 1px;
  background-image: repeating-linear-gradient(
    to right,
    var(--tree-line) 0,
    var(--tree-line) var(--tree-line-dot),
    transparent var(--tree-line-dot),
    transparent calc(var(--tree-line-dot) + var(--tree-line-gap))
  );
  transform: translateY(-50%);
}

.treeview-node[aria-level="1"] .treeview-node__stem {
  display: none;
}

.treeview-node[data-tree-last="true"] .treeview-node__stem {
  bottom: 50%;
}

.treeview-node.is-selected,
.treeview-node[data-state="selected"] {
  background-color: var(--tree-select-bg);
  color: var(--tree-select-fg);
}

.treeview-node.is-active,
.treeview-node[data-active="true"] {
  box-shadow: inset 3px 0 0 var(--tree-active-border);
}

.treeview-node.is-active:not(.is-selected),
.treeview-node[data-active="true"][data-state="idle"] {
  background-color: var(--tree-active-bg);
}

.treeview-node.is-matched .treeview-node__label,
.treeview-node[data-matched="true"] .treeview-node__label {
  background: rgba(234, 88, 12, 0.16);
  color: #241912;
  outline: 1px solid rgba(234, 88, 12, 0.22);
  outline-offset: 2px;
}

.treeview-node:focus-visible {
  outline: 1px dotted var(--tree-focus);
  outline-offset: -1px;
}

.treeview-node:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.treeview-node.is-drop-before::after,
.treeview-node.is-drop-after::after {
  content: "";
  position: absolute;
  left: 0.1rem;
  right: 0.1rem;
  height: 2px;
  background: #0f766e;
  pointer-events: none;
}

.treeview-node.is-drop-before::after {
  top: 0;
}

.treeview-node.is-drop-after::after {
  bottom: 0;
}

.treeview-node.is-drop-inside {
  outline: 2px solid rgba(15, 118, 110, 0.8);
  outline-offset: -2px;
}

.treeview-node__toggle {
  position: absolute;
  left: var(--tree-offset);
  top: 50%;
  transform: translateY(-50%);
  width: var(--tree-toggle-size);
  height: var(--tree-toggle-size);
  border-radius: 0;
  border: 1px solid var(--tree-toggle-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tree-toggle-bg);
  color: transparent;
  font-size: 0;
  line-height: 1;
  pointer-events: auto;
}

.treeview-node__toggle::before {
  content: "+";
  font-size: 0.74rem;
  line-height: 1;
  color: var(--tree-toggle-symbol);
  font-weight: 700;
}

.treeview-node__toggle[data-state="expanded"]::before {
  content: "-";
}

.treeview-node__toggle--dot {
  border: 0;
  background: transparent;
}

.treeview-node__toggle--dot::before {
  content: "*";
  font-size: 0.75rem;
  line-height: 1;
  color: var(--tree-line);
  font-weight: 400;
}

.treeview-node__label {
  display: inline;
  flex: 0 0 auto;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.treeview-node__content {
  grid-column: 2;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  overflow: hidden;
}

.treeview-node__detail {
  color: var(--text-muted);
  display: inline;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.treeview-footer {
  border-top: 1px dashed var(--tree-line);
  margin-top: 0.65rem;
  padding-top: 0.85rem;
}

.treeview-footer__preview {
  overflow-wrap: anywhere;
}

.treeview-intents {
  margin-top: 0.8rem;
  padding-top: 0.65rem;
  border-top: 1px dashed var(--tree-line);
  color: var(--text-muted);
  font-size: 0.76rem;
}

.treeview-intents .ui-eyebrow {
  margin-bottom: 0.35rem;
}

.treeview-intents p {
  margin: 0.25rem 0;
}

.treeview-intents__last {
  color: var(--tree-fg);
  font-weight: 600;
}

.treeview-intents__hint {
  font-size: 0.7rem;
}

@media (max-width: 520px) {
  .treeview-search {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .treeview-search__count {
    grid-column: 1 / -1;
  }

  .treeview-node__detail {
    display: none;
  }
}

.treeview-footer .ui-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.treeview-footer p:last-child {
  margin: 0.3rem 0 0;
  color: var(--text-soft);
}
</style>
