<script setup lang="ts">
import { onMounted, ref } from "vue"
import QuickDetails from "@/components/QuickDetails.vue"
import SimpleMenuExample from "./examples/SimpleMenuExample.vue"
import SimpleMenuExampleSource from "./examples/SimpleMenuExample.vue?raw"
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

.menu-demo-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  margin: 0 auto;
  padding: 1.5rem 1.75rem;
  width: fit-content;
}

.menu-demo-trigger {
  padding: 0.7rem 1.6rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #05060a;
  background: linear-gradient(120deg, var(--accent), var(--accent-strong));
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}

.menu-demo-trigger:hover {
  transform: translateY(-1px);
  opacity: 0.96;
}

.menu-demo-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent),
    0 18px 40px rgba(15, 23, 42, 0.3);
}

.menu-playground-panel {
  width: var(--ui-menu-max-width, 320px);
  max-width: min(100%, var(--ui-menu-max-width, 320px));
  border-radius: 1.25rem;
  background: var(--surface-solid);
  border: 1px solid var(--glass-border);
  box-shadow: 0 18px 32px rgba(6, 9, 16, 0.28);
  backdrop-filter: blur(18px);
  padding: 0.55rem 0;
  color: var(--text-primary);
  --ui-menu-bg: transparent;
  --ui-menu-border: color-mix(in srgb, var(--glass-border) 90%, transparent);
  --ui-menu-hover-bg: color-mix(in srgb, var(--surface-button-hover) 78%, transparent);
  --ui-menu-text: var(--text-primary);
  --ui-submenu-trigger-text: var(--text-primary);
  --ui-menu-muted: var(--text-muted);
  --ui-menu-separator: color-mix(in srgb, var(--text-muted) 35%, transparent);
  --ui-menu-danger: #f87171;
  --ui-menu-focus-ring: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

.menu-playground-panel[data-state="closed"] {
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
}

.menu-playground-panel[data-state="open"] {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.menu-shortcut {
  font-size: 0.7rem;
  color: var(--ui-menu-muted);
}

.demo-last-action {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.demo-last-action__label {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.68rem;
  color: var(--text-soft);
}

.demo-last-action__label::after {
  content: ":";
  margin-left: 0.25rem;
}

.demo-last-action__value {
  color: var(--text-primary);
  font-weight: 600;
}

.demo-last-action__label,
.demo-last-action__value {
  margin: 0;
}
`

const highlightedVue = ref("")
const highlightedCss = ref("")
const activeTab = ref<"starter" | "css">("starter")

const keyPoints = [
  {
    title: "Keyboard navigation",
    icon: "keyboard",
  },
  {
    title: "Smart positioning",    
    icon: "compass",
  },
  {
    title: "Mouse intent",
    icon: "cursor",
  },
]

onMounted(async () => {
  const highlighter = await getDemoHighlighter()

  highlightedVue.value = highlighter.codeToHtml(SimpleMenuExampleSource, {
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
      <p class="menu-demo-eyebrow">Primary flow</p>
      <h3 class="menu-demo-title">Click the button to open the menu.</h3>
      <p class="menu-demo-text">Starter code and implementation notes are hidden below.</p>
    </div>

    <div class="demo-workspace">
      <SimpleMenuExample />
    </div>

    <QuickDetails title="Code and key points" hint="Open to inspect starter code, CSS, and behavior notes.">
      <ul class="menu-key-points">
        <li v-for="point in keyPoints" :key="point.title" class="menu-key-point">
          <span class="menu-key-icon">
            <svg v-if="point.icon === 'keyboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
              <path d="M7 10h0.01M11 10h0.01M15 10h0.01M7 14h10" />
            </svg>
            <svg v-else-if="point.icon === 'compass'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 14 13 13 14 10 11 11" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 3l7.5 18 2-7 7 2L3 3z" />
            </svg>
          </span>
          <div>
            <p class="menu-key-title">{{ point.title }}</p>
          </div>
        </li>
      </ul>

      <div class="demo-code">
        <div class="demo-code-tabs" role="tablist">
          <button type="button" role="tab" :aria-selected="activeTab === 'starter'" class="demo-code-tab" :class="{ 'demo-code-tab--active': activeTab === 'starter' }" @click="activeTab = 'starter'">Starter</button>
          <button type="button" role="tab" :aria-selected="activeTab === 'css'" class="demo-code-tab" :class="{ 'demo-code-tab--active': activeTab === 'css' }" @click="activeTab = 'css'">CSS</button>
        </div>
        <div class="demo-code-panel" role="tabpanel" v-show="activeTab === 'starter'"><div v-html="highlightedVue" /></div>
        <div class="demo-code-panel" role="tabpanel" v-show="activeTab === 'css'"><div v-html="highlightedCss" /></div>
      </div>
    </QuickDetails>
  </section>
</template>
