import React from 'react';
import { Wand2, Check, RefreshCw, Loader2 } from 'lucide-react';
import { DocumentMascot } from '../layout/DocumentMascot';

export interface LeyendaSugerida {
  titulo: string;
  nota?: string;
  confianza?: number;
}

export interface MascotaLeyendaIAProps {
  sugerida?: LeyendaSugerida;
  cargando?: boolean;
  error?: string;
  onGenerar: () => void;
  onAplicar?: (s: { titulo: string; nota?: string }) => void;
  onRegenerar?: () => void;
}

/**
 * Leyenda sugerida por IA bajo una tabla o figura. La mascota propone; el
 * usuario decide. NUNCA dispara la generación por sí sola: el botón es la
 * única puerta (spec D-8, cero gasto automático de tokens).
 */
export const MascotaLeyendaIA: React.FC<MascotaLeyendaIAProps> = ({
  sugerida,
  cargando = false,
  error,
  onGenerar,
  onAplicar,
  onRegenerar,
}) => {
  const botonGenerar = (
    <button
      type="button"
      onClick={onGenerar}
      disabled={cargando}
      aria-label="Generar leyenda con IA"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '5px 10px',
        background: 'var(--surface-subtle)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xs)',
        cursor: cargando ? 'default' : 'pointer',
        fontSize: '11px',
        opacity: cargando ? 0.7 : 1,
      }}
    >
      {cargando ? <Loader2 size={13} className="spin" /> : <Wand2 size={13} />}
      <span>{cargando ? 'Generando' : 'Generar leyenda con IA'}</span>
    </button>
  );

  return (
    <div
      data-testid="mascota-leyenda-ia"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)' }}
    >
      <DocumentMascot size={56} kind="reference" expression="curious" />

      {sugerida ? (
        <div
          style={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-4)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              ¿Uso esta leyenda?
            </span>
            {typeof sugerida.confianza === 'number' && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(sugerida.confianza * 100)}%
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gap: 'var(--space-1)',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--space-3)',
            }}
          >
            <p style={{ margin: 0 }}>
              <span className="fig-kicker">Título</span>{' '}
              <span className="italic">{sugerida.titulo}</span>
            </p>
            {sugerida.nota && (
              <p style={{ margin: 0 }}>
                <span className="fig-kicker">Nota</span> {sugerida.nota}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {onAplicar && (
              <button
                type="button"
                onClick={() => onAplicar({ titulo: sugerida.titulo, nota: sugerida.nota })}
                className="fig-apply-btn"
                aria-label="Aplicar sugerencia"
              >
                <Check size={13} />
                <span>Aplicar sugerencia</span>
              </button>
            )}
            {onRegenerar && (
              <button
                type="button"
                onClick={onRegenerar}
                className="fig-regenerate-btn"
                aria-label="Regenerar sugerencia"
              >
                <RefreshCw size={13} />
                <span>Regenerar</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {botonGenerar}
          {error && (
            <span style={{ fontSize: '11px', color: 'var(--color-danger)' }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MascotaLeyendaIA;
