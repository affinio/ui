<script setup lang="ts">
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from "vue"
import { useVirtualTreeviewController, type TreeviewNode } from "@affino/treeview-vue"

type NodeValue = string

type DemoNodeMeta = {
  title: string
  detail: string
}

const targetNodeCount = 2400
const maxChildren = 10
const virtualRowHeight = 32
const virtualViewportHeight = 520

const nodes: TreeviewNode<NodeValue>[] = []
const nodeMeta: Record<NodeValue, DemoNodeMeta> = {}
const defaultExpanded: NodeValue[] = []

const addNode = (value: NodeValue, parent: NodeValue | null, title: string, detail: string): void => {
  nodes.push({ value, parent, text: `${title} ${detail}` })
  nodeMeta[value] = { title, detail }
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
    addNode(value, parent.value, title, detail)
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

const snapshot = computed(() => treeview.state.value)
const activeValue = computed(() => snapshot.value.active)
const selectedValue = computed(() => snapshot.value.selected)
const expandedSet = computed(() => new Set(snapshot.value.expanded))
const visibleRows = computed(() => treeview.visibleRows.value)
const totalHeight = computed(() => treeview.totalHeight.value)
const totalNodeCount = nodes.length
const visibleNodeCount = computed(() => {
  void snapshot.value
  return treeview.getVisibleCount()
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
    treeview.scrollToValue(active)
    refreshAndSyncScroll()
    await nextTick()
    const target = itemElements.get(active)
    if (!target || target.hidden || target === document.activeElement || document.activeElement === searchInput.value) {
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

const onNodeKeydown = (event: KeyboardEvent, value: NodeValue) => {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault()
      treeview.focusNext()
      break
    case "ArrowUp":
      event.preventDefault()
      treeview.focusPrevious()
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
      treeview.select(value)
      break
    case "ArrowRight": {
      if (!hasChildren(value)) {
        return
      }
      event.preventDefault()
      if (!treeview.isExpanded(value)) {
        treeview.expand(value)
        refreshAndSyncScroll()
        return
      }
      const child = childrenByParent.get(value)?.[0]
      if (child) {
        treeview.focus(child)
      }
      break
    }
    case "ArrowLeft":
      event.preventDefault()
      if (treeview.isExpanded(value)) {
        treeview.collapse(value)
        refreshAndSyncScroll()
        return
      }
      if (parentByValue.get(value)) {
        treeview.focus(parentByValue.get(value) as NodeValue)
      }
      break
  }
}

const onNodeClick = (value: NodeValue): void => {
  treeview.select(value)
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

    <div class="treeview-summary" aria-live="polite">
      <span>{{ visibleNodeCount }} visible / {{ totalNodeCount }} total</span>
      <span>{{ visibleRangeLabel }}</span>
      <span>{{ visibleRows.length }} DOM rows</span>
    </div>

    <div
      ref="rowsViewport"
      class="treeview-rows"
      role="tree"
      aria-label="Project map treeview"
      :style="{ height: `${virtualViewportHeight}px` }"
      @scroll.passive="onRowsScroll"
    >
      <div class="treeview-rows__spacer" :style="{ height: `${totalHeight}px` }">
        <button
          v-for="row in visibleRows"
          :key="row.value"
          :ref="bindItemElement(row.value)"
          type="button"
          class="treeview-node"
          :class="{
            'is-selected': selectedValue === row.value,
            'is-active': activeValue === row.value,
            'is-matched': isMatched(row.value),
          }"
          :style="{ '--tree-level': String(resolveLevel(row.value)), transform: `translateY(${row.top}px)` }"
          :data-value="row.value"
          :data-tree-last="isLastSibling(row.value) ? 'true' : 'false'"
          :data-state="selectedValue === row.value ? 'selected' : 'idle'"
          :data-active="activeValue === row.value ? 'true' : 'false'"
          :data-matched="isMatched(row.value) ? 'true' : 'false'"
          role="treeitem"
          :aria-level="String(resolveLevel(row.value))"
          :aria-setsize="String(getSiblingCount(row.value))"
          :aria-posinset="String(getPosInSet(row.value))"
          :aria-selected="selectedValue === row.value ? 'true' : 'false'"
          :aria-expanded="hasChildren(row.value) ? (expandedSet.has(row.value) ? 'true' : 'false') : undefined"
          :tabindex="activeValue === row.value ? 0 : -1"
          @click="onNodeClick(row.value)"
          @keydown="onNodeKeydown($event, row.value)"
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
      <p class="ui-eyebrow">Current selection</p>
      <p v-if="selectedMeta">{{ selectedMeta.title }} | {{ selectedMeta.detail }}</p>
      <p v-else>No node selected</p>
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

.treeview-node:focus-visible,
.treeview-node[data-state="selected"][aria-selected="true"] {
  outline: 1px dotted var(--tree-focus);
  outline-offset: -1px;
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
