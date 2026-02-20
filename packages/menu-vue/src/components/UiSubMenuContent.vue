<script setup lang="ts">
import type { Alignment, Placement } from "@affino/menu-core"
import { useMenuProvider } from "../context"
import UiMenuBaseContent from "./UiMenuBaseContent.vue"

const props = defineProps<{
  placement?: Placement
  align?: Alignment
  gutter?: number
  viewportPadding?: number
}>()

const provider = useMenuProvider()
</script>

<template>
  <UiMenuBaseContent
    :provider="provider"
    variant="submenu"
    :placement="props.placement"
    :align="props.align"
    :gutter="props.gutter"
    :viewport-padding="props.viewportPadding"
  >
    <slot />
  </UiMenuBaseContent>
</template>
