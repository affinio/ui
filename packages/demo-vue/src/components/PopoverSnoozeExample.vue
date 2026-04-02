<template>
  <section class="snooze-shell ui-demo-shell">
    <article class="snooze-card">
      <header class="snooze-card__header">
        <div>
          <p class="ui-eyebrow">Notification</p>
          <h3>Daily briefing</h3>
        </div>
        <span class="pill">live</span>
      </header>
      <p class="snooze-card__body">
        A compact update arrives each morning. Snooze it for a while when you need a quieter window to work.
      </p>
      <footer class="snooze-card__footer">
        <div class="snooze-meta" aria-live="polite">
          <span class="snooze-meta__label">Current pause</span>
          <span class="snooze-meta__value">{{ selectedWindowLabel }}</span>
        </div>
        <button ref="triggerRef" v-bind="controller.getTriggerProps()" class="snooze-trigger ui-button ui-button--secondary" type="button">
          Snooze
        </button>
      </footer>
    </article>

    <Teleport :to="teleportTarget">
      <Transition name="snooze-fade" appear>
        <div
          v-if="state.open"
          ref="contentRef"
          v-bind="controller.getContentProps({ role: 'menu', tabIndex: -1 })"
          :style="contentStyle"
          class="snooze-popover"
        >
          <p class="snooze-popover__title">Pause alerts</p>
          <ul class="snooze-options" role="menu">
            <li v-for="option in snoozeWindows" :key="option.value">
              <button
                class="snooze-option"
                type="button"
                role="menuitemradio"
                :aria-checked="selectedWindow === option.value ? 'true' : 'false'"
                @click="selectWindow(option.value)"
              >
                <div>
                  <span>{{ option.label }}</span>
                  <small>{{ option.description }}</small>
                </div>
                <span class="dot" aria-hidden="true" v-if="selectedWindow === option.value"></span>
              </button>
            </li>
          </ul>
          <button class="inline-dismiss" type="button" @click="controller.close()">Cancel</button>
          <span v-if="arrowProps" class="snooze-arrow" v-bind="arrowProps"></span>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useFloatingPopover, usePopoverController } from "@affino/popover-vue"

const controller = usePopoverController({
  id: "notification-snooze",
  role: "menu",
  modal: false,
})

const state = controller.state

const floating = useFloatingPopover(controller, {
  placement: "bottom",
  align: "end",
  gutter: 12,
  arrow: {
    size: 10,
    inset: 14,
  },
  lockScroll: false,
  returnFocus: true,
})

const triggerRef = floating.triggerRef
const contentRef = floating.contentRef
const contentStyle = floating.contentStyle
const teleportTarget = floating.teleportTarget
const arrowProps = floating.arrowProps

const snoozeWindows = [
  { value: "15m", label: "15 minutes", description: "Keep pings quiet during a quick huddle." },
  { value: "1h", label: "1 hour", description: "Mute alerts until you wrap the review." },
  { value: "24h", label: "Until tomorrow", description: "Resume the digest in the next daily slot." },
  { value: "mon", label: "Until Monday", description: "Hold everything until the next cycle reset." },
]

const selectedWindow = ref<string>("1h")

const selectedWindowLabel = computed(() => snoozeWindows.find((window) => window.value === selectedWindow.value)?.label ?? "--")

function selectWindow(value: string) {
  selectedWindow.value = value
  controller.close("programmatic")
}

watch(
  () => selectedWindow.value,
  () => {
    if (!state.value.open) return
    void floating.updatePosition()
  },
)
</script>

<style scoped>
.snooze-shell {
  background: radial-gradient(circle at top right, rgba(251, 146, 60, 0.18), transparent 55%), #fffaf3;
  color: #241912;
  min-height: 100%;
}

.snooze-card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.snooze-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.snooze-card__header h3 {
  margin: 0.15rem 0 0;
  font-size: 1.4rem;
}

.pill {
  border-radius: 999px;
  padding: 0.2rem 0.9rem;
  border: 1px solid rgba(250, 250, 250, 0.35);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.snooze-card__body {
  margin: 0;
  color: #6b4f3a;
  line-height: 1.5;
}

.snooze-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.snooze-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.snooze-meta__label {
  font-size: 0.75rem;
  color: #8b6a55;
}

.snooze-meta__value {
  font-size: 1.05rem;
}

.snooze-trigger {
  padding-inline: 1.35rem;
}

.snooze-trigger:hover,
.snooze-trigger:focus-visible {
  opacity: 0.96;
}

.snooze-popover {
  width: 280px;
  border-radius: 1rem;
  padding: 1rem;
  background: #fffdf8;
  border: 1px solid rgba(139, 92, 46, 0.14);
  box-shadow: 0 18px 40px rgba(102, 72, 43, 0.16);
  color: #241912;
}

.snooze-popover__title {
  margin: 0 0 0.75rem;
  font-weight: 600;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8b6a55;
}

.snooze-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.snooze-option {
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid rgba(139, 92, 46, 0.12);
  background: rgba(255, 248, 240, 0.9);
  color: inherit;
  text-align: left;
  padding: 0.75rem 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.snooze-option small {
  display: block;
  color: #8b6a55;
  font-size: 0.78rem;
  margin-top: 0.1rem;
}

.snooze-option:hover,
.snooze-option:focus-visible {
  border-color: rgba(234, 88, 12, 0.45);
  background: rgba(251, 146, 60, 0.14);
}

.dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
  background: linear-gradient(120deg, #f59e0b, #fb7185);
}

.inline-dismiss {
  margin-top: 0.75rem;
  background: transparent;
  border: none;
  color: #8b6a55;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}

.snooze-arrow {
  position: absolute;
  width: var(--popover-arrow-size, 12px);
  height: var(--popover-arrow-size, 12px);
  background: #0b1120;
  border: 1px solid rgba(148, 163, 184, 0.25);
  transform: rotate(45deg);
  z-index: -1;
}

.snooze-fade-enter-active,
.snooze-fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.snooze-fade-enter-from,
.snooze-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
