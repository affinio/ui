import type { Meta, StoryObj } from "@storybook/vue3"
import { useTabsController } from "@affino/tabs-vue"

const meta = {
  title: "Vue Adapters/Primitives/Tabs Controller",
  tags: ["autodocs"],
  args: {
    defaultValue: "overview",
  },
  argTypes: {
    defaultValue: {
      control: "select",
      options: ["overview", "activity", "settings", null],
    },
  },
  render: (args: { defaultValue: "overview" | "activity" | "settings" | null }) => ({
    setup() {
      const tabs = useTabsController(args.defaultValue)
      const items = [
        { key: "overview", label: "Overview" },
        { key: "activity", label: "Activity" },
        { key: "settings", label: "Settings" },
      ]
      return {
        tabs,
        items,
      }
    },
    template: `
      <div style="display: grid; gap: 12px; min-width: 560px;">
        <div style="display: flex; gap: 8px;">
          <button
            v-for="item in items"
            :key="item.key"
            type="button"
            @click="tabs.select(item.key)"
            :style="{ fontWeight: tabs.isSelected(item.key) ? '700' : '400' }"
          >
            {{ item.label }}
          </button>
          <button type="button" @click="tabs.clear()">Clear</button>
        </div>
        <div style="border: 1px solid #d4d7dd; border-radius: 10px; padding: 12px;">
          Active tab: <strong>{{ tabs.state.value.value ?? 'none' }}</strong>
        </div>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
