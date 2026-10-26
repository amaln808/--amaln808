import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative asset URLs so the build runs from any folder (GitHub Pages sub-path, Netlify root…)
  base: './',
  // Shown in Settings so the owner can confirm the iPad runs the latest version
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    // Offline support: precache the whole app shell so it opens without internet.
    // The web manifest lives in public/ and is kept as is.
    VitePWA({
      registerType: 'autoUpdate',
      // Registered in src/app/pwaUpdate.ts, which also checks for updates when the app is reopened
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The receipt reader (~8 MB) loads on first use only, not with the app
        globIgnores: ['tesseract/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
  },
})
