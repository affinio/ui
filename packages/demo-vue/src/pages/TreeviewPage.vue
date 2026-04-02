<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleAdapterTreeview from "@/components/SimpleAdapterTreeview.vue"

const highlights = [
  {
    title: "Same core contract",
    detail: "The treeview core keeps expansion, focus, and selection working as one coherent interaction model.",
  },
  {
    title: "Keyboard-first",
    detail: "Arrow navigation, Home/End, Enter, and Space mirror the ARIA treeview interaction pattern.",
  },
  {
    title: "Manual control ready",
    detail: "You can still drive focus and selection intentionally when the product needs more guided navigation behavior.",
  },
]

const snippet = `import { useTreeviewController } from "@affino/treeview-vue"

const tree = useTreeviewController({
  nodes,
  defaultExpanded: ["root"],
})`
</script>

<template>
  <section class="adapter-page ui-page-shell">
    <header class="adapter-hero ui-copy-stack ui-page-header">
      <p class="ui-eyebrow">Affino treeview</p>
      <h1 class="ui-title">Click nodes or use arrow keys in the tree below.</h1>
      <p class="ui-lead">The behavior demo comes first. Keyboard notes and starter code are tucked away.</p>
    </header>

    <section class="adapter-simple adapter-simple--single ui-page-main ui-page-main--single">
      <SimpleAdapterTreeview />
    </section>

    <QuickDetails title="Starter code and keyboard notes" hint="Open to see the controller scaffold and interaction notes.">
      <article class="adapter-code ui-code-card">
        <p>Controller scaffold</p>
        <pre aria-label="Treeview snippet">{{ snippet }}</pre>
      </article>
      <div class="adapter-grid ui-card-grid">
        <article v-for="card in highlights" :key="card.title" class="ui-card">
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
  color: var(--text-soft);
}

.adapter-simple {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.adapter-simple--single {
  grid-template-columns: minmax(0, 620px);
}

.adapter-highlights header h2 {
  margin: 0.4rem 0 0;
}
</style>
