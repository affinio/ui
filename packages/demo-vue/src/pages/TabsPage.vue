<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleAdapterTabs from "@/components/SimpleAdapterTabs.vue"

const highlightCards = [
  {
    title: "Flexible triggers",
    detail: "Render tabs as pills, cards, rows, or compact mobile controls without changing the underlying state flow.",
  },
  {
    title: "Easy to scale",
    detail: "A single selected value is enough to support compact tabs, richer content zones, and calmer switching between sections.",
  },
  {
    title: "Fits larger flows",
    detail: "Tabs work well next to menus, drawers, and disclosure blocks when a page needs light structure rather than a full router split.",
  },
]

const tabsSnippet = `import { useTabsController } from "@affino/tabs-vue"

const tabs = useTabsController("overview")

function select(value) {
  tabs.select(value)
}`
</script>

<template>
  <section class="adapter-page ui-page-shell">
    <header class="adapter-hero ui-copy-stack ui-page-header">
      <p class="ui-eyebrow">Affino tabs</p>
      <h1 class="ui-title">Click any tab below to switch the panel.</h1>
      <p class="ui-lead">The main interaction is visible immediately. Implementation notes stay collapsed.</p>
    </header>

    <section class="adapter-simple adapter-simple--single ui-page-main ui-page-main--single">
      <SimpleAdapterTabs />
    </section>

    <QuickDetails title="Starter code and notes" hint="Open to inspect the controller scaffold and extra tab patterns.">
      <article class="adapter-code ui-code-card">
        <p>Controller scaffold</p>
        <pre aria-label="Tabs snippet">{{ tabsSnippet }}</pre>
      </article>
      <div class="adapter-grid ui-card-grid">
        <article v-for="card in highlightCards" :key="card.title" class="ui-card">
          <h3>{{ card.title }}</h3>
          <p>{{ card.detail }}</p>
        </article>
      </div>
    </QuickDetails>
  </section>
</template>

<style scoped>
.adapter-hero {
  gap: 1rem;
}

.adapter-hero .ui-title {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.15;
}

.adapter-hero .ui-lead {
  color: #475569;
}

.adapter-simple {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: stretch;
}

.adapter-simple--single {
  grid-template-columns: minmax(0, 560px);
}

</style>
