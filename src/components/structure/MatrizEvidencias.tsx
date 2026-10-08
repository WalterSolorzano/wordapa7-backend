/* WordAPA7 — Matriz de Evidencias y Rigor Académico.
 *
 * Módulo 2 de Estructura: tabla comparativa por capítulo (Capítulo | Citas | Figuras | Tablas)
 * y diagnóstico automático de vacíos empíricos en Metodología o Marco Teórico.
 */

import React from 'react';
import { TableProperties, TriangleAlert } from 'lucide-react';
import type { NodoJerarquia } from '../../lib/jerarquia';

export interface MatrizEvidenciasProps {
  raices: readonly NodoJerarquia[];
  nodoSeleccionadoId?: string | null;
  onSelect?: (nodoId: string) => void;
}

export const MatrizEvidencias: React.FC<MatrizEvidenciasProps> = ({
  raices,
  nodoSeleccionadoId,
  onSelect,
}) => {
  // Detección de vacíos empíricos en metodología o marco teórico
  const vaciosCriticos = raices.filter((n) => {
    const esMetodologia = n.fase === 'metodo' || /metodolog[ií]a|m[eé]todo/i.test(n.titulo);
    const esMarcoTeorico =
      n.fase === 'marco_teorico' ||
      /marco\s+te[oó]rico|marco\s+referencial|antecedentes|revisi[oó]n\s+de\s+la\s+literatura|teor[ií]a/i.test(n.titulo);
    return (esMetodologia || esMarcoTeorico) && n.citas === 0;
  });

  return (
    <section
      aria-label="Matriz de Evidencias y Rigor Académico"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        paddingTop: 'var(--space-3)',
        borderTop: '1px solid var(--color-border-subtle)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <TableProperties size={15} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
          }}
        >
          Matriz de evidencias y rigor
        </h3>
      </div>

      {vaciosCriticos.map((n) => {
        const esMetodo = n.fase === 'metodo' || /metodolog[ií]a|m[eé]todo/i.test(n.titulo);
        return (
          <div
            key={`vacio-${n.id}`}
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
              <strong>Hallazgo crítico:</strong> El capítulo de &ldquo;{n.titulo}&rdquo; no cuenta con citas de respaldo {esMetodo ? 'metodológico' : 'conceptual'}.
            </span>
          </div>
        );
      })}

      {raices.length === 0 ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          No hay capítulos H1 para evaluar evidencias.
        </span>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-surface-alt)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-xs)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', color: 'var(--color-text-tertiary)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Capítulo</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Citas</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Figuras</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Tablas</th>
              </tr>
            </thead>
            <tbody>
              {raices.map((cap) => {
                const esActivo = nodoSeleccionadoId === cap.id;
                return (
                  <tr
                    key={cap.id}
                    onClick={() => onSelect?.(cap.id)}
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      backgroundColor: esActivo ? 'var(--color-accent-soft)' : 'transparent',
                      cursor: onSelect ? 'pointer' : 'default',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <td
                      style={{
                        padding: '6px 8px',
                        fontWeight: 600,
                        color: 'var(--color-text-primary)',
                        maxWidth: '120px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={cap.titulo}
                    >
                      H1 · {cap.titulo}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {cap.citas === 0 ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '1px 5px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: 'var(--color-warning-a12)',
                            color: 'var(--color-warning)',
                            fontWeight: 700,
                            border: '1px solid var(--color-warning-a40)',
                          }}
                        >
                          <TriangleAlert size={10} strokeWidth="var(--icon-stroke)" aria-hidden />
                          0
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          {cap.citas}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {cap.figuras}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {cap.tablas}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default MatrizEvidencias;
