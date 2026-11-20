import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// موقع زوردة التعريفي — يُبنى إلى dist/site (معاينة على …/--amaln808/site/)
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: {
    outDir: '../dist/site',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        ar: resolve(import.meta.dirname, 'index.html'),
        en: resolve(import.meta.dirname, 'en/index.html'),
      },
    },
  },
  server: { port: 5175 },
})
