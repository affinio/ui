<script setup lang="ts">
import { useRoute } from "vue-router"

const route = useRoute()
</script>

<template>
  <article class="workspace-content">
    <p class="ui-eyebrow">Open document</p>
    <h2>{{ route.params.documentId }}</h2>
    <p>This document view is rendered by the active URL. Switch tabs and use Back/Forward to restore it.</p>
    <textarea :aria-label="`Notes for document ${route.params.documentId}`" :placeholder="`Notes for ${route.params.documentId}…`" />
  </article>
</template>

<style scoped>
.workspace-content { display: grid; align-content: start; gap: 0.8rem; min-height: 15rem; padding: 1.5rem; border: 1px solid var(--glass-border); border-radius: 1rem; background: color-mix(in srgb, var(--surface-alt) 72%, transparent); }
.workspace-content h2, .workspace-content p { margin: 0; }
.workspace-content > p:last-of-type { color: var(--text-muted); }
.workspace-content textarea { min-height: 7rem; margin-top: 0.6rem; padding: 0.7rem 0.8rem; resize: vertical; border: 1px solid var(--glass-border); border-radius: 0.6rem; color: var(--text-primary); background: var(--surface); font: inherit; }
</style>
