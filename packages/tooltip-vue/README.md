# @affino/tooltip-vue

Vue composables that wrap `@affino/tooltip-core` so you can wire triggers and floating content without duplicating controller logic.

```bash
pnpm add @affino/tooltip-vue
```

## Usage

```ts
import { useTooltipController } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "field-help" })

const triggerProps = controller.getTriggerProps()
const tooltipProps = controller.getTooltipProps()
```

Bind the returned props onto your Vue template via `v-bind` and watch `controller.state.value` for declarative updates.
