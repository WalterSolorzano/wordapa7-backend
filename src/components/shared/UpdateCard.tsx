/* WordAPA7 — Tarjeta de actualizaciones (menú de update).
   Reutilizable: vive en Archivo → Actualización y en el Estudio de ajustes.
   Muestra versión instalada, estado de la búsqueda/descarga y las acciones. */

import React, { useEffect } from 'react';
import { useUpdateStore, UpdateState } from '../../store/useUpdateStore';
import { RefreshCw, Download, CheckCircle2, AlertTriangle, Loader2, MonitorUp, ExternalLink } from 'lucide-react';

const GITHUB_RELEASES_URL = 'https://github.com/WalterSolorzano/ProyectoAPA7/releases/latest';

const STATUS_TEXT: Record<UpdateState, string> = {
  idle: 'Sin verificar',
  checking: 'Buscando actualizaciones…',
  available: 'Hay una versión nueva disponible',
  downloading: 'Descargando la actualización…',
  downloaded: 'Actualización lista para instalar',
  'not-available': 'Tenés la versión más reciente',
  error: 'No se pudo verificar actualizaciones',
};

export const UpdateCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { state, version, availableVersion, progress, message, init, check, install } = useUpdateStore();

  useEffect(() => { init(); }, [init]);

  const isElectron = !!(window as any).electronAPI;
  const busy = state === 'checking' || state === 'downloading';

  const iconFor = () => {
    if (state === 'downloaded') return <CheckCircle2 size={compact ? 13 : 16} color="var(--color-success)" />;
    if (state === 'downloading') return <Loader2 size={compact ? 13 : 16} style={{ animation: 'spin 1s linear infinite' }} />;
    if (state === 'not-available') return <CheckCircle2 size={compact ? 13 : 16} color="var(--color-success)" />;
    if (state === 'error') return <AlertTriangle size={compact ? 13 : 16} color="var(--color-danger)" />;
    return <MonitorUp size={compact ? 13 : 16} color="var(--accent-primary)" />;
  };

  if (!isElectron) {
    return (
      <div style={{
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--surface-elevated)', padding: compact ? '10px 12px' : '14px',
        display: 'flex', alignItems: 'center', gap: '10px',
      }}>
        <MonitorUp size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: compact ? '11px' : '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '12px' }}>Actualizaciones</strong>
          Solo disponible en la app de escritorio de WordAPA7.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--surface-elevated)', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: compact ? '9px 12px' : '10px 14px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        {iconFor()}
        <span style={{ fontSize: compact ? '12px' : '13px', fontWeight: 800, color: 'var(--text-main)' }}>Actualización</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>
          v{version}
        </span>
      </div>

      <div style={{ padding: compact ? '10px 12px' : '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: compact ? '11px' : '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {STATUS_TEXT[state]}
          {state === 'available' && availableVersion && (
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}> → v{availableVersion}</span>
          )}
          {state === 'downloaded' && availableVersion && (
            <span style={{ color: 'var(--color-success)', fontWeight: 700 }}> → v{availableVersion}</span>
          )}
          {state === 'error' && message && (
            <span style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)', fontSize: '10px' }}>{message.slice(0, 120)}</span>
          )}
        </div>

        {state === 'downloading' && (
          <div style={{ height: '4px', backgroundColor: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{
              width: `${progress ?? 0}%`, height: '100%', backgroundColor: 'var(--accent-primary)',
              borderRadius: '2px', transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: compact ? '11px' : '12px' }}
          >
            {state === 'checking'
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            Buscar actualizaciones
          </button>
          {state === 'downloaded' && (
            <button
              type="button"
              onClick={install}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: compact ? '11px' : '12px' }}
            >
              <Download size={12} /> Reiniciar y actualizar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const api = (window as any).electronAPI;
              if (api?.openExternal) api.openExternal(GITHUB_RELEASES_URL);
              else window.open(GITHUB_RELEASES_URL, '_blank');
            }}
            className="btn btn-ghost btn-sm"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: compact ? '11px' : '12px',
              color: state === 'error' ? 'var(--color-danger)' : 'var(--accent-primary)',
              border: state === 'error' ? '1px solid rgba(220,38,38,0.35)' : 'none',
            }}
            title="Abrir la página de releases de GitHub"
          >
            <ExternalLink size={12} />
            {state === 'error' ? 'Descargar manualmente desde GitHub' : 'Ver versiones en GitHub'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateCard;
