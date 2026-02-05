import type { Meta, StoryObj } from "@storybook/vue3"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuSeparator,
  UiMenuLabel,
} from "@affino/menu-vue"

const meta = {
  title: "Vue Adapters/Overlays/Dialog Menu",
  tags: ["autodocs"],
  render: () => ({
    components: { UiMenu, UiMenuTrigger, UiMenuContent, UiMenuItem, UiMenuSeparator, UiMenuLabel },
    template: `
      <div class="story-wrapper">
        <UiMenu>
          <UiMenuTrigger as-child>
            <button type="button" class="surface-chip">Inline actions</button>
          </UiMenuTrigger>
          <UiMenuContent class="surface-menu">
            <UiMenuLabel>Dialog actions</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem>Close dialog</UiMenuItem>
            <UiMenuItem>Duplicate scenario</UiMenuItem>
            <UiMenuSeparator />
            <UiMenuItem>Export data</UiMenuItem>
          </UiMenuContent>
        </UiMenu>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const InlineActions: Story = {}
