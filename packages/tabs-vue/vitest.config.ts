import { createWorkspaceVitestConfig } from "../../config/vitest.base"
import { fileURLToPath } from "node:url"

export default createWorkspaceVitestConfig(import.meta.url, {
  resolve: {
    alias: {
      "@affino/tabs-core": fileURLToPath(new URL("../tabs-core/dist/index.js", import.meta.url)),
      "@affino/tabs-vue": fileURLToPath(new URL("./dist/index.js", import.meta.url)),
    },
  },
  test: {
    coverage: {
      include: ["src/**/*.ts", "resources/js/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
})
