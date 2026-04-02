<script setup lang="ts">
import { computed, nextTick, watch, type ComponentPublicInstance } from "vue"
import { useTreeviewController, type TreeviewNode } from "@affino/treeview-vue"

type NodeValue =
  | "workspace"
  | "roadmap"
  | "backlog"
  | "priority"
  | "design-spikes"
  | "sprint"
  | "release-train"
  | "qa"
  | "incidents"
  | "sev1"
  | "sev2"
  | "postmortems"
  | "action-items"
  | "archive"

const nodes: TreeviewNode<NodeValue>[] = [
  { value: "workspace", parent: null },
  { value: "roadmap", parent: "workspace" },
  { value: "backlog", parent: "roadmap" },
  { value: "priority", parent: "backlog" },
  { value: "design-spikes", parent: "backlog" },
  { value: "sprint", parent: "roadmap" },
  { value: "release-train", parent: "sprint" },
  { value: "qa", parent: "workspace" },
  { value: "incidents", parent: "qa" },
  { value: "sev1", parent: "incidents" },
  { value: "sev2", parent: "incidents" },
  { value: "postmortems", parent: "qa" },
  { value: "action-items", parent: "postmortems" },
  { value: "archive", parent: "workspace" },
]

const nodeMeta: Record<NodeValue, { title: string; detail: string }> = {
  workspace: { title: "Workspace", detail: "Primary product workspace root" },
  roadmap: { title: "Roadmap", detail: "Quarter planning lanes" },
  backlog: { title: "Backlog", detail: "Candidate stories and design spikes" },
  priority: { title: "Priority", detail: "Urgent items for the next cut" },
  "design-spikes": { title: "Design spikes", detail: "Exploration tracks before build" },
  sprint: { title: "Sprint", detail: "Execution lane with active goals" },
  "release-train": { title: "Release train", detail: "Current rollout checkpoints" },
  qa: { title: "Quality", detail: "Validation, incidents, and release gates" },
  incidents: { title: "Incidents", detail: "Live triage and recovery timelines" },
  sev1: { title: "SEV-1", detail: "Immediate recovery branch" },
  sev2: { title: "SEV-2", detail: "Follow-up mitigation queue" },
  postmortems: { title: "Postmortems", detail: "Root-cause notes and owner actions" },
  "action-items": { title: "Action items", detail: "Assigned prevention tasks" },
  archive: { title: "Archive", detail: "Retired branches and snapshots" },
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

const treeview = useTreeviewController<NodeValue>({
  nodes,
  defaultExpanded: ["workspace", "roadmap", "backlog", "sprint", "qa", "incidents", "postmortems"],
  defaultSelected: "backlog",
  defaultActive: "backlog",
  loop: true,
})

const snapshot = computed(() => treeview.state.value)
const activeValue = computed(() => snapshot.value.active)
const selectedValue = computed(() => snapshot.value.selected)
const expandedSet = computed(() => new Set(snapshot.value.expanded))

const isVisible = (value: NodeValue): boolean => {
  let parent = parentByValue.get(value) ?? null
  while (parent) {
    if (!expandedSet.value.has(parent)) {
      return false
    }
    parent = parentByValue.get(parent) ?? null
  }
  return true
}

const visibleNodes = computed(() => {
  return nodes.filter((node) => isVisible(node.value))
})

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
    await nextTick()
    const target = itemElements.get(active)
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
        return
      }
      if (parentByValue.get(value)) {
        treeview.focus(parentByValue.get(value) as NodeValue)
      }
      break
  }
}

const onToggleClick = (value: NodeValue): void => {
  treeview.toggle(value)
  treeview.focus(value)
}
</script>

<template>
  <section class="treeview-shell ui-demo-shell">
    <div class="treeview-rows" role="tree" aria-label="Project map treeview">
      <button
        v-for="node in visibleNodes"
        :key="node.value"
        :ref="bindItemElement(node.value)"
        type="button"
        class="treeview-node"
        :class="{
          'is-selected': selectedValue === node.value,
        }"
        :style="{ '--tree-level': String(resolveLevel(node.value)) }"
        :data-tree-last="isLastSibling(node.value) ? 'true' : 'false'"
        :data-state="selectedValue === node.value ? 'selected' : 'idle'"
        role="treeitem"
        :aria-level="String(resolveLevel(node.value))"
        :aria-setsize="String(getSiblingCount(node.value))"
        :aria-posinset="String(getPosInSet(node.value))"
        :aria-selected="selectedValue === node.value ? 'true' : 'false'"
        :aria-expanded="hasChildren(node.value) ? (expandedSet.has(node.value) ? 'true' : 'false') : undefined"
        :tabindex="activeValue === node.value ? 0 : -1"
        @click="treeview.select(node.value)"
        @keydown="onNodeKeydown($event, node.value)"
      >
        <span class="treeview-node__rail" aria-hidden="true">
          <span class="treeview-node__guides">
            <span
              v-for="(draw, index) in getAncestorGuides(node.value)"
              :key="`${node.value}-guide-${index}`"
              class="treeview-node__guide"
              :data-draw="draw ? 'true' : 'false'"
              :style="{ '--guide-index': String(index) }"
            />
          </span>
          <span class="treeview-node__stem" />
          <span
            v-if="hasChildren(node.value)"
            class="treeview-node__toggle"
            :data-state="expandedSet.has(node.value) ? 'expanded' : 'collapsed'"
            @click.stop.prevent="onToggleClick(node.value)"
          />
          <span v-else class="treeview-node__toggle treeview-node__toggle--dot" />
        </span>
        <span class="treeview-node__content">
          <span class="treeview-node__label">{{ nodeMeta[node.value].title }}</span>
          <span class="treeview-node__detail">{{ nodeMeta[node.value].detail }}</span>
        </span>
      </button>
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

.treeview-rows {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.treeview-node {
  --tree-level-value: var(--tree-level, 1);
  --tree-offset: calc((var(--tree-level-value) - 1) * var(--tree-indent));
  --tree-toggle-size: 0.86rem;
  --tree-toggle-center: calc(var(--tree-offset) + (var(--tree-toggle-size) / 2));
  --tree-content-gap: 0.38rem;
  position: relative;
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
  margin: 0;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
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
  font-weight: 400;
  line-height: 1.2;
}

.treeview-node__content {
  grid-column: 2;
  min-width: 0;
}

.treeview-node__detail {
  display: none;
}

.treeview-footer {
  border-top: 1px dashed var(--tree-line);
  padding-top: 0.85rem;
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
