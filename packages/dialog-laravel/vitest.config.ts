import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  test: {
    coverage: {
      include: ["resources/js/**/*.ts"],
    },
  },
})
