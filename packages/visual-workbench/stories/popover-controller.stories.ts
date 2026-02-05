import type { Meta, StoryObj } from "@storybook/vue3"
import { computed } from "vue"
import { useFloatingPopover, usePopoverController } from "@affino/popover-vue"

const meta = {
  title: "Vue Adapters/Overlays/Popover Controller",
  tags: ["autodocs"],
  args: {
    placement: "bottom",
    align: "start",
    gutter: 10,
    closeOnInteractOutside: true,
  },
  argTypes: {
    placement: { control: "radio", options: ["top", "right", "bottom", "left"] },
    align: { control: "radio", options: ["start", "center", "end"] },
    gutter: { control: { type: "range", min: 0, max: 24, step: 1 } },
    closeOnInteractOutside: { control: "boolean" },
  },
  render: (args: {
    placement: "top" | "right" | "bottom" | "left"
    align: "start" | "center" | "end"
    gutter: number
    closeOnInteractOutside: boolean
  }) => ({
    setup() {
      const controller = usePopoverController({
        closeOnInteractOutside: args.closeOnInteractOutside,
      })
      const floating = useFloatingPopover(controller, {
        teleportTo: false,
        placement: args.placement,
        align: args.align,
        gutter: args.gutter,
      })
      const triggerProps = computed(() => controller.getTriggerProps())
      const contentProps = computed(() => controller.getContentProps({ role: "dialog", modal: false }))
      return {
        state: controller.state,
        triggerProps,
        contentProps,
        ...floating,
      }
    },
    template: `
      <div style="position: relative; min-width: 560px; min-height: 220px; padding: 24px;">
        <button ref="triggerRef" v-bind="triggerProps" type="button">Toggle popover</button>
        <div
          ref="contentRef"
          v-bind="contentProps"
          :style="[contentStyle, { minWidth: '220px', border: '1px solid #d4d7dd', borderRadius: '10px', background: '#fff', padding: '12px', boxShadow: '0 12px 30px rgba(0, 0, 0, 0.08)' }]"
        >
          <p style="margin: 0 0 8px 0; font-weight: 600;">Popover surface</p>
          <p style="margin: 0; font-size: 13px;">State: {{ state.open ? 'open' : 'closed' }}</p>
        </div>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
