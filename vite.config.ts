import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs so the build runs from any folder (GitHub Pages sub-path, Netlify root…)
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
