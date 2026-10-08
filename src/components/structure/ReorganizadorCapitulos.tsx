/* WordAPA7 — Reorganizador Quirúrgico en Caliente.
 *
 * Módulo 3 de Estructura: lista interactiva de capítulos H1 con botones ▲ y ▼,
 * conectado a reorderElements del backend que mueve el capítulo completo con
 * todos sus párrafos, figuras y subsecciones sin perder nada.
 */

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2 } from 'lucide-react';
import type { ElementModel } from '../../types';
import type { NodoJerarquia } from '../../lib/jerarquia';
import { moverRama } from './InspectorRama';
import { useDocStore } from '../../store/useDocStore';

export interface ReorganizadorCapitulosProps {
  raices: readonly NodoJerarquia[];
  elementos: readonly ElementModel[];
  nodoSeleccionadoId?: string | null;
  onSelect?: (nodoId: string) => void;
}

export const ReorganizadorCapitulos: React.FC<ReorganizadorCapitulosProps> = ({
  raices,
  elementos,
  nodoSeleccionadoId,
  onSelect,
}) => {
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const reordenar = async (cap: NodoJerarquia, direccion: 'arriba' | 'abajo') => {
    const nuevoOrden = moverRama(cap, elementos, direccion);
    if (!nuevoOrden) return;
    try {
      setProcesandoId(cap.id);
      await useDocStore.getState().reorderElements(nuevoOrden);
      useDocStore.getState().showToast(`Capítulo "${cap.titulo}" movido hacia ${direccion}`, 'info');
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <section
      aria-label="Reorganizador Quirúrgico en Caliente"
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
          <ArrowUpDown size={15} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-accent)' }} />
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            Reorganizador en caliente
          </h3>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {raices.length} capítulos
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 1.3 }}>
        Mueve el capítulo íntegro junto con sus párrafos, figuras y subsecciones entre sus hermanas.
      </p>

      {raices.length === 0 ? (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          No hay capítulos H1 para reordenar.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          {raices.map((cap) => {
            const puedeSubir = moverRama(cap, elementos, 'arriba') !== null;
            const puedeBajar = moverRama(cap, elementos, 'abajo') !== null;
            const estaProcesando = procesandoId === cap.id;
            const esActivo = nodoSeleccionadoId === cap.id;

            return (
              <div
                key={cap.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-1) var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: esActivo ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                  border: '1px solid',
                  borderColor: esActivo ? 'var(--color-accent)' : 'var(--color-border-subtle)',
                }}
              >
                <span
                  onClick={() => onSelect?.(cap.id)}
                  style={{
                    flex: '1 1 auto',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: onSelect ? 'pointer' : 'default',
                  }}
                  title={cap.titulo}
                >
                  H1 · {cap.titulo}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  {estaProcesando ? (
                    <Loader2 size={13} strokeWidth="var(--icon-stroke)" aria-hidden style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!puedeSubir}
                        title={`Subir capítulo "${cap.titulo}"`}
                        aria-label={`Subir ${cap.titulo}`}
                        onClick={() => void reordenar(cap, 'arriba')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          background: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: puedeSubir ? 'pointer' : 'not-allowed',
                          opacity: puedeSubir ? 1 : 0.4,
                          color: 'var(--color-text-secondary)',
                          transition: 'background var(--transition-fast)',
                        }}
                      >
                        <ArrowUp size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={!puedeBajar}
                        title={`Bajar capítulo "${cap.titulo}"`}
                        aria-label={`Bajar ${cap.titulo}`}
                        onClick={() => void reordenar(cap, 'abajo')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '28px',
                          height: '28px',
                          padding: 0,
                          background: 'var(--color-bg-surface)',
                          border: '1px solid var(--color-border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: puedeBajar ? 'pointer' : 'not-allowed',
                          opacity: puedeBajar ? 1 : 0.4,
                          color: 'var(--color-text-secondary)',
                          transition: 'background var(--transition-fast)',
                        }}
                      >
                        <ArrowDown size={13} strokeWidth="var(--icon-stroke)" aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ReorganizadorCapitulos;
