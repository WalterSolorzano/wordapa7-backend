import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'
import path from 'path'

// ── WordAPA7 Add-in — Vite config ───────────────────────────────────
//
// Por DEFECTO el dev server corre en HTTP plano (http://localhost:3000).
// Esto es suficiente para desarrollo del Add-in cuando el backend lo sirve
// en /addin/ (no se necesita un dev server HTTPS separado).
//
// Para desarrollo HTTPS avanzado (cuando Word necesita cargar el panel
// directamente desde :3000 en HTTPS), setear WORDAPA7_USE_SSL=true en .env.
// Esto activa vite-plugin-mkcert que genera certificados de desarrollo.
//
//  base: './' — CRÍTICO: los assets deben usar paths RELATIVOS porque
// el backend sirve el add-in bajo /addin/ (no en la raíz /).  Sin esto,
// Vite genera <script src="/taskpane.js"> que se resuelve a la raíz del
// servidor y el panel queda en blanco dentro de Word.

// Determinar si se debe usar HTTPS (desarrollo avanzado).
const useHttps = process.env.WORDAPA7_USE_SSL === 'true'

import rootPkg from '../package.json'
const __APP_VERSION__ = rootPkg.version

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(__APP_VERSION__) },
  plugins: [
    react(),
    // mkcert solo se activa en modo desarrollo HTTPS avanzado.
    ...(useHttps ? [mkcert()] : []),
  ],
  server: {
    port: 3000,
    https: useHttps,
    strictPort: true,
    headers: {
      // Permite que Office cargue el panel en un iframe
      'X-Frame-Options': 'ALLOWALL',
      'Content-Security-Policy':
        // En HTTP: se permite self + el backend local en HTTP.
        // En HTTPS: se añade https://localhost:3000 para el dev server.
        useHttps
          ? "default-src 'self' https://localhost:3000 https://127.0.0.1:8742 http://127.0.0.1:8742 http://localhost:8742 https://localhost:8742; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://localhost:3000 https://appsforoffice.microsoft.com;"
          : "default-src 'self' http://localhost:3000 http://127.0.0.1:8742 http://localhost:8742; connect-src 'self' http://127.0.0.1:8742 http://localhost:8742 http://localhost:3000; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000 https://appsforoffice.microsoft.com;",
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        taskpane: path.resolve(__dirname, 'taskpane.html'),
        commands: path.resolve(__dirname, 'commands.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
