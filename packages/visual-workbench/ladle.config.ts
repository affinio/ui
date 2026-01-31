import type { Config } from "@ladle/vue"
import { createWorkspaceAliases } from "../../config/workspace-aliases"

const config: Config = {
  viteConfig: {
    resolve: {
      alias: createWorkspaceAliases(import.meta.url),
    },
  },
}

export default config
