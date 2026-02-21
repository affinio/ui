import type { StorybookConfig } from "@storybook/vue3-vite"
import vue from "@vitejs/plugin-vue"
import { createWorkspaceAliases } from "../../../config/workspace-aliases"

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/vue3-vite",
    options: {},
  },
  viteFinal: async (viteConfig) => {
    viteConfig.resolve = viteConfig.resolve ?? {}
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias ?? {}),
      ...createWorkspaceAliases(import.meta.url),
    }
    viteConfig.plugins = [...(viteConfig.plugins ?? []), vue()]
    return viteConfig
  },
}

export default config
