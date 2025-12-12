<script setup lang="ts">
import { useMenuProvider } from "./context"
import UiMenuBaseTrigger from "./UiMenuBaseTrigger.vue"

const props = defineProps<{ asChild?: boolean; trigger?: "click" | "contextmenu" | "both" }>()

const provider = useMenuProvider()
</script>

<template>
  <UiMenuBaseTrigger
    :provider="provider"
    variant="menu"
    :as-child="props.asChild"
    :trigger-mode="props.trigger"
    component-label="UiMenuTrigger"
  >
    <slot />
  </UiMenuBaseTrigger>
</template>
