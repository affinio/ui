<script setup lang="ts">
import type { MenuCallbacks, MenuOptions } from "@affino/menu-core"
import { provideMenuProvider } from "../context"
import { useMenuController } from "../useMenuController"

const props = defineProps<{ options?: MenuOptions; callbacks?: MenuCallbacks }>()

const controller = useMenuController({ kind: "root", options: props.options, callbacks: props.callbacks })

const provider = provideMenuProvider({ controller })

defineExpose({ controller })
</script>

<template>
  <div class="ui-menu">
    <slot />
  </div>
</template>
