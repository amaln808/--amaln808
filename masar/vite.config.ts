import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// مسار — published next to Zuwardah at …/--amaln808/masar/
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  build: { outDir: '../dist/masar', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { port: 5175 },
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
        cacheId: 'masar',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
