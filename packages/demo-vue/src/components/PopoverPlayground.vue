<template>
  <section class="popover-playground">
    <div class="board-card ui-demo-shell">
      <div class="board-header ui-copy-stack">
        <span class="ui-eyebrow">Experiments</span>
        <h2>Audience filters in context</h2>
        <p class="board-lead">
          Keep filter controls close to the summary they affect, so people can adjust the view without losing the page.
        </p>
      </div>
      <div class="board-body">
        <div class="metric-stack">
          <p class="metric-label">Live focus</p>
          <p class="metric-value">{{ selectedSegments.length }}</p>
          <p class="metric-copy">{{ summary }}</p>
        </div>
        <div class="chip-row" aria-live="polite">
          <span v-if="!selectedSegments.length" class="empty-chip">No segments selected</span>
          <span v-else class="chip-wrap">
            <span v-for="segment in selectedSegments" :key="segment" class="chip">
              {{ segment }}
            </span>
          </span>
          <button
            ref="triggerRef"
            v-bind="controller.getTriggerProps()"
            class="chip action-chip"
            type="button"
          >
            Adjust filters
          </button>
        </div>

        <p class="overlay-meta">Overlay · {{ overlaySummary }}</p>
      </div>
    </div>

    <Teleport :to="teleportTarget">
      <Transition name="popover-fade" appear>
        <div
          v-if="state.open"
          ref="contentRef"
          v-bind="controller.getContentProps({ role: 'dialog', tabIndex: -1 })"
          :style="contentStyle"
          class="popover-surface ui-overlay-surface"
        >
          <header class="popover-header">
            <div>
              <p class="ui-eyebrow">Filter builder</p>
              <h3>Audience focus</h3>
            </div>
            <button class="icon-button" type="button" @click="controller.close()" aria-label="Close popover">
              ✕
            </button>
          </header>

          <section class="popover-section">
            <div class="section-heading">
              <p>Segments</p>
              <span>{{ selectedSegments.length }} selected</span>
            </div>
            <div class="segment-grid">
              <label v-for="segment in segmentOptions" :key="segment" class="segment-control">
                <input
                  type="checkbox"
                  :value="segment"
                  :checked="selectedSegments.includes(segment)"
                  @change="toggleSegment(segment)"
                />
                <span>{{ segment }}</span>
              </label>
            </div>
          </section>

          <section class="popover-section">
            <div class="section-heading">
              <p>Weighting</p>
              <span>{{ weightingLabel }}</span>
            </div>
            <div class="weighting-grid">
              <label v-for="preset in weightingPresets" :key="preset.value" class="weighting-card">
                <input
                  type="radio"
                  name="weighting"
                  :value="preset.value"
                  :checked="weighting === preset.value"
                  @change="weighting = preset.value"
                />
                <div>
                  <p>{{ preset.label }}</p>
                  <span>{{ preset.description }}</span>
                </div>
              </label>
            </div>
          </section>

          <section class="popover-section">
            <div class="section-heading">
              <p>Signals</p>
            </div>
            <label class="signal-row">
              <input type="checkbox" :checked="includeArchived" @change="includeArchived = !includeArchived" />
              <span>
                Include archived pilots
                <small>Quietly boosts recall for long-running experiments.</small>
              </span>
            </label>
            <label class="signal-row">
              <input type="checkbox" :checked="alerts" @change="alerts = !alerts" />
              <span>
                Escalate proactive alerts
                <small>Routes accounts with trending drops to the lifecycle pod.</small>
              </span>
            </label>
          </section>

          <footer class="popover-footer">
            <button type="button" class="ui-button ui-button--ghost" @click="resetFilters">Reset</button>
            <button type="button" class="ui-button ui-button--primary" @click="applyFilters">Apply</button>
          </footer>

          <span v-if="arrowProps" class="popover-arrow" v-bind="arrowProps"></span>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useFloatingPopover, usePopoverController } from "@affino/popover-vue"

const overlayOwnerId = "insights-overlay-owner"
const overlayPriority = 45

const controller = usePopoverController({
  id: "insights-filters",
  role: "dialog",
  modal: false,
  overlayKind: "popover",
  overlayEntryTraits: {
    ownerId: overlayOwnerId,
    priority: overlayPriority,
    returnFocus: false,
    data: { surface: "filters" },
  },
})

const state = controller.state

const floating = useFloatingPopover(controller, {
  placement: "bottom",
  align: "start",
  gutter: 16,
  arrow: {
    size: 12,
    inset: 20,
  },
  zIndex: 180,
  lockScroll: false,
})

const triggerRef = floating.triggerRef
const contentRef = floating.contentRef
const contentStyle = floating.contentStyle
const teleportTarget = floating.teleportTarget
const arrowProps = floating.arrowProps

const segmentOptions = ["Activation", "Expansion", "Retention", "Dormant", "Enterprise", "PLG"]
const defaultSegments = ["Activation", "Expansion", "Retention"]
const selectedSegments = ref<string[]>([...defaultSegments])
const weightingPresets = [
  {
    value: "balanced",
    label: "Balanced",
    description: "Even split across health + growth",
  },
  {
    value: "health-led",
    label: "Health led",
    description: "Bias scoring toward churn risk",
  },
  {
    value: "growth-led",
    label: "Growth led",
    description: "Prioritize expansion momentum",
  },
]
const weighting = ref("balanced")
const includeArchived = ref(false)
const alerts = ref(true)

