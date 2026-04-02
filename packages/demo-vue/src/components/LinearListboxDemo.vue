<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { createListboxStore, useListboxStore } from '@affino/selection-vue'
import type { LinearSelectionState } from '@affino/selection-core'

interface ListboxOption {
  id: string
  label: string
  detail: string
  badge?: string
}

const options: ListboxOption[] = [
  { id: 'cmd', label: 'Command Palette', detail: '⌘ K', badge: 'Quick access' },
  { id: 'notif', label: 'Notifications', detail: 'Shift + N' },
  { id: 'dash', label: 'Dashboards', detail: '3 boards' },
  { id: 'deploy', label: 'Deployments', detail: '2 pending' },
  { id: 'logs', label: 'Logs', detail: 'Realtime tail' },
  { id: 'schema', label: 'Schemas', detail: '5 collections' },
  { id: 'users', label: 'Users', detail: '12 online', badge: 'Live' },
  { id: 'teams', label: 'Teams', detail: 'Marketing, Product' },
  { id: 'billing', label: 'Billing', detail: 'Invoices + Usage' },
  { id: 'feature', label: 'Feature Flags', detail: '8 toggles' },
  { id: 'themes', label: 'Themes', detail: 'Light / Dark' },
  { id: 'labs', label: 'Labs', detail: 'Experimental', badge: 'Beta' },
]

const store = createListboxStore({
  context: {
    optionCount: options.length,
  },
})

const { state: listbox } = useListboxStore(store)
const listRef = ref<HTMLDivElement | null>(null)
const optionRefs = new Map<number, HTMLDivElement>()

type SelectionRange = LinearSelectionState['ranges'][number]

const selectedCount = computed(() =>
  listbox.value.selection.ranges.reduce((total: number, range: SelectionRange) => total + (range.end - range.start + 1), 0),
)

const selectionSummary = computed(() => {
  if (!listbox.value.selection.ranges.length) return 'Nothing selected'
  return listbox.value.selection.ranges
    .map((range: SelectionRange) => {
      if (range.start === range.end) {
        return options[range.start]?.label ?? `Row ${range.start + 1}`
      }
      const start = options[range.start]?.label ?? `Row ${range.start + 1}`
      const end = options[range.end]?.label ?? `Row ${range.end + 1}`
      return `${start} – ${end}`
    })
    .join(', ')
})

function focusList() {
  listRef.value?.focus({ preventScroll: true })
}

function setOptionRef(index: number, el: HTMLDivElement | null) {
  if (el) {
    optionRefs.set(index, el)
  } else {
    optionRefs.delete(index)
  }
}

function handleKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      store.move(-1, { extend: event.shiftKey })
      focusList()
      return
    case 'ArrowDown':
      event.preventDefault()
      store.move(1, { extend: event.shiftKey })
      focusList()
      return
    case 'Home':
      event.preventDefault()
      store.move(-Infinity, { extend: event.shiftKey })
      focusList()
      return
    case 'End':
      event.preventDefault()
      store.move(Infinity, { extend: event.shiftKey })
      focusList()
      return
    case 'a':
    case 'A':
      if (event.metaKey || event.ctrlKey) {
        event.preventDefault()
        if (!options.length) return
        store.selectAll()
      }
      return
    default:
      return
  }
}

function handleItemPointerDown(index: number, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  focusList()
  store.activate(index, {
    extend: event.shiftKey,
    toggle: event.metaKey || event.ctrlKey,
  })
}

function isIndexSelected(index: number): boolean {
  return listbox.value.selection.ranges.some((range: SelectionRange) => index >= range.start && index <= range.end)
}

function handleClear() {
  store.clearSelection({ preserveActiveIndex: true })
  focusList()
}

watch(
  () => listbox.value.activeIndex,
  (nextIndex) => {
    if (nextIndex == null || nextIndex < 0) return
    nextTick(() => {
      optionRefs.get(nextIndex)?.scrollIntoView({ block: 'nearest' })
    })
  },
)
</script>

