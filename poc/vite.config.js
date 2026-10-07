import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    plugins: [vue()],
    // La demo publicable usa una API simulada en el navegador y sale en un único fichero JS.
    base: demo ? './' : '/',
    resolve: demo
      ? { alias: [{ find: /^(\.\.?\/)+api\.js$/, replacement: fileURLToPath(new URL('./src/demo/demoApi.js', import.meta.url)) }] }
      : {},
    build: demo
      ? { outDir: 'dist-demo', emptyOutDir: true, cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
      : { outDir: 'dist', emptyOutDir: true },
  }
})
