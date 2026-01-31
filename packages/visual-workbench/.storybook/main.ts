import type { StorybookConfig } from "@storybook/vue3-webpack5"
import { createWorkspaceAliases } from "../../../config/workspace-aliases"

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(ts|tsx|mdx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions"],
  framework: {
    name: "@storybook/vue3-webpack5",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve = webpackConfig.resolve ?? {}
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias ?? {}),
      ...createWorkspaceAliases(import.meta.url),
    }
    return webpackConfig
  },
}

export default config
