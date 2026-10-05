import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths so the build works from any sub-path,
  // e.g. GitHub Pages project sites (https://<user>.github.io/<repo>/).
  base: './',
})
