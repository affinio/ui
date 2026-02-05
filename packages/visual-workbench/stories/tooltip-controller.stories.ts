import type { Meta, StoryObj } from "@storybook/vue3"
import { computed } from "vue"
import { useFloatingTooltip, useTooltipController } from "@affino/tooltip-vue"

const meta = {
  title: "Vue Adapters/Overlays/Tooltip Controller",
  tags: ["autodocs"],
  args: {
    placement: "top",
    align: "center",
    gutter: 8,
    openDelay: 80,
    closeDelay: 120,
  },
  argTypes: {
    placement: { control: "radio", options: ["top", "right", "bottom", "left"] },
    align: { control: "radio", options: ["start", "center", "end"] },
    gutter: { control: { type: "range", min: 0, max: 24, step: 1 } },
    openDelay: { control: { type: "number", min: 0, step: 10 } },
    closeDelay: { control: { type: "number", min: 0, step: 10 } },
  },
  render: (args: {
    placement: "top" | "right" | "bottom" | "left"
    align: "start" | "center" | "end"
    gutter: number
    openDelay: number
    closeDelay: number
  }) => ({
    setup() {
      const controller = useTooltipController({
        openDelay: args.openDelay,
        closeDelay: args.closeDelay,
      })
      const floating = useFloatingTooltip(controller, {
        teleportTo: false,
        placement: args.placement,
        align: args.align,
        gutter: args.gutter,
      })
      const triggerProps = computed(() => controller.getTriggerProps())
      const tooltipProps = computed(() => controller.getTooltipProps())
      return {
        state: controller.state,
        triggerProps,
        tooltipProps,
        ...floating,
      }
    },
    template: `
      <div style="position: relative; min-width: 560px; min-height: 180px; padding: 24px;">
        <button ref="triggerRef" v-bind="triggerProps" type="button">Hover or focus me</button>
        <div
          ref="tooltipRef"
          v-bind="tooltipProps"
          :style="[tooltipStyle, { borderRadius: '8px', background: '#111827', color: '#f9fafb', padding: '8px 10px', fontSize: '12px', boxShadow: '0 10px 20px rgba(0, 0, 0, 0.2)' }]"
        >
          Helpful hint · {{ state.open ? 'open' : 'closed' }}
        </div>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
