import type { Meta, StoryObj } from "@storybook/vue3"
import { useDisclosureController } from "@affino/disclosure-vue"

const meta = {
  title: "Vue Adapters/Primitives/Disclosure Controller",
  tags: ["autodocs"],
  args: {
    defaultOpen: true,
  },
  argTypes: {
    defaultOpen: {
      control: "boolean",
    },
  },
  render: (args: { defaultOpen: boolean }) => ({
    setup() {
      const disclosure = useDisclosureController(args.defaultOpen)
      return {
        disclosure,
      }
    },
    template: `
      <div style="display: grid; gap: 12px; min-width: 480px;">
        <button type="button" @click="disclosure.toggle()">
          {{ disclosure.state.value.open ? 'Hide details' : 'Show details' }}
        </button>
        <div
          v-if="disclosure.state.value.open"
          style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 12px; background: #fff;"
        >
          Disclosure content rendered when open.
        </div>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
