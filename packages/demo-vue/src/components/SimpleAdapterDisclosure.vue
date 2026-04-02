<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useDisclosureController } from "@affino/disclosure-vue"

type Insight = {
  title: string
  context: string
  metric: string
  meta: string
}

const insights: Insight[] = [
  { title: "Research pulse", context: "Weekly round", metric: "+18% completion", meta: "Updated 6m ago" },
  { title: "Design QA", context: "Checklist", metric: "3 blockers", meta: "Auto-triaged" },
  { title: "Launch ops", context: "Crew sync", metric: "7 owners", meta: "Crew ready" },
]

const controller = useDisclosureController(false)
const isOpen = computed(() => controller.state.value.open)
const lastEvent = ref("Waiting for interaction")

watch(isOpen, (next) => {
  lastEvent.value = next ? "Panel expanded" : "Panel collapsed"
})

function togglePanel() {
  controller.toggle()
}

function closePanel() {
  controller.close()
}
</script>

<template>
  <section class="disclosure-shell ui-demo-shell">
    <header class="ui-copy-stack">
      <p class="ui-eyebrow">Affino disclosure</p>
      <h2>One trigger, one reveal, no extra ceremony</h2>
      <p class="disclosure-lead">
        Use the controller to keep the interaction dependable, then shape the card and copy however the product needs.
      </p>
    </header>

    <div class="disclosure-actions">
      <button type="button" class="ui-button ui-button--primary" @click="togglePanel">Toggle project pulses</button>
      <button type="button" class="ui-button ui-button--ghost" :disabled="!isOpen" @click="closePanel">Force close</button>
    </div>

    <article class="disclosure-panel" :data-state="isOpen ? 'open' : 'closed'">
      <div class="panel-copy">
        <p class="ui-eyebrow">Notifications</p>
        <h3>Studio update feed</h3>
        <p>Keep the most relevant updates tucked away until someone actually needs them.</p>
      </div>

      <ul class="panel-list">
        <li v-for="insight in insights" :key="insight.title">
          <div>
            <strong>{{ insight.title }}</strong>
            <span>{{ insight.context }}</span>
          </div>
          <div>
            <em>{{ insight.metric }}</em>
            <small>{{ insight.meta }}</small>
          </div>
        </li>
      </ul>
    </article>

    <dl class="adapter-log ui-stat-grid">
      <div>
        <dt>Disclosure state</dt>
        <dd>{{ isOpen ? "Open" : "Closed" }}</dd>
      </div>
      <div>
        <dt>Last event</dt>
        <dd>{{ lastEvent }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.disclosure-shell {
  color: #241912;
}

.disclosure-shell header h2 {
  margin: 0;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
}

.disclosure-lead {
  margin: 0;
  color: #6b4f3a;
  line-height: 1.6;
}

.disclosure-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.disclosure-actions :global(.ui-button) {
  min-height: 2.9rem;
}

.disclosure-panel {
  border-radius: 1.5rem;
  border: 1px solid rgba(139, 92, 46, 0.14);
  background: rgba(255, 255, 255, 0.72);
  padding: 1.5rem;
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.disclosure-panel[data-state="open"] {
  border-color: rgba(234, 88, 12, 0.35);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.panel-copy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.panel-copy h3 {
  margin: 0;
  font-size: 1.4rem;
}

.panel-copy p:last-child {
  margin: 0;
  color: #6b4f3a;
}

.panel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.panel-list li {
  border-radius: 1rem;
  border: 1px solid rgba(139, 92, 46, 0.1);
  padding: 0.85rem 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(255, 250, 242, 0.9);
}

.panel-list strong {
  display: block;
  font-size: 1rem;
}

.panel-list span {
  color: #8b6a55;
  font-size: 0.85rem;
}

.panel-list em {
  font-style: normal;
  font-weight: 600;
  color: #38bdf8;
}

.panel-list small {
  display: block;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.7);
}

.adapter-log {
  color: #241912;
}

.adapter-log div {
  background: rgba(255, 255, 255, 0.5);
}
</style>
