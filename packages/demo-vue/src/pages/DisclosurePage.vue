<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleAdapterDisclosure from "@/components/SimpleAdapterDisclosure.vue"

const highlightCards = [
  {
    title: "Quiet state control",
    detail: "The disclosure controller gives you one clear open state, so the UI, motion, and any side notes stay aligned.",
  },
  {
    title: "Easy to adapt",
    detail: "The open-close contract stays simple, so the same pattern can be reshaped for settings, notes, or inline status blocks.",
  },
  {
    title: "Your presentation, not ours",
    detail: "Use it for FAQ rows, release notes, compact status trays, or anything else that needs a simple reveal.",
  },
]

const disclosureSnippet = `import { useDisclosureController } from "@affino/disclosure-vue"
import { computed } from "vue"

const disclosure = useDisclosureController(false)
const isOpen = computed(() => disclosure.state.value.open)

function toggle() {
  disclosure.toggle()
}`
</script>

<template>
  <section class="adapter-page ui-page-shell ui-page-shell--warm">
    <header class="adapter-hero ui-copy-stack ui-page-header">
      <p class="ui-eyebrow">Affino disclosure</p>
      <h1 class="ui-title">Click the button below to open and close the panel.</h1>
      <p class="ui-lead">Starter code and extra notes are hidden until you ask for them.</p>
    </header>

    <section class="adapter-simple adapter-simple--single ui-page-main ui-page-main--single">
      <SimpleAdapterDisclosure />
    </section>

    <QuickDetails title="Starter code and notes" hint="Open to see the controller scaffold and a few usage notes.">
      <article class="adapter-code ui-code-card ui-code-card--contrast">
        <p>Controller scaffold</p>
        <pre aria-label="Disclosure snippet">{{ disclosureSnippet }}</pre>
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
  line-height: 1.1;
}

.adapter-hero .ui-lead {
  color: #6b4f3a;
}

.adapter-simple {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  align-items: stretch;
}

.adapter-simple--single {
  grid-template-columns: minmax(0, 480px);
}

.adapter-highlights header h2,
.adapter-highlights header p:last-child {
  margin: 0;
  color: #35261c;
}
</style>
