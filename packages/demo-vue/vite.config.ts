import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { createWorkspaceAliases } from '../../config/workspace-aliases'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: createWorkspaceAliases(import.meta.url),
  },
})
