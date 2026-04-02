<script setup lang="ts">
import { RouterLink } from "vue-router"
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleAdapterMenu from "@/components/SimpleAdapterMenu.vue"

const advancedFlows = [
  {
    title: "Disclosure",
    description: "Compact reveals for notes, checklists, and just-enough supporting detail.",
    to: "/disclosure",
    label: "Disclosure demo",
  },
  {
    title: "Tabs",
    description: "Softly structured multi-view layouts for switching context without losing rhythm.",
    to: "/tabs",
    label: "Tabs workspace",
  },
  {
    title: "Treeview",
    description: "Hierarchical navigation with keyboard-first focus paths.",
    to: "/treeview",
    label: "Treeview lab",
  },
  {
    title: "Menus",
    description: "Context actions, nested flows, and lighter interaction patterns.",
    to: "/menu/simple",
    label: "Menu demos",
  },
  {
    title: "Dialogs",
    description: "Modal flows with guard rails, staged exits, and clearer focus handling.",
    to: "/dialogs",
    label: "Dialog lab",
  },
  {
    title: "Tooltips & Popovers",
    description: "Shared timers + overlay kernel alignment.",
    to: "/tooltips",
    label: "Surface demos",
  },
]

const vueBootstrap = `import { bootstrapAffinoVueAdapters } from "@affino/vue-adapter"

bootstrapAffinoVueAdapters({
  diagnostics: import.meta.env.DEV,
})`

const principles = [
  "One obvious demo first",
  "Extra notes stay hidden until needed",
  "Copy-paste code is still there, just not in the way",
]
</script>

<template>
  <section class="adapter-page ui-page-shell ui-page-shell--editorial">
    <header class="adapter-hero ui-copy-stack">
      <p class="ui-eyebrow">Affino demo house</p>
      <h1 class="ui-title">Pick a pattern and click straight into the demo.</h1>
      <p class="ui-lead">Every page starts with the live interaction first. Extra notes and starter code stay tucked away.</p>
      <div class="adapter-hero__actions ui-actions-row">
        <RouterLink to="/menu/simple" class="ui-button ui-button--primary">Start with menus</RouterLink>
        <RouterLink to="/dialogs" class="ui-button ui-button--secondary">Open dialogs</RouterLink>
      </div>
    </header>

    <section class="adapter-advanced ui-section-stack">
      <header class="ui-section-heading">
        <p>Pick a demo</p>
        <h2>Open the interaction you want to test</h2>
      </header>
      <div class="adapter-grid ui-card-grid">
        <RouterLink v-for="flow in advancedFlows" :key="flow.title" :to="flow.to" class="adapter-card">
          <div>
            <p class="adapter-card__eyebrow">{{ flow.label }}</p>
            <h3>{{ flow.title }}</h3>
            <p>{{ flow.description }}</p>
          </div>
          <span aria-hidden="true">↗</span>
        </RouterLink>
      </div>
    </section>

    <QuickDetails title="Preview and setup" hint="Open this only if you want the home-page preview or bootstrap snippet.">
      <section class="adapter-simple">
        <SimpleAdapterMenu />
        <article class="adapter-code ui-code-card">
          <p>Small bootstrap, shared runtime</p>
          <pre aria-label="Vue adapter bootstrap snippet">{{ vueBootstrap }}</pre>
        </article>
      </section>
      <ul class="adapter-principles">
        <li v-for="principle in principles" :key="principle">{{ principle }}</li>
      </ul>
    </QuickDetails>
  </section>
</template>

<style scoped>
.adapter-hero {
  gap: 1.15rem;
}

.adapter-hero .ui-title {
  margin: 0;
  font-size: clamp(2.5rem, 6vw, 4.4rem);
  line-height: 1;
  max-width: 10ch;
}

.adapter-hero .ui-lead {
  max-width: 44rem;
}

.adapter-principles {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.7rem;
  margin: 0.5rem 0 0;
  padding: 0;
}

.adapter-principles li {
  padding: 0.85rem 1rem;
  border-radius: 1.2rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.45);
  font-size: 0.88rem;
  color: var(--text-muted);
}

.adapter-simple {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: stretch;
}

.adapter-advanced header h2 {
  margin: 0;
  font-size: 1.8rem;
}

.adapter-card {
  border-radius: 1.6rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 252, 247, 0.72);
  padding: 1.4rem;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  justify-content: space-between;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.adapter-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 34px rgba(118, 94, 61, 0.1);
}

.adapter-card__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 0.7rem;
  color: var(--text-soft);
}

.adapter-card h3 {
  margin: 0;
  font-size: 1.2rem;
}

.adapter-card p {
  margin: 0;
  color: var(--text-muted);
}

.adapter-card span:last-child {
  font-size: 1.2rem;
  color: var(--accent);
  align-self: flex-end;
}
</style>
