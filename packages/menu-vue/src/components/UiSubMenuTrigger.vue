<script setup lang="ts">
import { useMenuProvider } from "../context"
import UiMenuBaseTrigger from "./UiMenuBaseTrigger.vue"

const props = defineProps<{ asChild?: boolean }>()
const provider = useMenuProvider()
</script>

<template>
  <UiMenuBaseTrigger
    :provider="provider"
    variant="submenu"
    :as-child="props.asChild"
    component-label="UiSubMenuTrigger"
    show-arrow
  >
    <slot />
  </UiMenuBaseTrigger>
</template>
