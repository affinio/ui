<script setup lang="ts">
import { useMenuProvider } from "../context"
import UiMenuBaseContent from "./UiMenuBaseContent.vue"

const provider = useMenuProvider()
</script>

<template>
  <UiMenuBaseContent :provider="provider" variant="menu">
    <slot />
  </UiMenuBaseContent>
</template>
