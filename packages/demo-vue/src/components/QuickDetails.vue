<script setup lang="ts">
defineProps<{
  title: string
  hint?: string
  open?: boolean
}>()
</script>

<template>
  <details class="quick-details ui-card" :open="open">
    <summary class="quick-details__summary">
      <div class="quick-details__copy">
        <p class="ui-eyebrow">More</p>
        <h2>{{ title }}</h2>
        <p v-if="hint" class="quick-details__hint">{{ hint }}</p>
      </div>
      <span class="quick-details__icon" aria-hidden="true">+</span>
    </summary>

    <div class="quick-details__body">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.quick-details {
  padding: 0;
  overflow: hidden;
}

.quick-details__summary {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem;
  cursor: pointer;
}

.quick-details__summary::-webkit-details-marker {
  display: none;
}

.quick-details__copy {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.quick-details__copy h2,
.quick-details__copy p {
  margin: 0;
}

.quick-details__copy h2 {
  font-size: 1.1rem;
}

.quick-details__hint {
  color: var(--text-muted);
}

.quick-details__icon {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.62);
  font-size: 1.1rem;
  line-height: 1;
  transition: transform 0.15s ease;
}

.quick-details[open] .quick-details__icon {
  transform: rotate(45deg);
}

.quick-details__body {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>