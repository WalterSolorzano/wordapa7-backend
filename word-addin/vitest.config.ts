import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// ── WordAPA7 Add-in — Configuración de Vitest ──────────────────────────
// Entorno jsdom para que las pruebas puedan usar APIs del navegador
// (DOM, matchAll, etc.). El alias '@' apunta a 'src', igual que en
// vite.config.ts, para que las importaciones sean consistentes.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
