import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// El panel vive en admin/ y se sirve en /admin/ desde el propio servidor de la API.
export default defineConfig({
  root: 'admin',
  base: '/admin/',
  plugins: [vue()],
  build: { outDir: '../dist', emptyOutDir: true },
})
