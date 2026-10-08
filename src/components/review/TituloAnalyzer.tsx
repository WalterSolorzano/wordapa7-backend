/* WordAPA7 — Analizador del Título (REV-L2).
 * Analizador dedicado para el Título del Documento según normativa APA 7 y
 * directrices académicas. Permite inspeccionar reglas y aplicar sugerencias.
 */
import React, { useMemo } from 'react';
import { ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import type { ElementModel } from '../../types';
import { analizarTitulo, extraerTituloPrincipal } from '../../lib/tituloAnalisis';

export interface TituloAnalyzerProps {
  elements: readonly ElementModel[];
  onApply: (elementId: string, texto: string) => void;
  onBack: () => void;
}

const primario: React.CSSProperties = {
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  padding: '6px 14px',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const fantasma: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '5px 12px',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

export const TituloAnalyzer: React.FC<TituloAnalyzerProps> = ({ elements, onApply, onBack }) => {
  const extraido = useMemo(() => extraerTituloPrincipal(elements), [elements]);
  const analisis = useMemo(() => analizarTitulo(extraido.texto, extraido.elementoId), [extraido]);

  const colorPuntaje =
    analisis.puntaje >= 85
      ? 'var(--color-success)'
      : analisis.puntaje >= 60
        ? 'var(--color-warning)'
        : 'var(--color-danger)';

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div
        style={{
          maxWidth: '960px',
          margin: 'var(--space-5) auto',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
              Analizador del Título de Investigación
            </h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Normativa APA 7ª Edición · Concisión, formato de mayúsculas y rigor académico
            </div>
          </div>
          <button type="button" onClick={onBack} style={fantasma}>
            <ArrowLeft size={14} aria-hidden /> Volver a Sala de Revisión
          </button>
        </div>

        {/* Resumen & Score */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '180px minmax(0, 1fr)',
            gap: 'var(--space-5)',
            padding: 'var(--space-5)',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          <div style={{ textAlign: 'center', borderRight: '1px solid var(--color-border-subtle)', paddingRight: 'var(--space-4)' }}>
            <div
              style={{
                fontSize: '44px',
                fontWeight: 800,
                lineHeight: 1,
                color: colorPuntaje,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {analisis.puntaje}
              <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-tertiary)' }}>%</span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Calidad APA 7
            </div>
            <div
              style={{
                marginTop: '10px',
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                background: 'var(--color-bg-surface-alt)',
                color: 'var(--color-text-primary)',
              }}
            >
              {analisis.palabrasCount} palabras
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700 }}>
              Título actual del documento
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                lineHeight: 1.4,
                fontFamily: 'serif',
                padding: '10px 14px',
                background: 'var(--color-bg-surface-alt)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {analisis.titulo ? `“${analisis.titulo}”` : '(No se detectó título en el documento)'}
            </div>
            <div style={{ marginTop: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {analisis.veredicto}
            </div>
          </div>
        </div>

        {/* Sugerencia de optimización si existe */}
        {analisis.sugerencia && (
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              background: 'var(--color-accent-soft)',
              borderBottom: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-4)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent)' }}>
                <Sparkles size={14} /> Sugerencia de optimización APA 7
              </div>
              <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'serif' }}>
                “{analisis.sugerencia}”
              </div>
            </div>
            {analisis.elementoId && (
              <button
                type="button"
                onClick={() => onApply(analisis.elementoId!, analisis.sugerencia!)}
                style={primario}
              >
                Aplicar sugerencia
              </button>
            )}
          </div>
        )}

        {/* Criterios y checklist */}
        <div style={{ padding: 'var(--space-5)' }}>
          <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700, marginBottom: 'var(--space-3)' }}>
            Evaluación de Criterios APA 7
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {analisis.criterios.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 220px minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: '10px 12px',
                  background: 'var(--color-bg-surface-alt)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                <div>
                  {c.cumple ? (
                    <CheckCircle2 size={18} style={{ color: 'var(--color-success)' }} />
                  ) : c.severidad === 'critical' ? (
                    <XCircle size={18} style={{ color: 'var(--color-danger)' }} />
                  ) : (
                    <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {c.detalle}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
