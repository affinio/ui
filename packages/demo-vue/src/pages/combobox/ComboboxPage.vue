<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import AccountCombobox from "./examples/AccountCombobox.vue"
import { segmentOptions } from "@/data/comboboxOptions"

const keyboardCombos = [
  { combo: "Cmd + K", detail: "focus + open the surface" },
  { combo: "Arrow keys", detail: "cycle resiliently across 15K+ rows" },
  { combo: "Enter", detail: "commit without blocking the overlay queue" },
]

const segmentHighlights = segmentOptions.slice(0, 5)
</script>

<template>
  <section class="combobox-page ui-page-shell">
    <header class="combobox-hero ui-page-header ui-copy-stack">
      <p class="ui-eyebrow">Combobox core</p>
      <h2 class="ui-title">Click into the field and search immediately.</h2>
      <p class="combobox-preamble ui-lead">The live combobox comes first. Segment notes and overlay internals stay collapsed.</p>
    </header>

    <div class="combobox-stage combobox-stage--single ui-page-main ui-page-main--single">
      <AccountCombobox />
    </div>

    <QuickDetails title="Keyboard shortcuts and overlay notes" hint="Open to see segment examples and kernel details.">
      <ul class="combobox-shortcuts">
        <li v-for="shortcut in keyboardCombos" :key="shortcut.combo" class="shortcut-chip">
          <span class="shortcut-combo">{{ shortcut.combo }}</span>
          <span class="shortcut-detail">{{ shortcut.detail }}</span>
        </li>
      </ul>

      <aside class="combobox-side">
        <p class="side-eyebrow">Signal-driven segments</p>
        <h3>Headless state piped straight into Vue.</h3>
        <p class="side-copy">
          These cards come from the same linear selection snapshots that power the combobox.
        </p>

        <ul class="segment-list">
          <li v-for="segment in segmentHighlights" :key="segment.id" class="segment-card">
            <div>
              <p class="segment-label">{{ segment.label }}</p>
              <p class="segment-description">{{ segment.description }}</p>
            </div>
            <span class="segment-metric">{{ segment.metric }}</span>
          </li>
        </ul>
      </aside>

      <section class="combobox-kernel">
        <div>
          <p class="combobox-eyebrow">Overlay kernel</p>
          <h3>Every combobox is just another overlay entry.</h3>
          <p>
            The surface registers as a combobox overlay, so it can cooperate with dialogs and menus without losing focus.
          </p>
        </div>
        <div class="kernel-grid">
          <div>
            <p class="kernel-label">Owner</p>
            <p class="kernel-value">vue-combobox</p>
          </div>
          <div>
            <p class="kernel-label">Priority</p>
            <p class="kernel-value">80 - elevated search</p>
          </div>
          <div>
            <p class="kernel-label">Traits</p>
            <p class="kernel-value">non-modal - returns focus manually</p>
          </div>
        </div>
      </section>
    </QuickDetails>
  </section>
</template>

<style scoped>
.combobox-page {
  gap: 2.5rem;
}

.combobox-hero {
}

.combobox-preamble { max-width: 680px; }

.combobox-shortcuts {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  padding: 0;
  margin: 1.5rem 0 0;
}

.shortcut-chip {
  border-radius: 18px;
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--glass-bg) 85%, transparent);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.shortcut-combo {
  font-size: 0.85rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-primary);
}

.shortcut-detail {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.combobox-stage {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 2rem;
  align-items: start;
}

.combobox-stage--single {
  grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 1024px) {
  .combobox-stage {
    grid-template-columns: 1fr;
  }
}

.combobox-side {
  border-radius: 28px;
  padding: 1.5rem;
  border: 1px solid var(--glass-border);
  background: var(--surface-alt);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.side-eyebrow {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.combobox-side h3 {
  margin: 0;
  font-size: 1.5rem;
}

.side-copy {
  margin: 0;
  color: var(--text-muted);
}

.segment-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin: 0;
  padding: 0;
}

.segment-card {
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--glass-border) 80%, transparent);
  padding: 0.85rem 1rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(4, 7, 15, 0.65);
}

.segment-label {
  margin: 0;
  font-weight: 600;
}

.segment-description {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
  color: var(--text-soft);
}

.segment-metric {
  align-self: center;
  font-size: 0.85rem;
  color: var(--accent-strong);
}

.combobox-kernel {
  border-radius: 28px;
  padding: 2rem;
  border: 1px solid var(--glass-border);
  background: linear-gradient(120deg, rgba(99, 102, 241, 0.18), transparent);
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 2rem;
  align-items: center;
}

@media (max-width: 900px) {
  .combobox-kernel {
    grid-template-columns: 1fr;
  }
}

.combobox-kernel h3 {
  margin: 0.4rem 0 1rem;
  font-size: 1.8rem;
}

.combobox-kernel p {
  margin: 0;
  color: var(--text-muted);
}

.kernel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.kernel-label {
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-soft);
}

.kernel-value {
  margin: 0.2rem 0 0;
  font-size: 1rem;
  color: var(--text-primary);
}
</style>
