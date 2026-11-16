import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// الهمة — published next to Zuwardah at …/--amaln808/himma/
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: { outDir: '../dist/himma', emptyOutDir: true },
  server: { port: 5174 },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        cacheId: 'himma',
      },
    }),
  ],
})
