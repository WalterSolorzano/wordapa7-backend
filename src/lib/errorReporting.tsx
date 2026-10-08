/* WordAPA7 — Captura global de errores → backend /api/client-log.
   Nada muere en silencio: todo queda en logs/renderer.log. */

import React from 'react';
import { getApiBase } from '../api/backend';

export function installGlobalErrorLogging(): void {
  const send = (level: string, event: string, data: Record<string, unknown>) => {
    try {
      fetch(`${getApiBase()}/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ component: 'renderer', event, data, level }),
        keepalive: true,
      }).catch(() => { /* último recurso: consola */ });
    } catch { /* noop */ }
  };

  window.addEventListener('error', (e) => {
    send('error', 'window_error', {
      message: e.message,
      source: `${e.filename}:${e.lineno}:${e.colno}`,
      stack: (e.error && e.error.stack) || null,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    send('error', 'unhandled_rejection', {
      reason: String((e as PromiseRejectionEvent).reason),
      stack: (e as PromiseRejectionEvent).reason?.stack || null,
    });
  });

  // Breadcrumbs de ciclo de vida
  send('info', 'renderer_boot', { href: location.href, ts: Date.now() });
}

interface Props { children: React.ReactNode }
interface State { hasError: boolean; message: string }

export class GlobalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    try {
      fetch(`${getApiBase()}/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          component: 'renderer',
          event: 'react_crash',
          level: 'error',
          data: { message: String(err), stack: (err as Error)?.stack, tree: info.componentStack },
        }),
      }).catch(() => {});
    } catch { /* noop */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: 'var(--app-bg, #f6f7fb)', color: 'var(--text-main, #1a1a2e)',
          fontFamily: 'inherit', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 40 }}>:(</div>
          <strong style={{ fontSize: 16 }}>Algo se rompió en la interfaz</strong>
          <span style={{ fontSize: 12, maxWidth: 460, opacity: 0.7 }}>
            El error ya quedó registrado en los logs del sistema
            (Configuraciones → Complemento Word → Copiar diagnóstico).
          </span>
          <button
            type="button"
            onClick={() => { this.setState({ hasError: false, message: '' }); }}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
