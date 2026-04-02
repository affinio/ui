<script setup lang="ts">
import { onMounted, ref } from "vue"
import QuickDetails from "@/components/QuickDetails.vue"
import StressTestMenuExample from "./examples/StressTestMenuExample.vue"
import StressTestMenuExampleSource from "./examples/StressTestMenuExample.vue?raw"
import { getDemoHighlighter, DEMO_HIGHLIGHTER_THEME } from "@/utils/highlighter"

const stylesSource = `.dataset-select {
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text-primary);
  border-radius: 1.5rem;
  padding: 0.65rem 1rem;
}

.dataset-button {
  border: 1px solid var(--glass-border);
  background: var(--surface-button);
  color: var(--text-primary);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.dataset-button:hover {
  border-color: var(--glass-highlight);
  transform: translateY(-1px);
}

.stress-toggle {
  border-radius: 1.5rem;
  border: 1px solid var(--glass-border);
  background: var(--surface-card);
  padding: 1rem 1.25rem;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stress-toggle[aria-pressed='true'] {
  border-color: var(--glass-highlight);
  background: var(--surface-card-strong);
}

.toggle-indicator {
  width: 2.1rem;
  height: 1.15rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  padding: 0 0.2rem;
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--surface-alt) 76%, transparent);
}

.toggle-indicator::after {
  content: "";
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform 0.2s ease;
}

.toggle-indicator.is-on {
  background: linear-gradient(120deg, var(--accent, #8b5cf6), var(--accent-strong, #38bdf8));
  border-color: transparent;
}

.toggle-indicator.is-on::after {
  transform: translateX(0.85rem);
}

.stress-target {
  border-radius: 2rem;
  border: 1px dashed var(--glass-border);
  padding: 1.5rem;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
}
`

const highlightedVue = ref("")
const highlightedCss = ref("")
const activeTab = ref<"starter" | "css">("starter")

const keyPoints = [
  { title: "1K item runs", icon: "compass" },
  { title: "Transform + scroll", icon: "cursor" },
  { title: "RTL ready", icon: "keyboard" },
]

onMounted(async () => {
  const highlighter = await getDemoHighlighter()

  highlightedVue.value = highlighter.codeToHtml(StressTestMenuExampleSource, {
    lang: "vue",
    theme: DEMO_HIGHLIGHTER_THEME,
  })

  highlightedCss.value = highlighter.codeToHtml(stylesSource, {
    lang: "css",
    theme: DEMO_HIGHLIGHTER_THEME,
  })
})
</script>

<template>
  <section class="menu-demo-block">
    <div class="menu-demo-description">
      <p class="menu-demo-eyebrow">Performance lab</p>
      <h3 class="menu-demo-title">Use this page only when you need the heavy edge cases.</h3>
      <p class="menu-demo-text">The stress demo is live first. Extra notes and code stay hidden below.</p>
    </div>

    <div class="demo-workspace">
      <StressTestMenuExample />
    </div>

    <QuickDetails title="Code and edge-case notes" hint="Open to inspect starter code, CSS, and heavy-layout notes.">
      <ul class="menu-key-points">
        <li v-for="point in keyPoints" :key="point.title" class="menu-key-point"><span class="menu-key-icon"><svg v-if="point.icon === 'keyboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2" ry="2" /><path d="M7 10h0.01M11 10h0.01M15 10h0.01M7 14h10" /></svg><svg v-else-if="point.icon === 'compass'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="10" /><polygon points="10 14 13 13 14 10 11 11" /></svg><svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 3l7.5 18 2-7 7 2L3 3z" /></svg></span><div><p class="menu-key-title">{{ point.title }}</p></div></li>
      </ul>
      <div class="demo-code">
        <div class="demo-code-tabs" role="tablist"><button type="button" role="tab" :aria-selected="activeTab === 'starter'" class="demo-code-tab" :class="{ 'demo-code-tab--active': activeTab === 'starter' }" @click="activeTab = 'starter'">Starter</button><button type="button" role="tab" :aria-selected="activeTab === 'css'" class="demo-code-tab" :class="{ 'demo-code-tab--active': activeTab === 'css' }" @click="activeTab = 'css'">CSS</button></div>
        <div class="demo-code-panel" role="tabpanel" v-show="activeTab === 'starter'"><div v-html="highlightedVue" /></div>
        <div class="demo-code-panel" role="tabpanel" v-show="activeTab === 'css'"><div v-html="highlightedCss" /></div>
      </div>
    </QuickDetails>
  </section>
</template>

<style scoped>
.dataset-select {
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text-primary);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.dataset-select:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.dataset-button {
  border: 1px solid var(--glass-border);
  background: var(--surface-button);
  color: var(--text-primary);
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.dataset-button:hover {
  border-color: var(--glass-highlight);
  background: var(--surface-button-hover);
  transform: translateY(-1px);
}

.dataset-button:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.stress-toggle {
  border-radius: 1.5rem;
  border: 1px solid var(--glass-border);
  background: var(--surface-card);
  padding: 1rem 1.25rem;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.stress-toggle[aria-pressed='true'] {
  border-color: var(--glass-highlight);
  background: var(--surface-card-strong);
}

.toggle-indicator {
  width: 2.1rem;
  height: 1.15rem;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 0 0.2rem;
  background: color-mix(in srgb, var(--surface-alt) 76%, transparent);
}

.toggle-indicator::after {
  content: "";
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform 0.2s ease;
}

.toggle-indicator.is-on {
  background: linear-gradient(120deg, var(--accent, #8b5cf6), var(--accent-strong, #38bdf8));
  border-color: transparent;
}

.toggle-indicator.is-on::after {
  transform: translateX(0.85rem);
}

.toggle-indicator.is-off::after {
  transform: translateX(0);
}

.stress-target {
  border-radius: 2rem;
  border: 1px dashed var(--glass-border);
  padding: 1.5rem;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  transition: transform 0.2s ease;
}
</style>
