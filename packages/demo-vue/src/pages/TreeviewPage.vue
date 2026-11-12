<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleAdapterTreeview from "@/components/SimpleAdapterTreeview.vue"

const highlights = [
  {
    title: "Same core contract",
    detail: "Ctrl/Meta-click and Shift ranges stress focus-independent multi-selection across a large virtual tree.",
  },
  {
    title: "Keyboard-first",
    detail: "Shift+Arrow extends the stable anchor; Escape clears the group and focuses the anchor; Ctrl/Meta+C/X/V emits intents.",
  },
  {
    title: "Manual control ready",
    detail: "Drag rows to inspect before/inside/after intents, accepted/rejected validation, and hover counts without mutating fixture data.",
  },
]

const snippet = `import { useTreeviewController } from "@affino/treeview-vue"

const tree = useTreeviewController({
  nodes,
  defaultExpanded: ["root"],
  selectionMode: "multiple",
})`
</script>

<template>
  <section class="adapter-page ui-page-shell">
    <header class="adapter-hero ui-copy-stack ui-page-header">
      <p class="ui-eyebrow">Affino treeview</p>
      <h1 class="ui-title">Stress selection, keyboard navigation, drag targets, and intents in a 2.4k-node tree.</h1>
      <p class="ui-lead">Use the selection controls or tree directly; the fixture reports drop and clipboard intents without changing its node data.</p>
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
