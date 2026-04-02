<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useTabsController } from "@affino/tabs-vue"

type Tab = {
  value: string
  label: string
  summary: string
  stat: string
  footnote: string
}

const tabs: Tab[] = [
  {
    value: "overview",
    label: "Overview",
    summary: "High-signal pieces that unblock product reviews and async planning.",
    stat: "14 tracks live",
    footnote: "Sits on top of your CMS or markdown sources.",
  },
  {
    value: "journeys",
    label: "Journeys",
    summary: "Player-style walkthroughs that pair overlay handles with focus traps.",
    stat: "6 guided flows",
    footnote: "Mix dialogs, menus, and disclosures as needed.",
  },
  {
    value: "signals",
    label: "Signals",
    summary: "Realtime change feed that batches updates from remote mutations.",
    stat: "24 watchers",
    footnote: "Works well for dashboards, status views, and compact activity summaries.",
  },
]

const fallbackTab: Tab =
  tabs[0] ?? {
    value: "overview",
    label: "Overview",
    summary: "Fallback tab",
    stat: "—",
    footnote: "",
  }

const defaultValue = fallbackTab.value
const controller = useTabsController<string>(defaultValue)
const activeValue = computed(() => controller.state.value.value ?? defaultValue)
const activeTab = computed(() => tabs.find((tab) => tab.value === activeValue.value) ?? fallbackTab)
const lastSelection = ref(activeValue.value)

watch(activeValue, (value) => {
  lastSelection.value = value ?? defaultValue
})

function selectTab(value: string) {
  controller.select(value)
}

function clearTabs() {
  controller.clear()
}
</script>

<template>
  <section class="tabs-shell ui-demo-shell ui-demo-shell--cool">
    <div class="tabs-header ui-copy-stack">
      <p class="ui-eyebrow">Affino tabs</p>
      <h2>Switch focus areas without making the page feel heavy</h2>
      <p class="tabs-lead">Use the same controller whether the triggers live in a compact row, a card grid, or a mobile-friendly stack.</p>
    </div>

    <div class="tabs-controls">
      <div class="tab-trigger-group" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="tab-trigger"
          :class="{ 'is-active': activeValue === tab.value }"
          role="tab"
          :aria-selected="activeValue === tab.value"
          @click="selectTab(tab.value)"
        >
          <span>{{ tab.label }}</span>
          <small>{{ tab.stat }}</small>
        </button>
      </div>
      <button type="button" class="ui-button ui-button--ghost" @click="clearTabs">Clear selection</button>
    </div>

    <article class="tabs-panel" role="tabpanel" :aria-label="activeTab.label">
      <header class="ui-copy-stack">
        <p class="ui-eyebrow">{{ activeTab.label }} focus</p>
        <h3>{{ activeTab.stat }}</h3>
        <p>{{ activeTab.summary }}</p>
      </header>
      <footer>
        <span>Note</span>
        <p>{{ activeTab.footnote }}</p>
      </footer>
    </article>

    <dl class="adapter-log ui-stat-grid">
      <div>
        <dt>Active tab</dt>
        <dd>{{ activeValue }}</dd>
      </div>
      <div>
        <dt>Last selection</dt>
        <dd>{{ lastSelection }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.tabs-shell {
  color: #0f172a;
}

.tabs-lead {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.tabs-controls {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.tab-trigger-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.tab-trigger {
  border-radius: 1.25rem;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.9);
  padding: 0.85rem 1rem;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 600;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.tab-trigger.is-active {
  border-color: rgba(234, 88, 12, 0.45);
  box-shadow: 0 12px 30px rgba(234, 88, 12, 0.14);
  transform: translateY(-2px);
}

.tab-trigger span {
  font-size: 0.95rem;
}

.tab-trigger small {
  font-size: 0.78rem;
  color: #475569;
}

.tabs-controls :global(.ui-button) {
  align-self: flex-start;
}

.tabs-panel {
  border-radius: 1.5rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: white;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.tabs-panel header {
  gap: 0.35rem;
}

.tabs-panel h3 {
  margin: 0;
  font-size: 2rem;
}

.tabs-panel p {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.tabs-panel footer {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  padding-top: 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.tabs-panel footer span {
  text-transform: uppercase;
  letter-spacing: 0.35em;
  font-size: 0.65rem;
  color: #94a3b8;
}

.adapter-log {
  color: #0f172a;
}

.adapter-log div {
  background: rgba(255, 255, 255, 0.8);
}
</style>
