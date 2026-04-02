<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import type { OverlayEntry } from "@affino/overlay-kernel"
import { subscribeToOverlayStack } from "@/utils/overlayKernel"

const entries = ref<readonly OverlayEntry[]>([])
const collapsed = ref(false)
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = subscribeToOverlayStack((stack) => {
    entries.value = stack
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  unsubscribe = null
})

const displayEntries = computed(() => [...entries.value].reverse())
const topEntryId = computed(() => displayEntries.value[0]?.id ?? null)
const stackSize = computed(() => entries.value.length)

function togglePanel() {
  collapsed.value = !collapsed.value
}
</script>

<template>
  <aside class="overlay-panel" :class="{ 'overlay-panel--collapsed': collapsed }" aria-live="polite">
    <button class="overlay-panel__toggle" type="button" @click="togglePanel" aria-label="Toggle overlay stack insights">
      <span class="overlay-panel__dot" :data-active="stackSize > 0"></span>
      <span>Overlay kernel · {{ stackSize }}</span>
    </button>

    <div class="overlay-panel__body">
      <p class="overlay-panel__hint">
        Live stack from <code>@affino/overlay-kernel</code>
      </p>
      <ul class="overlay-panel__list">
        <li v-if="!displayEntries.length" class="overlay-panel__empty">Stack is idle. Open any dialog/menu to populate it.</li>
        <li v-for="entry in displayEntries" :key="entry.id" class="overlay-panel__item" :data-top="entry.id === topEntryId">
          <div>
            <p class="overlay-panel__kind">{{ entry.kind }}</p>
            <p class="overlay-panel__meta">State · {{ entry.state }}</p>
          </div>
          <div class="overlay-panel__badge">
            <span>#{{ entry.priority }}</span>
            <span v-if="entry.id === topEntryId" class="overlay-panel__badge-pill">Top</span>
          </div>
        </li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.overlay-panel {
  position: fixed;
  bottom: 1.25rem;
  right: 1.25rem;
  width: min(320px, calc(100vw - 2.5rem));
  border-radius: 1rem;
  background: rgba(7, 10, 22, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.35);
  backdrop-filter: blur(12px);
  color: #e2e8f0;
  box-shadow: 0 20px 45px rgba(2, 6, 23, 0.55);
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.overlay-panel--collapsed .overlay-panel__body {
  display: none;
}

.overlay-panel__toggle {
  width: 100%;
  background: transparent;
  border: none;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.75rem 1rem;
  text-align: left;
  cursor: pointer;
}

.overlay-panel__toggle:hover,
.overlay-panel__toggle:focus-visible {
  background: rgba(59, 130, 246, 0.12);
  outline: none;
}

.overlay-panel__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.6);
}

.overlay-panel__dot[data-active="true"] {
  background: #4ade80;
  box-shadow: 0 0 12px rgba(74, 222, 128, 0.65);
}

.overlay-panel__body {
  padding: 0 1rem 1rem;
}

.overlay-panel__hint {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.65);
}

.overlay-panel__list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-height: 260px;
  overflow-y: auto;
}

.overlay-panel__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.35rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.overlay-panel__item:last-child {
  border-bottom: none;
}

.overlay-panel__item[data-top="true"] .overlay-panel__kind {
  color: #a5b4fc;
}

.overlay-panel__kind {
  margin: 0;
  font-weight: 600;
  text-transform: capitalize;
}

.overlay-panel__meta {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.7);
}

.overlay-panel__badge {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: rgba(226, 232, 240, 0.85);
}

.overlay-panel__badge-pill {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: linear-gradient(120deg, #6366f1, #14b8a6);
  color: #020617;
  font-weight: 600;
}

.overlay-panel__empty {
  margin: 0;
  padding: 0.75rem 0;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.65);
}

@media (max-width: 640px) {
  .overlay-panel {
    bottom: 0.75rem;
    right: 0.75rem;
    width: calc(100vw - 1.5rem);
  }
}

@media (min-width: 1024px) {
  .overlay-panel {
    top: 6rem;
    bottom: auto;
    right: 2rem;
  }
}
</style>