<template>
  <div class="listbox-card">
    <header class="listbox-header">
      <div>
        <p class="eyebrow">Linear selection</p>
        <h3>Command menu listbox</h3>
        <p class="muted">Click, shift-click, or use arrows to compose ranges.</p>
      </div>
      <div class="stat-pill">
        <span class="stat-count">{{ selectedCount }}</span>
        <span class="stat-label">selected</span>
      </div>
    </header>

    <div
      ref="listRef"
      class="listbox-shell"
      tabindex="0"
      role="listbox"
      aria-multiselectable="true"
      @keydown="handleKeydown"
    >
      <div
        v-for="(option, index) in options"
        :key="option.id"
        class="listbox-item"
        :class="{
          'listbox-item--selected': isIndexSelected(index),
          'listbox-item--cursor': listbox.activeIndex === index,
        }"
        role="option"
        :aria-selected="isIndexSelected(index)"
        @pointerdown="handleItemPointerDown(index, $event as PointerEvent)"
        :ref="(el) => setOptionRef(index, el as HTMLDivElement | null)"
      >
        <div class="item-text">
          <p class="item-label">{{ option.label }}</p>
          <p class="item-detail">{{ option.detail }}</p>
        </div>
        <span v-if="option.badge" class="item-badge">{{ option.badge }}</span>
      </div>
    </div>

    <footer class="listbox-footer">
      <p class="muted">{{ selectionSummary }}</p>
      <button type="button" class="reset-button" @click="handleClear">Clear</button>
    </footer>
  </div>
</template>

<style scoped>
.listbox-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.75rem;
  border-radius: 28px;
  border: 1px solid var(--glass-border);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
}

.listbox-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.eyebrow {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.3em;
  color: var(--text-muted);
  margin-bottom: 0.35rem;
}

.listbox-header h3 {
  margin: 0 0 0.35rem;
  font-size: clamp(1.4rem, 2.3vw, 1.8rem);
}

.muted {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}

.stat-pill {
  display: grid;
  place-items: center;
  min-width: 96px;
  padding: 0.5rem 0.75rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--accent, #7f5bff) 50%, transparent);
  background: color-mix(in srgb, var(--accent, #7f5bff) 12%, var(--surface));
}

.stat-count {
  font-size: 1.6rem;
  font-weight: 600;
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.25em;
  color: var(--text-muted);
}

.listbox-shell {
  border-radius: 24px;
  border: 1px solid var(--glass-border);
  padding: 0.5rem;
  background: color-mix(in srgb, var(--panel, #090c15) 90%, transparent);
  outline: none;
  max-height: 360px;
  overflow: auto;
}

.listbox-shell:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #7f5bff) 60%, transparent);
}

.listbox-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-radius: 18px;
  cursor: pointer;
  transition: background 0.15s ease, border 0.15s ease;
  border: 1px solid transparent;
}

.listbox-item + .listbox-item {
  margin-top: 0.35rem;
}

.listbox-item--selected {
  border-color: color-mix(in srgb, var(--accent, #7f5bff) 50%, transparent);
  background: color-mix(in srgb, var(--accent, #7f5bff) 18%, var(--surface));
}

.listbox-item--cursor {
  border-color: color-mix(in srgb, var(--accent, #7f5bff) 40%, transparent);
  background: color-mix(in srgb, var(--accent, #7f5bff) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #7f5bff) 45%, transparent);
}

.item-text {
  display: flex;
  flex-direction: column;
}

.item-label {
  margin: 0;
  font-weight: 600;
}

.item-detail {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.item-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  color: var(--text-muted);
}

.listbox-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.reset-button {
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  padding: 0.5rem 1.1rem;
  font-weight: 600;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
}

.reset-button:hover {
  border-color: color-mix(in srgb, var(--accent, #7f5bff) 40%, transparent);
}

@media (max-width: 720px) {
  .listbox-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .listbox-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
