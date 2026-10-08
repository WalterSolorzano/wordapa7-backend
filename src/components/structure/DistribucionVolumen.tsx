/* WordAPA7 — Distribución de Volumen (Pacing).
 *
 * Módulo 1 de Estructura: visualiza el peso porcentual de cada H1 con respecto
 * al documento total, barras proporcionales y alerta de concentración >50%.
 */

import React from 'react';
import { Activity, TriangleAlert } from 'lucide-react';
import type { NodoJerarquia } from '../../lib/jerarquia';
import { miles } from './BarraBalance';

export interface DistribucionVolumenProps {
  raices: readonly NodoJerarquia[];
  nodoSeleccionadoId?: string | null;
  onSelect?: (nodoId: string) => void;
}

export const DistribucionVolumen: React.FC<DistribucionVolumenProps> = ({
  raices,
  nodoSeleccionadoId,
  onSelect,
}) => {
  const totalPalabras = raices.reduce((sum, r) => sum + r.palabras, 0);

  // Alerta si un capítulo concentra > 50% del total
  const hipertrofico = raices.find(
    (r) => totalPalabras > 0 && r.palabras / totalPalabras > 0.5,
  );

  return (
    <section
      aria-label="Distribución de Volumen (Pacing)"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        paddingTop: 'var(--space-3)',
        borderTop: '1px solid var(--color-border-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Activity size={15} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            Distribución de volumen (Pacing)
          </h3>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {miles(totalPalabras)} pal. tot.
        </span>
      </div>

      {hipertrofico && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--severity-warning-soft)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-warning)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)',
            lineHeight: 1.4,
          }}
        >
          <TriangleAlert
            size={14}
            strokeWidth="var(--icon-stroke)"
            aria-hidden
            style={{ flex: '0 0 auto', color: 'var(--color-warning)', marginTop: '2px' }}
          />
          <span>
            <strong>Atención:</strong> El capítulo &ldquo;{hipertrofico.titulo}&rdquo; concentra más de la mitad del trabajo total ({totalPalabras > 0 ? Math.round((hipertrofico.palabras / totalPalabras) * 100) : 0}%).
          </span>
        </div>
      )}

      {raices.length === 0 ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          No hay capítulos H1 para calcular distribución.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {raices.map((cap) => {
            const pct = totalPalabras > 0 ? Math.round((cap.palabras / totalPalabras) * 100) : 0;
            const esActivo = nodoSeleccionadoId === cap.id;
            const esAlerta = pct > 50;

            return (
              <div
                key={cap.id}
                onClick={() => onSelect?.(cap.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: esActivo ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                  cursor: onSelect ? 'pointer' : 'default',
                  border: '1px solid',
                  borderColor: esActivo ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                  transition: 'background var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={cap.titulo}
                  >
                    H1 · {cap.titulo}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {miles(cap.palabras)} ({pct}%)
                  </span>
                </div>
                <div
                  data-testid="bar-bg"
                  style={{
                    width: '100%',
                    height: 'var(--space-2)',
                    backgroundColor: 'var(--color-bg-surface-alt)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    data-testid="bar-fill"
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      minWidth: pct > 0 ? '2px' : 0,
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: esAlerta ? 'var(--color-warning)' : 'var(--color-accent)',
                      transformOrigin: 'left',
                      transition: 'transform var(--transition-fast)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default DistribucionVolumen;
