<script setup lang="ts">
import { onMounted, ref } from "vue"
import QuickDetails from "@/components/QuickDetails.vue"
import ContextMenuExample from "./examples/ContextMenuExample.vue"
import ContextMenuExampleSource from "./examples/ContextMenuExample.vue?raw"
import { getDemoHighlighter, DEMO_HIGHLIGHTER_THEME } from "@/utils/highlighter"

const stylesSource = `:root {
  --glass-border: rgba(255, 255, 255, 0.08);
  --surface-solid: #0e121d;
  --surface-button-hover: rgba(255, 255, 255, 0.12);
  --text-primary: #edf2ff;
  --text-muted: rgba(237, 242, 255, 0.7);
  --text-soft: rgba(237, 242, 255, 0.55);
  --accent: #8b5cf6;
  --accent-strong: #38bdf8;
}

.menu-demo-surface {
  width: 100%;
  border-radius: 32px;
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--surface-solid) 82%, transparent);
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  text-align: center;
}

.menu-demo-trigger {
  padding: 0.7rem 1.6rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #05060a;
  background: linear-gradient(120deg, var(--accent), var(--accent-strong));
}

.menu-playground-panel {
  width: var(--ui-menu-max-width, 320px);
  border-radius: 1.25rem;
  background: var(--surface-solid);
  border: 1px solid var(--glass-border);
  padding: 0.55rem 0;
  color: var(--text-primary);
}

.demo-last-action {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 0.45rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
`

const highlightedVue = ref("")
const highlightedCss = ref("")
const activeTab = ref<"starter" | "css">("starter")

const keyPoints = [
  { title: "Pointer anchored", icon: "cursor" },
  { title: "asChild trigger", icon: "keyboard" },
  { title: "Context shortcuts", icon: "compass" },
]

onMounted(async () => {
  const highlighter = await getDemoHighlighter()

  highlightedVue.value = highlighter.codeToHtml(ContextMenuExampleSource, {
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
      <p class="menu-demo-eyebrow">Context trigger</p>
      <h3 class="menu-demo-title">Right-click the demo area to open the menu.</h3>
      <p class="menu-demo-text">Starter code and notes stay hidden below.</p>
    </div>

    <div class="demo-workspace">
      <ContextMenuExample />
    </div>

    <QuickDetails title="Code and key points" hint="Open to inspect starter code, CSS, and right-click behavior notes.">
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
