/* WordAPA7 — NodoIndice
 *
 * Una fila del esquema lateral. La jerarquía se VE: el H1 manda (Outfit, 700,
 * 13.5px) y cada nivel baja peso y cuerpo, con un conector vertical que marca
 * la pertenencia. Antes las tres filas eran `text-xs` y solo se distinguían
 * por la sangría, que es lo contrario de una jerarquía.
 *
 * TOKENS, NO HEX. La comparación entre hermanas la dibuja `BarraBalance`.
 */

import React from 'react';
import type { DiagnosticoRama, NodoJerarquia } from '../../lib/jerarquia';
import { BarraBalance } from './BarraBalance';

export interface NodoIndiceProps {
  nodo: NodoJerarquia;
  diagnostico: DiagnosticoRama;
  profundidad?: number;
  onSelect?: (nodo: NodoJerarquia) => void;
  seleccionado?: boolean;
  /** Título ya numerado por id de elemento; sin él se usa el crudo del autor. */
  titulo?: string;
}

const estiloTitulo = (nivel: number): React.CSSProperties =>
  nivel === 1
    ? { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '13.5px' }
    : nivel === 2
      ? { fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: '13px' }
      : { fontFamily: 'var(--font-sans)', fontWeight: 400, fontSize: '12.5px' };

export const NodoIndice: React.FC<NodoIndiceProps> = ({
  nodo,
  diagnostico,
  profundidad = 0,
  onSelect,
  seleccionado = false,
  titulo,
}) => {
  const balance = diagnostico?.balance ?? null;
  const motivo = diagnostico?.motivo ?? 'Rama desbalanceada';
  const problema = (diagnostico?.salud ?? 'completa') !== 'completa';
  const texto = titulo ?? nodo.titulo;

  return (
    <div
      role="listitem"
      className="nodo-indice-row"
      onClick={() => onSelect?.(nodo)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        padding: 'var(--space-2) var(--space-3)',
        paddingLeft: `calc(var(--space-3) + ${profundidad} * var(--space-4))`,
        cursor: onSelect ? 'pointer' : 'default',
        borderLeft: '2px solid transparent',
        background: seleccionado
          ? 'var(--color-accent-soft)'
          : nodo.nivel === 1
            ? 'var(--color-bg-surface-alt)'
            : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
        <span
          style={{
            flex: '0 0 auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 600,
            color: nodo.nivel === 1 ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
            border: nodo.nivel === 1 ? '1px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 4px',
            lineHeight: '16px',
          }}
        >
          H{nodo.nivel}
        </span>
        <span
          style={{
            ...estiloTitulo(nodo.nivel),
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={texto}
        >
          {texto}
        </span>
      </div>

      {balance || problema ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {balance ? (
            <BarraBalance
              palabras={nodo.palabras}
              escala={balance.mayor}
              laMasLarga={balance.laMasLarga}
              nombre={texto}
            />
          ) : null}
          {problema ? (
            <span
              role="img"
              aria-label={motivo}
              title={motivo}
              style={{
                flex: '0 0 auto',
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-warning)',
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default NodoIndice;
