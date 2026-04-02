<script setup lang="ts">
import { computed } from "vue"
import { useRoute } from "vue-router"
import AppHeader from "@/layouts/AppHeader.vue"
import AppFooter from "@/layouts/AppFooter.vue"
import OverlayStackPanel from "@/components/OverlayStackPanel.vue"

const route = useRoute()

const fullWidthContent = computed(() => route.meta.layoutWidth === "full")
const lockMainScroll = computed(() => route.meta.lockMainScroll === true)
const fitViewport = computed(() => route.meta.fitViewport === true)
</script>

<template>
  <div class="app-shell">
    <AppHeader class="app-shell__header" />
    <main class="app-shell__main" :class="{ 'app-shell__main--locked': lockMainScroll }">
      <div
        class="app-shell__content"
        :class="{
          'app-shell__content--full': fullWidthContent,
          'app-shell__content--fit': fitViewport,
        }"
      >
        <router-view />
      </div>
    </main>
    <AppFooter class="app-shell__footer" />
    <OverlayStackPanel />
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  min-height: 100vh;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.app-shell__header,
.app-shell__footer {
  flex-shrink: 0;
  position: relative;
  z-index: 20;
}

.app-shell__main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.app-shell__main--locked {
  overflow: hidden;
  display: flex;
}

.app-shell__content {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: 1rem 1rem 3rem;
}

.app-shell__content--full {
  max-width: none;
  margin: 0;
}

.app-shell__content--fit {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 1rem 1rem 1rem;
  overflow: hidden;
}

.app-shell__content--fit > * {
  flex: 1 1 auto;
  min-height: 0;
}

@media (min-width: 1024px) {
  .app-shell__content {
    padding: 1rem 2rem 3rem;
  }

  .app-shell__content--fit {
    padding: 1rem 2rem 1.25rem;
  }
}
</style>
