<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from "vue-router"
import { computed } from "vue"

const tabs = [
  { name: "menu.simple", label: "Simple actions", to: "/menu/simple" },
  { name: "menu.nested", label: "Nested workflows", to: "/menu/nested" },
  { name: "menu.context", label: "Context trigger", to: "/menu/context" },
  { name: "menu.command", label: "Command center", to: "/menu/command" },
  { name: "menu.stress", label: "Overload", to: "/menu/stress" },
]

const route = useRoute()
const activeName = computed(() => route.name)
</script>

<template>
  <section class="menu-demos ui-page-shell space-y-6">
    <div class="menu-demos__hero">
      <p class="menu-demos__eyebrow">Affino menu</p>
      <h1 class="text-center text-4xl">Pick a menu case and click the trigger.</h1>
      <p class="menu-demos__hint">The live interaction comes first on every tab. Code and extra notes stay collapsed.</p>
    </div>
    <nav
      class="menu-demos__nav"
      role="tablist"
      aria-label="Menu demos"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.to"
        class="menu-demos__tab"
        :class="{ 'is-active': activeName === tab.name }"
        role="tab"
        :aria-selected="activeName === tab.name"
      >
        <span>{{ tab.label }}</span>
      </RouterLink>
    </nav>

    <RouterView />
  </section>
</template>

<style scoped>
.menu-demos__hero {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.menu-demos__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  font-size: 0.72rem;
  color: var(--text-soft);
}

.menu-demos__hint {
  margin: 0;
  color: var(--text-muted);
  text-align: center;
}

.menu-demos__nav {
  display: flex;
  flex-wrap: wrap;
  width: fit-content;
  margin-inline: auto;
  gap: 0.25rem;
  padding: 0.25rem;
  border-radius: 999px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(12px);
}

.menu-demos__tab {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.95rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-soft);
  text-decoration: none;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.menu-demos__tab:hover {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--glass-bg) 60%, transparent);
}

.menu-demos__tab.is-active {
  color: var(--text-primary);
  background: linear-gradient(
    120deg,
    color-mix(in srgb, var(--accent) 22%, transparent),
    color-mix(in srgb, var(--accent-strong) 18%, transparent)
  );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent),
    0 6px 18px rgba(15, 23, 42, 0.18);
}

.menu-demos__tab:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}
</style>
