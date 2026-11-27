import { createWorkspaceVitestConfig } from "../../config/vitest.base"
import vue from "@vitejs/plugin-vue"

const config = createWorkspaceVitestConfig(import.meta.url)
export default { ...config, plugins: [vue()] }
