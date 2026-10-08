/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    nodePolyfills(),
    ...(process.env.WEB_ONLY === 'true'
      ? []
      : [
          electron([
            {
              // Main process entry file of the Electron App.
              entry: 'electron/main.ts',
              vite: {
                build: {
                  outDir: 'dist-electron',
                },
              },
            },
            {
              entry: 'electron/preload.ts',
              onstart(options) {
                options.reload();
              },
              vite: {
                build: {
                  outDir: 'dist-electron',
                },
              },
            },
          ]),
        ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // No watchear salidas de build: si un build de electron-builder corre en
    // paralelo, un .dll bloqueado dispara EBUSY y mata el dev server.
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/dist-electron-builder/**',
        '**/word-addin/dist/**',
        '**/graphify-out/**',
      ],
    },
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:8742',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    css: false,
    // word-addin es un sub-proyecto con su propio package.json, vitest.config.ts
    // y su propia copia de React. Ejecutar sus tests desde la raiz rompe por:
    //   1) nodePolyfills() shimmea `fs` (→ null) en el test de tipografias CSS, y
    //   2) dos copias de React (root vs word-addin) → "Invalid hook call".
    // Sus tests corren con `cd word-addin && npm test` (41 tests, 6 archivos).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/dist-electron-builder/**',
      'word-addin/**',
      // Worktrees del harness dentro del repo. Cada worktree trae una copia
      // completa de los tests, y correrlos dos veces no agrega nada: hace que un
      // fallo aparezca en un archivo que no vas a editar.
      '**/.kilo/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
  },
}) satisfies import('vite').UserConfig & { test: import('vitest/config').UserConfig['test'] };
