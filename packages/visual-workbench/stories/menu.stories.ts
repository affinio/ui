import type { Meta, StoryObj } from "@storybook/vue3"
import {
  UiMenu,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
  UiMenuTrigger,
  UiSubMenu,
  UiSubMenuContent,
  UiSubMenuTrigger,
} from "@affino/menu-vue"

const meta = {
  title: "Vue Adapters/Overlays/Menu",
  tags: ["autodocs"],
  args: {
    includeSubmenu: true,
  },
  argTypes: {
    includeSubmenu: {
      control: "boolean",
      description: "Show nested submenu branch",
    },
  },
  render: (args: { includeSubmenu: boolean }) => ({
    components: {
      UiMenu,
      UiMenuTrigger,
      UiMenuContent,
      UiMenuItem,
      UiMenuLabel,
      UiMenuSeparator,
      UiSubMenu,
      UiSubMenuTrigger,
      UiSubMenuContent,
    },
    setup() {
      return { args }
    },
    template: `
      <div style="min-width: 460px; min-height: 220px; padding: 24px;">
        <UiMenu>
          <UiMenuTrigger as-child>
            <button type="button">Open menu</button>
          </UiMenuTrigger>
          <UiMenuContent>
            <UiMenuLabel>Actions</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem>Rename</UiMenuItem>
            <UiMenuItem>Duplicate</UiMenuItem>
            <UiSubMenu v-if="args.includeSubmenu">
              <UiSubMenuTrigger>Share</UiSubMenuTrigger>
              <UiSubMenuContent>
                <UiMenuItem>Copy link</UiMenuItem>
                <UiMenuItem>Invite users</UiMenuItem>
              </UiSubMenuContent>
            </UiSubMenu>
            <UiMenuSeparator />
            <UiMenuItem>Delete</UiMenuItem>
          </UiMenuContent>
        </UiMenu>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
