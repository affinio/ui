<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const activeCore = computed(() => {
  if (route.path.startsWith('/menu')) return 'Menu'
  if (route.path.startsWith('/combobox')) return 'Combobox'
  if (route.path.startsWith('/tooltips')) return 'Tooltips'
  if (route.path.startsWith('/dialogs')) return 'Dialog'
  if (route.path.startsWith('/popovers')) return 'Popover'
  if (route.path.startsWith('/tabs')) return 'Tabs'
  if (route.path.startsWith('/disclosure')) return 'Disclosure'
  if (route.path.startsWith('/treeview')) return 'Treeview'
  return 'Overview'
})

// Какие cores реально имеют адаптеры
const coreCapabilities: Record<string, { adapters: boolean }> = {
  menu: { adapters: true },
  dialog: { adapters: true },
  disclosure: { adapters: true },
  combobox: { adapters: true },
  tabs: { adapters: true },
  treeview: { adapters: true },
  tooltips: { adapters: true },
  popover: { adapters: true },
}

const subtitle = computed(() => {
  const key = activeCore.value.toLowerCase()
  const hasAdapters = coreCapabilities[key]?.adapters

  if (!hasAdapters) return 'A quieter surface for validating core interaction patterns'
  return 'Vue reference scenes for quick copy-paste experiments'
})
</script>

<template>
  <header class="app-header">
    <div class="app-header__shell">
      <div class="app-header__brand">
        <RouterLink to="/" class="app-header__brand-link">
          <p class="app-header__eyebrow">Affino sandbox</p>
          <div class="app-header__title-row">
            <h1>Affino</h1>
            <span class="header-pill">curated</span>
          </div>
        </RouterLink>

        <p class="app-header__subtitle">{{ activeCore }} · {{ subtitle }}</p>
      </div>

      <nav class="app-header__nav">
        <RouterLink to="/menu" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/menu') }"
          >
            Menu
          </a>
        </RouterLink>

        <RouterLink to="/combobox" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/combobox') }"
          >
            Combobox
          </a>
        </RouterLink>

        <RouterLink to="/dialogs" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/dialogs') }"
          >
            Dialogs
          </a>
        </RouterLink>

        <RouterLink to="/disclosure" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/disclosure') }"
          >
            Disclosure
          </a>
        </RouterLink>

        <RouterLink to="/tabs" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/tabs') }"
          >
            Tabs
          </a>
        </RouterLink>

        <RouterLink to="/popovers" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/popovers') }"
          >
            Popovers
          </a>
        </RouterLink>

        <RouterLink to="/tooltips" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/tooltips') }"
          >
            Tooltips
          </a>
        </RouterLink>

        <RouterLink to="/treeview" v-slot="{ href }">
          <a
            :href="href"
            class="nav-link"
            :class="{ 'nav-link--active': route.path.startsWith('/treeview') }"
          >
            Treeview
          </a>
        </RouterLink>

        <!-- GitHub -->
        <a
          href="https://github.com/affinio/affinio"
          target="_blank"
          rel="noreferrer"
          class="github-link"
          aria-label="Affino on GitHub"
        >
          <svg viewBox="0 0 24 24" class="github-icon" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 .5C5.73.5.5 5.74.5 12.18c0 5.15 3.44 9.52 8.2 11.06.6.12.82-.27.82-.6
           0-.3-.01-1.09-.02-2.14-3.34.74-4.04-1.64-4.04-1.64-.55-1.42-1.34-1.8-1.34-1.8
           -1.09-.77.08-.76.08-.76 1.2.09 1.83 1.26 1.83 1.26
           1.07 1.86 2.8 1.32 3.48 1.01.11-.8.42-1.32.76-1.62
           -2.66-.31-5.47-1.36-5.47-6.06
           0-1.34.46-2.44 1.22-3.3
           -.12-.31-.53-1.56.12-3.25
           0 0 1-.33 3.3 1.26
           .96-.27 1.98-.41 3-.41
           1.02 0 2.04.14 3 .41
           2.3-1.59 3.3-1.26 3.3-1.26
           .65 1.69.24 2.94.12 3.25
           .76.86 1.22 1.96 1.22 3.3
           0 4.71-2.81 5.75-5.49 6.05
           .43.38.81 1.12.81 2.26
           0 1.63-.02 2.95-.02 3.35
           0 .33.22.72.83.6
           4.76-1.54 8.19-5.91 8.19-11.06
           C23.5 5.74 18.27.5 12 .5Z"
            />
          </svg>
        </a>
      </nav>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 40;
  padding: 1.25rem 1rem 0;
}

.app-header__shell {
  max-width: 74rem;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.2fr) auto;
  align-items: start;
  padding: 1.25rem 1.4rem;
  border-radius: 30px;
  border: 1px solid var(--glass-border);
  background: linear-gradient(180deg, rgba(255, 250, 242, 0.88), rgba(251, 246, 238, 0.78));
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 50px rgba(116, 89, 58, 0.08);
}

.app-header__brand {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.app-header__brand-link {
  display: inline-flex;
  flex-direction: column;
  gap: 0.3rem;
  text-decoration: none;
  width: fit-content;
}

.app-header__eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  font-size: 0.68rem;
  color: var(--text-soft);
}

.app-header__title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.app-header__title-row h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 2.6rem);
  line-height: 0.95;
}

.app-header__subtitle {
  margin: 0;
  max-width: 34rem;
  font-size: 0.92rem;
  color: var(--text-muted);
}

.app-header__nav {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.header-pill {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  padding: 0.38rem 0.8rem;
  font-size: 0.62rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent-soft) 72%, white 28%);
}

.nav-link {
  color: var(--text-soft);
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  padding: 0.62rem 0.95rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.34);
}

.nav-link:hover {
  color: var(--text-primary);
  border-color: var(--glass-border);
  background: rgba(255, 255, 255, 0.68);
}

.nav-link--active {
  color: var(--text-primary);
  position: relative;
  border-color: color-mix(in srgb, var(--accent) 22%, transparent);
  background: linear-gradient(120deg, rgba(47, 111, 108, 0.12), rgba(211, 124, 94, 0.16));
}

.nav-link--active::after {
  content: '';
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 8px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(120deg, var(--accent), var(--accent-strong));
}

.github-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  transition:
    color 0.15s ease,
    transform 0.15s ease;
}

.github-link:hover {
  color: var(--text-primary);
  transform: translateY(-1px);
}

.github-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  border-radius: 6px;
}

.github-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 920px) {
  .app-header__shell {
    grid-template-columns: 1fr;
  }
}
</style>
