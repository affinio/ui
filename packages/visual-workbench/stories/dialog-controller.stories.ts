import type { Meta, StoryObj } from "@storybook/vue3"
import { computed } from "vue"
import { useDialogController } from "@affino/dialog-vue"

const meta = {
  title: "Vue Adapters/Overlays/Dialog Controller",
  tags: ["autodocs"],
  args: {
    defaultOpen: false,
  },
  argTypes: {
    defaultOpen: {
      control: "boolean",
      description: "Start dialog in open state",
    },
  },
  render: (args: { defaultOpen: boolean }) => ({
    setup() {
      const { snapshot, open, close } = useDialogController({
        defaultOpen: args.defaultOpen,
      })
      const isOpen = computed(() => snapshot.value.isOpen)
      const isPending = computed(() => snapshot.value.isGuardPending)
      const phase = computed(() => snapshot.value.phase)
      return {
        isOpen,
        isPending,
        phase,
        open,
        close,
      }
    },
    template: `
      <div style="display: grid; gap: 12px; min-width: 460px;">
        <div style="display: flex; gap: 8px;">
          <button type="button" @click="open('programmatic')">Open</button>
          <button type="button" @click="close('programmatic')" :disabled="!isOpen">Close</button>
        </div>
        <p style="margin: 0; font-size: 13px;">
          phase: <strong>{{ phase }}</strong> · open: <strong>{{ isOpen ? 'yes' : 'no' }}</strong> · guard pending: <strong>{{ isPending ? 'yes' : 'no' }}</strong>
        </p>
        <div
          v-if="isOpen"
          style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 14px; background: #fff;"
        >
          Dialog body (controller-driven)
        </div>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
