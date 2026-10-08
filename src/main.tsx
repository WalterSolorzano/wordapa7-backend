/* WordAPA7 — Entry Point with Auto-Versioning and SW Cleanup */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GlobalErrorBoundary, installGlobalErrorLogging } from './lib/errorReporting';

// Consola de errores: TODO crash queda en logs del sistema (L0).
installGlobalErrorLogging();

import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/baloo-2/800.css';
/* Newsreader: la serif editorial que usa la cita del acordeón de menciones
   (`ManuscriptMentionsAccordion`). Sin este import la familia cae a Georgia y
   la cita se ve distinta según el sistema operativo. */
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500.css';
/* Outfit: títulos de interfaz (esquema y chips de Estructura). JetBrains Mono:
   los conteos numéricos. Sin estos imports ambas familias caían al sistema. */
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/fluent.css';        // base styles + Tailwind directives
import './styles/design-system.css'; // dark theme tokens override on top
import './styles/estructura.css';    // Estudio de Estructura (Paso 2): diagrama por nivel

// ── TEMA PERSISTIDO ─────────────────────────────────────────────────────────
// Restaura el tema (claro/oscuro) guardado antes de pintar para evitar un flash.
// Por defecto la app arranca en CLARO; el toggle en la toolbar cambia a oscuro.
try {
  const saved = localStorage.getItem('wordapa7-theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const ew = window as any;
  if (ew.electronAPI?.setTheme) {
    try { ew.electronAPI.setTheme(theme); } catch { /* noop */ }
  }
} catch {
  document.documentElement.setAttribute('data-theme', 'light');
}

// ── SERVICE WORKER CLEANUP ──────────────────────────────────────────────────

// Elimina cualquier Service Worker registrado por versiones anteriores
// para evitar que se sirva caché stale. WordAPA7 no usa SW activamente,
// así que esta limpieza es preventiva.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
      console.log('[WordAPA7] Service Worker removido:', reg.scope);
    }
  });
}

// ── VERSION POLLING ─────────────────────────────────────────────────────────

// Consulta periódica a /api/version para detectar nuevos builds
// y recargar automáticamente si el servidor tiene una versión más reciente.
const VERSION_CHECK_INTERVAL_MS = 60_000; // 60 segundos
const INITIAL_CHECK_DELAY_MS = 5_000;     // primera comprobación tras 5s

let currentBuildHash: string | null = null;

async function checkVersion(): Promise<void> {
  try {
    const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
    const port = (window as any).electronAPI ? (window as any).electronAPI.getBackendPort() : 8742;
    const baseUrl = envBase ? `${envBase.replace(/\/+$/, '')}/api` : ((window as any).electronAPI ? `http://127.0.0.1:${port}/api` : '/api');
    const res = await fetch(`${baseUrl}/version`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;

    const data = await res.json();
    const serverHash: string = data.build_hash;

    if (!serverHash || serverHash === 'unknown') return;

    if (!currentBuildHash) {
      // Primera comprobación: registrar hash actual
      currentBuildHash = serverHash;
      console.log('[WordAPA7] Build hash:', serverHash);
      return;
    }

    if (serverHash !== currentBuildHash) {
      // ¡Nueva versión detectada! Notificar y recargar
      console.log('[WordAPA7] Nueva versión detectada:', serverHash, '(antes:', currentBuildHash, ')');
      showReloadToast();
    }
  } catch {
    // Silencio en error de red (offline, backend no disponible)
  }
}

function showReloadToast(): void {
  // Crear toast de notificación sin depender de React
  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'background:var(--color-bg-surface-hover, #23232b)',
    'color:var(--color-text-primary, #f2f2f5)',
    'border:1px solid var(--color-border-strong, rgba(255,255,255,0.16))',
    'padding:12px 20px',
    'border-radius:8px',
    'font-family:var(--font-sans, Inter, system-ui, sans-serif)',
    'font-size:14px',
    'font-weight:600',
    'z-index:99999',
    'box-shadow:var(--shadow-lg, 0 8px 16px rgba(0,0,0,0.6))',
    'animation:wordapa7-slide-up 0.3s ease-out',
    'display:flex',
    'align-items:center',
    'gap:10px',
    'cursor:pointer',
    'user-select:none',
  ].join(';');

  toast.textContent = 'Nueva versión disponible — Click para recargar';

  const style = document.createElement('style');
  style.textContent = `
    @keyframes wordapa7-slide-up {
      from { transform: translateY(100px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  toast.addEventListener('click', () => {
    window.location.reload();
  });

  document.body.appendChild(toast);

  // Auto-recargar en 5 segundos si no se hace click
  setTimeout(() => {
    if (document.body.contains(toast)) {
      window.location.reload();
    }
  }, 5000);
}

// Iniciar el polling de versión con retraso inicial
setTimeout(() => {
  checkVersion();
  setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS);
}, INITIAL_CHECK_DELAY_MS);

// ── RENDER ──────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
);