const weightingLabel = computed(() => weightingPresets.find((preset) => preset.value === weighting.value)?.label ?? "")

const overlaySummary = computed(() => `${overlayOwnerId} · priority ${overlayPriority}`)

const summary = computed(() => {
  const focus = selectedSegments.value.length
  const segmentCopy = focus === 1 ? "segment" : "segments"
  const archiveCopy = includeArchived.value ? " · + archived pilots" : ""
  const alertCopy = alerts.value ? " · proactive alerts on" : ""
  return `${focus} ${segmentCopy} · ${weightingLabel.value}${archiveCopy}${alertCopy}`
})

function toggleSegment(segment: string) {
  if (selectedSegments.value.includes(segment)) {
    selectedSegments.value = selectedSegments.value.filter((entry) => entry !== segment)
  } else {
    selectedSegments.value = [...selectedSegments.value, segment]
  }
}

function resetFilters() {
  selectedSegments.value = [...defaultSegments]
  weighting.value = "balanced"
  includeArchived.value = false
  alerts.value = true
}

function applyFilters() {
  controller.close("programmatic")
}

watch(
  () => [selectedSegments.value.join("-"), weighting.value, includeArchived.value, alerts.value],
  () => {
    if (!state.value.open) return
    void floating.updatePosition()
  },
)
</script>

<style scoped>
.popover-playground {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.board-card {
  padding: 2rem;
  background: radial-gradient(circle at 120% 20%, rgba(251, 146, 60, 0.18), transparent 55%),
    linear-gradient(135deg, #fffaf3, #f6eadf 55%, #fff6fb);
  color: #241912;
}

.board-header h2 {
  font-size: 1.9rem;
  line-height: 1.2;
  margin: 0;
}

.board-lead {
  margin: 0;
  max-width: 38rem;
  color: #6b4f3a;
}

.board-body {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.metric-stack {
  display: grid;
  gap: 0.2rem;
}

.metric-label {
  font-size: 0.85rem;
  color: #8b6a55;
  margin: 0;
}

.metric-value {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.25rem);
}

.metric-copy {
  margin: 0;
  font-size: 0.95rem;
  color: #6b4f3a;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.overlay-meta {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #a16207;
}

.chip,
.empty-chip {
  border-radius: 999px;
  padding: 0.35rem 1rem;
  font-size: 0.85rem;
  border: 1px solid rgba(139, 92, 46, 0.18);
  background: rgba(255, 255, 255, 0.84);
  color: #241912;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.action-chip {
  background: rgba(251, 146, 60, 0.12);
  border-color: rgba(234, 88, 12, 0.35);
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease;
}

.action-chip:hover,
.action-chip:focus-visible {
  background: rgba(251, 146, 60, 0.2);
  border-color: rgba(234, 88, 12, 0.6);
}

.popover-surface {
  min-width: min(420px, calc(100vw - 1.5rem));
  max-width: 440px;
  border-radius: 1rem;
  padding: 1.5rem;
  background: #fffdf8;
  color: #241912;
  border: 1px solid rgba(139, 92, 46, 0.14);
  box-shadow: 0 25px 60px rgba(102, 72, 43, 0.18);
}

.popover-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.popover-header h3 {
  margin: 0.2rem 0 0;
}

.icon-button {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  border: 1px solid rgba(139, 92, 46, 0.18);
  background: rgba(255, 248, 240, 0.8);
  color: inherit;
  cursor: pointer;
}

.popover-section + .popover-section {
  margin-top: 1.25rem;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: #8b6a55;
}

.segment-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.segment-control {
  border: 1px solid rgba(139, 92, 46, 0.14);
  border-radius: 0.75rem;
  padding: 0.65rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}

.segment-control input {
  accent-color: #ea580c;
}

.weighting-grid {
  display: grid;
  gap: 0.65rem;
}

.weighting-card {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.9rem;
  padding: 0.8rem 0.9rem;
  display: flex;
  gap: 0.85rem;
  cursor: pointer;
}

.weighting-card input {
  margin-top: 0.2rem;
  accent-color: #38bdf8;
}

.weighting-card p {
  margin: 0 0 0.1rem;
  font-weight: 600;
}

.weighting-card span {
  color: rgba(226, 232, 240, 0.7);
  font-size: 0.85rem;
}

.signal-row {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 0.25rem;
  font-size: 0.95rem;
  cursor: pointer;
}

.signal-row + .signal-row {
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.signal-row input {
  accent-color: #f472b6;
}

.signal-row small {
  display: block;
  color: rgba(226, 232, 240, 0.65);
  font-size: 0.8rem;
}

.popover-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.popover-footer :global(.ui-button) {
  min-height: 2.5rem;
  padding-inline: 1.25rem;
}

.popover-arrow {
  position: absolute;
  width: var(--popover-arrow-size, 14px);
  height: var(--popover-arrow-size, 14px);
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.2);
  transform: rotate(45deg);
  z-index: -1;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 130ms ease, transform 130ms ease;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (max-width: 640px) {
  .board-card {
    padding: 1.5rem;
  }

  .segment-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}
</style>
