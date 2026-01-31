import { createWorkspaceAliases } from "../../config/workspace-aliases"

const config = {
  viteConfig: {
    resolve: {
      alias: createWorkspaceAliases(import.meta.url),
    },
  },
}

export default config
