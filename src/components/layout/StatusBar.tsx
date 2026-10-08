/* WordAPA7 — Status Bar: sugerencias protagonistas + controles etiquetados */

import React from 'react';
import { useDocStore } from '../../store/useDocStore';
import { NIMDiagnosticsModal } from '../shared/NIMDiagnosticsModal';
import { RotatingComment } from './RotatingComment';
import { AlertTriangle, CheckCircle, ZoomIn, ZoomOut, Cpu } from 'lucide-react';
import { computePages } from './PaperCanvas';
import { ElementModel } from '../../types';

const EMPTY_ELEMENTS: ElementModel[] = [];

const LABEL: React.CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)',
};

const GHOST_BTN: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'inherit',
  color: 'var(--text-secondary)',
};

export const StatusBar: React.FC = () => {
  const {
    doc,
    zoomLevel,
    setZoomLevel,
    apiKey,
    nimLogs,
    isNIMDiagnosticsOpen,
    setIsNIMDiagnosticsOpen,
    wordLayoutUnavailable,
  } = useDocStore();

  // Hooks incondicionales (antes del early return): fallback = mismo computePages del lienzo.
  const elements = doc?.elements ?? EMPTY_ELEMENTS;
  const fallbackPages = React.useMemo(
    () => Math.max(1, computePages(elements).length),
    [elements],
  );

  if (!doc) return null;

  const totalWords = elements.reduce((acc, elem) => {
    if (elem.text) return acc + elem.text.trim().split(/\s+/).filter(Boolean).length;
    return acc;
  }, 0);

  const needsReviewCount = elements.filter((e) => e.needs_review).length;

  const warnings: string[] = [];
  if (wordLayoutUnavailable) {
    warnings.push('Se requiere Microsoft Word: paginación real no disponible');
  }
  if (needsReviewCount > 0) warnings.push(`${needsReviewCount} pendientes de revisión`);
  if (doc.has_landscape_sections) warnings.push('Sección horizontal detectada');
  if ((doc.meta as any)?.content_warning) warnings.push((doc.meta as any).content_warning);
  const hasCitations = doc.citas_intext && doc.citas_intext.length > 0;
  if (hasCitations && doc.referencias && doc.referencias.length === 0) {
    warnings.push('Citas detectadas sin referencias');
  }

  return (
    <>
      <footer
        className="app-statusbar app-no-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          backgroundColor: 'var(--sidebar-bg)',
          borderTop: '1px solid var(--border-subtle)',
          color: 'var(--text-muted)',
          padding: '4px 12px',
        }}
      >
        <div style={LABEL as React.CSSProperties}>
          Pág. {doc.meta?.page_count || fallbackPages}
        </div>
        <div style={LABEL}>{totalWords} pal.</div>

        {/* Avisos */}
        {warnings.length > 0 ? (
          <span
            style={{ ...GHOST_BTN, borderColor: 'var(--border-strong)' }}
            title={'Avisos del documento:\n' + warnings.join('\n')}
          >
            <AlertTriangle size={12} color="var(--color-warning)" />
            <span>{warnings.length} aviso{warnings.length > 1 ? 's' : ''}</span>
          </span>
        ) : (
          needsReviewCount === 0 && (
            <span style={{ ...GHOST_BTN, cursor: 'default', color: 'var(--color-success)' }}
              title="Sin problemas detectados">
              <CheckCircle size={12} /> En regla
            </span>
          )
        )}

        {/* Centro: comentario rotativo — NO TOCAR */}
        <div
          style={{
            flex: 1, display: 'flex', justifyContent: 'center',
            alignItems: 'center', minWidth: 0, overflow: 'hidden', padding: '0 12px',
          }}
        >
          <RotatingComment />
        </div>

        {/* Derecha: zoom + diagnóstico */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
          <button type="button" onClick={() => setZoomLevel(zoomLevel - 10)} title="Reducir zoom" style={{ ...GHOST_BTN, border: 'none', padding: '3px 5px' }}>
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel(100)}
            title="Restablecer zoom a 100%"
            style={{ ...LABEL, width: '38px', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            {zoomLevel}%
          </button>
          <button type="button" onClick={() => setZoomLevel(zoomLevel + 10)} title="Aumentar zoom" style={{ ...GHOST_BTN, border: 'none', padding: '3px 5px' }}>
            <ZoomIn size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsNIMDiagnosticsOpen(true)}
          style={{ ...GHOST_BTN, border: 'none', padding: '3px 5px' }}
          title={apiKey ? 'Motor IA activo — ver diagnóstico' : 'Modo reglas locales — ver diagnóstico'}
        >
          <Cpu size={13} color={apiKey ? 'var(--accent-secondary)' : 'var(--color-warning)'} />
        </button>
      </footer>

      <NIMDiagnosticsModal
        isOpen={isNIMDiagnosticsOpen}
        onClose={() => setIsNIMDiagnosticsOpen(false)}
        logs={nimLogs || []}
        apiKeyPresent={!!apiKey}
      />
    </>
  );
};
